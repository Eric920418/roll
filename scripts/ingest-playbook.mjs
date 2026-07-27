// Playbook ingest：把 PDF 知識文件轉成「分段 + 每段附選擇題題庫」的雙語 JSON。
//
// 用法：
//   pnpm ingest:playbook                 # 掃 content/playbooks/_inbox/*.pdf（處理後移到 _done/）
//   pnpm ingest:playbook <path-to.pdf>   # 指定單一 PDF
//
// 流程（零脆弱巢狀 schema）：
//   Stage 1  PDF → 扁平 body_en/body_zh markdown（紅標 = ## 標題）。
//   本地切段  以 ^## 把 body 切成 segments（一個紅標 = 一段），en/zh 依序對齊。
//   Stage 2  把 segments 丟回 Claude → 每段 2 題選擇題（扁平陣列）→ 組回各段 questions[]。
// key 從 .env.local「明讀」，避免 shell 已匯出的 ANTHROPIC_API_KEY 蓋掉檔案值（見 README）。
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
const QUESTIONS_PER_SEGMENT = 2;

// ---- 通用：串流呼叫 + 自行累加 tool 輸入的 partial_json（大型 tool input 用 finalMessage 重組會出錯）----
async function streamToolJson(messages, tool) {
  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages,
  });
  let buf = "";
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") {
      buf += ev.delta.partial_json;
    }
  }
  const final = await stream.finalMessage();
  try {
    return JSON.parse(buf);
  } catch (e) {
    throw new Error(
      `${tool.name} JSON 解析失敗（stop=${final.stop_reason}, out_tokens=${final.usage?.output_tokens}, len=${buf.length}）：${e.message}`,
    );
  }
}

const slugify = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// 以 ^## 把 markdown 切段；回 { pre, segs:[{heading, body}] }
function splitOnH2(md) {
  const lines = String(md || "").split("\n");
  const segs = [];
  const pre = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      if (cur) segs.push(cur);
      cur = { heading: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    } else {
      pre.push(line);
    }
  }
  if (cur) segs.push(cur);
  return {
    pre: pre.join("\n").trim(),
    segs: segs.map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() })),
  };
}

// ---- Stage 1：PDF → 扁平雙語 body ----
const dualPlaybookTool = {
  name: "emit_playbook",
  description: "Emit the cleaned, bilingual playbook parsed from the attached document.",
  input_schema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "short kebab-case English id" },
      category: { type: "string", enum: CATEGORIES },
      title_en: { type: "string" },
      title_zh: { type: "string", description: "Traditional Chinese title" },
      summary_en: { type: "string", description: "one sentence: what a founder gains" },
      summary_zh: { type: "string", description: "Traditional Chinese, one sentence" },
      body_en: {
        type: "string",
        description:
          "FULL content as Markdown. The document uses RED headings to mark each major section — turn EACH red heading into a '## ' heading, in order. Do NOT promote black/bold sub-labels to headings (keep them inline **bold**). Lists → markdown lists, comparisons → tables.",
      },
      body_zh: {
        type: "string",
        description: "Traditional Chinese full content as Markdown, SAME '## ' section structure as body_en.",
      },
    },
    required: ["slug", "category", "title_en", "title_zh", "summary_en", "summary_zh", "body_en", "body_zh"],
  },
};

const STAGE1_PROMPT = `You are ingesting a ROLL ON knowledge document (a business / fundraising playbook) into a bilingual knowledge base powering an AI assistant and member-facing guide pages.

Read the attached PDF and emit a clean, faithful version via the emit_playbook tool.
- The document uses RED headings to mark each major section. Turn EACH red heading into a "## " heading in body_en and body_zh, in document order. Do NOT turn black/bold sub-labels (e.g. "**Equity Investment**") into headings — keep those inline.
- body_en and body_zh must contain the FULL document (every section), not a summary. body_zh is a faithful Traditional Chinese translation with the SAME "## " section structure. Keep established English finance terms with a short zh gloss where helpful, e.g. "Convertible（可轉換債）".
- Do not add facts not in the document. Do not invent ROLL ON pricing or promises.
- summary: one sentence on what a founder gains. slug: short kebab-case. category: best fit from the allowed list.
Output ONLY via the emit_playbook tool.`;

// ---- Stage 2：segments → 每段選擇題題庫 ----
const questionsTool = {
  name: "emit_questions",
  description: "Emit multiple-choice questions testing understanding of each playbook segment.",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            segmentKey: { type: "string", description: "exactly the segmentKey given for the segment this question tests" },
            question_en: { type: "string" },
            question_zh: { type: "string" },
            options_en: { type: "array", items: { type: "string" }, description: "exactly 4 options" },
            options_zh: { type: "array", items: { type: "string" }, description: "exactly 4 options, same order as options_en" },
            answerIndex: { type: "integer", description: "0-3, index of the correct option" },
            explanation_en: { type: "string", description: "one sentence why the answer is correct" },
            explanation_zh: { type: "string" },
          },
          required: ["segmentKey", "question_en", "question_zh", "options_en", "options_zh", "answerIndex", "explanation_en", "explanation_zh"],
        },
      },
    },
    required: ["questions"],
  },
};

