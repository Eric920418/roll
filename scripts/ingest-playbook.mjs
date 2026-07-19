// Playbook ingest：把 PDF 知識文件轉成雙語結構化 JSON，存進 content/playbooks/<slug>.json。
//
// 用法：
//   pnpm ingest:playbook                 # 掃 content/playbooks/_inbox/*.pdf（處理後移到 _done/）
//   pnpm ingest:playbook <path-to.pdf>   # 指定單一 PDF
//
// 機制：PDF 餵給 Claude（強制 emit_playbook 工具、扁平 schema → 可靠的雙語輸出），零其他依賴。
// key 從 .env.local「明讀」，避免 shell 已匯出的 ANTHROPIC_API_KEY 蓋掉檔案值（見 README 警告）。
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = process.cwd();
const PLAYBOOKS_DIR = path.join(ROOT, "content/playbooks");
const INBOX = path.join(PLAYBOOKS_DIR, "_inbox");
const DONE = path.join(INBOX, "_done");

function readEnvLocal(name) {
  try {
    const t = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    const m = t.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* 無 .env.local 時退回 process.env */
  }
  return undefined;
}

const apiKey = readEnvLocal("ANTHROPIC_API_KEY") || process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("❌ 找不到 ANTHROPIC_API_KEY（請確認 .env.local 有設）");
  process.exit(1);
}
const model = readEnvLocal("ANTHROPIC_MODEL") || "claude-sonnet-5";
const client = new Anthropic({ apiKey });

const CATEGORIES = [
  "fundraising",
  "investor-access",
  "market-entry",
  "legal",
  "marketing",
  "sales-channel",
  "operations",
  "general",
];

// 扁平 schema：不用巢狀陣列，模型最不會出錯。章節結構放進 body 的 markdown（## 標題）。
const emitTool = {
  name: "emit_playbook",
  description: "Emit the cleaned, bilingual playbook parsed from the attached document.",
  input_schema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "short kebab-case English id, e.g. 'investment-readiness'" },
      category: { type: "string", enum: CATEGORIES },
      title_en: { type: "string" },
      title_zh: { type: "string", description: "Traditional Chinese title" },
      summary_en: { type: "string", description: "one sentence: what a founder gains from this playbook" },
      summary_zh: { type: "string", description: "Traditional Chinese, one sentence" },
      body_en: {
        type: "string",
        description: "FULL content as Markdown. Use ## for each section heading, plus lists, tables, bold. Preserve all substantive content.",
      },
      body_zh: {
        type: "string",
        description: "Traditional Chinese full content as Markdown, same structure/sections as body_en.",
      },
    },
    required: ["slug", "category", "title_en", "title_zh", "summary_en", "summary_zh", "body_en", "body_zh"],
  },
};

const PROMPT = `You are ingesting a ROLL ON knowledge document (a business / fundraising playbook) into a bilingual knowledge base that powers both an AI assistant and member-facing guide pages.

Read the attached PDF and emit a clean, faithful version via the emit_playbook tool.
- Preserve ALL substantive content and structure. Turn each numbered section into a "## Heading", lists into markdown lists, comparisons into markdown tables.
- body_en and body_zh must contain the FULL document (all sections), not a summary. body_zh is a faithful Traditional Chinese translation with the same structure. Keep established English finance terms with a short zh gloss where helpful, e.g. "Convertible（可轉換債）".
- Do not add facts that aren't in the document. Do not invent ROLL ON pricing or promises.
- summary_en/summary_zh: one sentence describing what a founder gains.
- slug: short, descriptive, kebab-case.
- category: the single best fit from the allowed list.
Output ONLY via the emit_playbook tool.`;

async function ingestOne(pdfPath) {
  const data = fs.readFileSync(pdfPath).toString("base64");
  // 串流 + 自行累加 tool 輸入的 partial_json（大型 tool input 用 finalMessage 重組會出錯）。
  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    tools: [emitTool],
    tool_choice: { type: "tool", name: "emit_playbook" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  let jsonBuf = "";
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
      jsonBuf += ev.delta.partial_json;
    }
  }
  const final = await stream.finalMessage();

  let raw;
  try {
    raw = JSON.parse(jsonBuf);
  } catch (e) {
    throw new Error(
      `tool JSON 解析失敗（stop=${final.stop_reason}, out_tokens=${final.usage?.output_tokens}, len=${jsonBuf.length}）：${e.message}`,
    );
  }
  if (!raw.slug || !raw.body_en || !raw.body_zh) {
    throw new Error(
      `emit_playbook 輸出缺欄位（stop=${final.stop_reason}, keys=[${Object.keys(raw || {}).join(",")}]）`,
    );
  }

  const slug = String(raw.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const pb = {
    slug,
    category: CATEGORIES.includes(raw.category) ? raw.category : "general",
    title: { en: raw.title_en, "zh-tw": raw.title_zh },
    summary: { en: raw.summary_en, "zh-tw": raw.summary_zh },
    body: { en: raw.body_en, "zh-tw": raw.body_zh },
    source: { file: path.basename(pdfPath), ingestedAt: new Date().toISOString(), model },
  };
  fs.mkdirSync(PLAYBOOKS_DIR, { recursive: true });
  const outPath = path.join(PLAYBOOKS_DIR, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(pb, null, 2) + "\n");
  return { outPath, pb };
}

const args = process.argv.slice(2);
const pdfs = args.length
  ? args
  : fs.existsSync(INBOX)
    ? fs.readdirSync(INBOX).filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => path.join(INBOX, f))
    : [];

if (pdfs.length === 0) {
  console.log("沒有要處理的 PDF。把檔案放進 content/playbooks/_inbox/ 或用參數指定路徑。");
  process.exit(0);
}

let ok = 0;
for (const p of pdfs) {
  process.stdout.write(`→ ${path.basename(p)} … `);
  try {
    const { outPath, pb } = await ingestOne(p);
    const chars = pb.body.en.length + pb.body["zh-tw"].length;
    console.log(`✅ ${path.relative(ROOT, outPath)}  [${pb.category}] ${chars} 字（雙語）`);
    if (path.dirname(p) === INBOX) {
      fs.mkdirSync(DONE, { recursive: true });
      fs.renameSync(p, path.join(DONE, path.basename(p)));
    }
    ok++;
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }
}
console.log(`\n完成：${ok}/${pdfs.length} 份。`);