async function generateQuestions(segments) {
  const segText = segments
    .map((s) => `[segmentKey: ${s.key}] ${s.heading.en}\n${s.body.en}`)
    .join("\n\n---\n\n");
  const prompt = `Below are the segments of a ROLL ON fundraising playbook (segmentKey + heading + content).
For EACH segment, write ${QUESTIONS_PER_SEGMENT} multiple-choice questions that test understanding of THAT segment's content.
- Exactly 4 options each; exactly one correct; answerIndex is 0-3.
- Bilingual: question / all 4 options / explanation in both English (en) and Traditional Chinese (zh). options_zh must be the same order as options_en.
- Ground every question strictly in the segment content — do not invent facts.
- Set segmentKey to exactly the key given for that segment.
Output ONLY via the emit_questions tool.

SEGMENTS:
${segText}`;
  const raw = await streamToolJson([{ role: "user", content: [{ type: "text", text: prompt }] }], questionsTool);
  return Array.isArray(raw.questions) ? raw.questions : [];
}

async function ingestOne(pdfPath) {
  const data = fs.readFileSync(pdfPath).toString("base64");

  // Stage 1：body
  const raw = await streamToolJson(
    [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
          { type: "text", text: STAGE1_PROMPT },
        ],
      },
    ],
    dualPlaybookTool,
  );
  if (!raw.slug || !raw.body_en || !raw.body_zh) {
    throw new Error(`emit_playbook 輸出缺欄位（keys=[${Object.keys(raw || {}).join(",")}]）`);
  }
  const slug = slugify(raw.slug);

  // 本地切段
  const en = splitOnH2(raw.body_en);
  const zh = splitOnH2(raw.body_zh);
  const count = Math.max(en.segs.length, zh.segs.length);
  const segments = [];
  const usedKeys = new Set();

  // 首個 ## 之前若有前言，收成一段 overview
  if (en.pre || zh.pre) {
    const key = "overview";
    usedKeys.add(key);
    segments.push({
      key,
      order: 0,
      heading: { en: "Overview", "zh-tw": "概覽" },
      body: { en: en.pre, "zh-tw": zh.pre },
      questions: [],
    });
  }
  for (let i = 0; i < count; i++) {
    const e = en.segs[i];
    const z = zh.segs[i];
    const heading = {
      en: e?.heading || z?.heading || `Section ${i + 1}`,
      "zh-tw": z?.heading || e?.heading || `第 ${i + 1} 段`,
    };
    let key = slugify(heading.en) || `section-${i + 1}`;
    while (usedKeys.has(key)) key = `${key}-${i + 1}`;
    usedKeys.add(key);
    segments.push({
      key,
      order: segments.length,
      heading,
      body: { en: e?.body || "", "zh-tw": z?.body || "" },
      questions: [],
    });
  }

  // Stage 2：題庫
  const rawQuestions = await generateQuestions(segments);
  const byKey = new Map(segments.map((s) => [s.key, s]));
  for (const q of rawQuestions) {
    const seg = byKey.get(q.segmentKey);
    if (!seg) continue;
    const optsEn = Array.isArray(q.options_en) ? q.options_en.slice(0, 4) : [];
    const optsZh = Array.isArray(q.options_zh) ? q.options_zh.slice(0, 4) : [];
    if (optsEn.length < 2) continue;
    const options = optsEn.map((o, i) => ({ en: o, "zh-tw": optsZh[i] ?? o }));
    const answerIndex = Math.min(Math.max(0, Number(q.answerIndex) || 0), options.length - 1);
    seg.questions.push({
      id: `${seg.key}-q${seg.questions.length + 1}`,
      question: { en: q.question_en, "zh-tw": q.question_zh },
      options,
      answerIndex,
      explanation: { en: q.explanation_en, "zh-tw": q.explanation_zh },
    });
  }

  const pb = {
    slug,
    category: CATEGORIES.includes(raw.category) ? raw.category : "general",
    title: { en: raw.title_en, "zh-tw": raw.title_zh },
    summary: { en: raw.summary_en, "zh-tw": raw.summary_zh },
    segments,
    source: { file: path.basename(pdfPath), ingestedAt: new Date().toISOString(), model },
  };
  fs.mkdirSync(PLAYBOOKS_DIR, { recursive: true });
  const outPath = path.join(PLAYBOOKS_DIR, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(pb, null, 2) + "\n");
  const qCount = segments.reduce((n, s) => n + s.questions.length, 0);
  return { outPath, pb, qCount };
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
    const { outPath, pb, qCount } = await ingestOne(p);
    console.log(`✅ ${path.relative(ROOT, outPath)}  [${pb.category}] ${pb.segments.length} 段 / ${qCount} 題`);
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
