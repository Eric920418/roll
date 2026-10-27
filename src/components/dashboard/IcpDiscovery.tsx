"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GuidedQuestions from "./GuidedQuestions";
import { readGuidedProgress, type GuidedProgress } from "@/lib/guided-questions";
import { readAdminResponse } from "@/lib/cms/admin-response";
import { EMPTY_GUESS, guessSchema, icpToGuess, guessToIcp, type IcpGuess, type DiscoveryState, type DiscoveryInput } from "@/lib/icp/discovery";
import { EMPTY_ICP, hasIcp, type IcpWorkspaceView } from "@/lib/icp/schema";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import { notifyPlanChanged } from "./PlanRefresh";
const examples = {
  en: ["Founder of a 1–10 person AI or SaaS startup", "Not knowing who to sell to or what to do next", "They have an MVP but no paying customers", "Use ChatGPT, spreadsheets, and cold emails"],
  "zh-tw": ["1–10 人 AI 或 SaaS 新創的創辦人", "不知道該賣給誰、下一步該做什麼", "已有 MVP，但還沒有付費客戶", "使用 ChatGPT、試算表與陌生開發郵件"],
};
const guessKeys = ["customer", "struggle", "situation", "workaround"] as const;
export default function IcpDiscovery({ userId, canUseAi, onUpdated, savedVersion }: { userId: string; canUseAi: boolean; onUpdated: (view: IcpWorkspaceView) => void; savedVersion?: number }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", router = useRouter();
  const [workspace, setWorkspace] = useState<IcpWorkspaceView | null>(null), [path, setPath] = useState<DiscoveryState["path"] | null>(null), [guess, setGuess] = useState<IcpGuess>({ ...EMPTY_GUESS }), [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [guideSession, setGuideSession] = useState(0);
  const guide = useRef<GuidedProgress | undefined>(undefined);
  const [initialGuide, setInitialGuide] = useState<GuidedProgress | undefined>(undefined), [baseVersion, setBaseVersion] = useState(0);
  const sending = useRef(false), pendingRequest = useRef<{ id: string; payload: string } | null>(null);
  const key = `nova:icp-discovery:${userId}`;
  const accept = useCallback((v: IcpWorkspaceView) => { setWorkspace(v); onUpdated(v); }, [onUpdated]);
  async function request(method = "GET", data?: object) {
    return await readAdminResponse(await fetch(`/api/account/icp?locale=${locale}`, { method, cache: "no-store", ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) })) as IcpWorkspaceView;
  }
  async function reload(restore = false) {
    try {
      const next = await request(); accept(next);
      if (restore) {
        const d = next.discovery;
        let nextPath = d?.path || (next.saved || next.draft ? "guess" : null);
        let nextGuess = icpToGuess(next.saved || next.draft, d?.guess || d?.input?.guess);
        let nextProduct = d?.input?.product || next.productDescription || "";
        setBaseVersion(next.profileVersion);
        try {
          const cached = JSON.parse(localStorage.getItem(key) || "null");
          if (cached && ["guess", "suggest", "discovery"].includes(cached.path)) {
            const parsed = guessSchema.safeParse(cached.guess);
            if (parsed.success) {
              nextPath = cached.path; nextGuess = icpToGuess(next.saved || next.draft, parsed.data);
              nextProduct = typeof cached.product === "string" && cached.product.trim() ? cached.product.slice(0, 600) : nextProduct;
              guide.current = readGuidedProgress(cached.guide); setInitialGuide(guide.current);
              if (Number.isInteger(cached.profileVersion)) setBaseVersion(cached.profileVersion);
            }
          }
        } catch { setNotice(zh ? "無法恢復本機輸入，已儲存資料仍保留。" : "Local input could not be restored. Saved data is retained."); }
        setPath(nextPath); setGuess(nextGuess); setProduct(nextProduct); setLoaded(true);
      }
      return next;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => { const timer = setTimeout(() => void reload(true), 0); return () => clearTimeout(timer); /* Restore once, polling must not overwrite local answers. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, locale]);
  useEffect(() => { if (!workspace?.pending) return; const timer = setInterval(() => void reload(), 3000); return () => clearInterval(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.pending]);
  useEffect(() => {
    if (!loaded || savedVersion === undefined || savedVersion === workspace?.currentProfileVersion) return;
    const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer);
    // A saved-profile refresh must preserve local answers and the complete error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVersion, loaded, workspace?.currentProfileVersion]);
  function remember(nextPath: DiscoveryState["path"] | null, nextGuess = guess, nextProduct = product, nextVersion = baseVersion) {
    try { localStorage.setItem(key, JSON.stringify({ path: nextPath, guess: nextGuess, product: nextProduct, guide: guide.current, profileVersion: nextVersion })); }
    catch { setNotice(zh ? "無法暫存輸入，離開前請先完成確認儲存。" : "Local storage unavailable. Confirm and save before leaving."); }
  }
  function choose(nextPath: DiscoveryState["path"]) { guide.current = undefined; setInitialGuide(undefined); setGuideSession(value => value + 1); setPath(nextPath); remember(nextPath); }
  function adoptGuess(value: IcpGuess) {
    const next = icpToGuess(workspace?.saved || null, value);
    setGuess(next); guide.current = undefined; setInitialGuide(undefined); setGuideSession(session => session + 1); setPath("guess"); remember("guess", next);
  }
  async function mutate(action: "save" | "discover", selectedPath: DiscoveryState["path"], mode?: DiscoveryInput["mode"]) {
    if (sending.current || !workspace || workspace.pending) return;
    sending.current = true; setBusy(true); setError(""); setNotice("");
    const discovery: DiscoveryState = { ...(workspace.discovery?.path === selectedPath ? workspace.discovery : {}), path: selectedPath, guess };
    const base = workspace.saved || workspace.draft || { ...EMPTY_ICP, summary: workspace.legacy || "" };
    const content = { action, revision: workspace.revision, locale, ...(action === "discover" ? { discovery: { mode, guess, product } } : { profileVersion: baseVersion, discovery, draft: guessToIcp(guess, base) }) };
    const payload = JSON.stringify(content);
    if (pendingRequest.current?.payload !== payload) pendingRequest.current = { id: crypto.randomUUID(), payload };
    try {
      const next = await request(action === "discover" ? "POST" : "PATCH", { ...content, requestId: pendingRequest.current!.id });
      accept(next); pendingRequest.current = null; setPath(selectedPath);
      if (action === "save") {
        setBaseVersion(next.profileVersion);
        setNotice(zh ? "ICP 已確認儲存。" : "ICP confirmed and saved.");
        guide.current = { questionId: null, skipped: [] }; remember("guess", guess, product, next.profileVersion);
        notifyPlanChanged(userId); router.refresh();
      } else remember(selectedPath);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); await reload(); }
    finally { sending.current = false; setBusy(false); }
  }
  const disabled = busy || !loaded || !workspace || workspace.pending, result = workspace?.discovery?.result;
  const base = workspace?.saved || workspace?.draft || { ...EMPTY_ICP, summary: workspace?.legacy || "" };
  const preview = guessToIcp(guess, base);
  const stale = Boolean(workspace && baseVersion !== workspace.currentProfileVersion);
  const labels = zh ? ["你最想幫助哪一種客戶？", "他們最想解決什麼困難？", "什麼情況下會遇到這個困難？", "他們現在如何解決？"] : ["Who do you most want to help?", "What problem do they most want to solve?", "When does this problem occur?", "How do they solve it today?"];
  const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-dark/20 px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
  const field = "mt-2 min-h-11 w-full rounded-lg border border-dark/15 bg-white px-3 py-3 text-sm text-dark placeholder:text-dark/40 focus-visible:outline-2 focus-visible:outline-offset-2";
  return <div id="icp-start" tabIndex={-1} className="scroll-mt-8">
    <h2 className="text-sm font-semibold uppercase tracking-wider">{zh ? "建立或更新 ICP" : "Create or update your ICP"}</h2>
    <p className="mt-3 text-sm text-dark/60">{zh ? "一次回答一題；已有資料不重問，不知道可以跳過。最後確認後才更新已儲存的 ICP。" : "One question at a time. Known details are carried over; skip anything unknown. Your saved ICP changes only after you confirm."}</p>
    {!loaded && !error && <p role="status" className="mt-4 text-sm">{zh ? "載入已知資料…" : "Loading known details…"}</p>}
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={zh ? "選擇 ICP 起點" : "Choose your ICP starting point"}>{(["guess", "suggest", "discovery"] as const).map((value, i) => <button key={value} type="button" aria-pressed={path === value} disabled={disabled} className={`${button} ${path === value ? "bg-black text-white" : "bg-white"}`} onClick={() => choose(value)}>{(zh ? ["引導我整理客戶方向", "請 AI 建議客戶", "從訪談證據整理"] : ["Guide my customer hypothesis", "Suggest customers with AI", "Use interview evidence"])[i]}</button>)}</div>
    {loaded && path === "guess" && <div className="mt-5"><GuidedQuestions key={guideSession} initialProgress={initialGuide} disabled={disabled} confirmDisabled={!hasIcp(preview) || stale}
      questions={guessKeys.map((keyName, i) => ({ id: keyName, label: labels[i], value: guess[keyName], hint: zh ? "先寫你知道的；不確定可以跳過，不會清空已儲存的內容。" : "Start with what you know. Skipping never clears saved details.", input: <textarea aria-label={labels[i]} rows={3} maxLength={500} value={guess[keyName]} placeholder={examples[locale][i]} className={field} onChange={event => { const next = { ...guess, [keyName]: event.target.value }; setGuess(next); remember(path, next); }} /> }))}
      onProgress={progress => { guide.current = progress; remember(path); }} onConfirm={() => void mutate("save", "guess")} confirmLabel={zh ? "確認並儲存 ICP" : "Confirm and save ICP"}>
      <div className="rounded-lg bg-dark/5 p-4"><p className="text-sm font-semibold">{zh ? "將儲存的 ICP 摘要" : "ICP summary to save"}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{preview.summary || (zh ? "尚無可儲存資料；請補充一項已知資訊，或先記錄客戶訪談。" : "No information to save yet. Add a known detail or start with customer interviews.")}</p>
        {(["stage", "location", "channels"] as const).map((fieldName, i) => preview[fieldName] ? <p key={fieldName} className="mt-2 whitespace-pre-wrap break-words text-sm">{(zh ? ["客戶階段", "客戶市場", "接觸管道"] : ["Customer stage", "Customer markets", "Channels"])[i]}: {preview[fieldName]}</p> : null)}
      </div>
      {canUseAi && <button type="button" disabled={disabled || !guess.customer.trim() && !guess.struggle.trim()} className={button} onClick={() => void mutate("discover", "guess", "sharpen")}>{zh ? "請 POLARIS 聚焦（產生草稿，不儲存 ICP）" : "Sharpen with POLARIS (draft only)"}</button>}
    </GuidedQuestions></div>}
    {loaded && path === "suggest" && <div className="mt-5"><GuidedQuestions key={`product:${guideSession}`} initialProgress={initialGuide} disabled={disabled} confirmDisabled={!canUseAi || product.trim().length < 10}
      questions={[{ id: "product", label: result?.question || (zh ? "你的產品幫忙解決什麼？" : "What does your product help with?"), value: product, hint: zh ? "已帶入公司檔案的產品介紹；不知道可以跳過並改從訪談開始。" : "Your saved product description is carried over. You can skip and start with interviews instead.", input: <textarea aria-label={zh ? "用一句話描述產品" : "Describe your product in one sentence"} rows={3} maxLength={600} value={product} className={field} onChange={e => { setProduct(e.target.value); remember(path, guess, e.target.value); }} /> }]}
      onProgress={progress => { guide.current = progress; remember(path); }} onConfirm={() => void mutate("discover", "suggest", "suggest")} confirmLabel={zh ? "提供客戶建議（不儲存 ICP）" : "Suggest customers (does not save ICP)"}>
      {product.trim().length < 10 && <p className="text-sm text-dark/60">{zh ? "提供建議至少需要 10 個字的產品介紹。還不知道，可以選「從訪談證據整理」。" : "Suggestions need a product description of at least 10 characters. You can start with interview evidence instead."}</p>}
      {result?.question && <button type="button" className={button} disabled={disabled} onClick={() => { guide.current = { questionId: "product", skipped: [] }; setInitialGuide(guide.current); setGuideSession(value => value + 1); }}>{zh ? "補充回答這個問題" : "Answer this clarification"}: {result.question}</button>}
    </GuidedQuestions></div>}
    {path === "discovery" && <div className="mt-5"><h3 className="text-lg font-semibold">{zh ? "從已儲存的客戶對話整理" : "Use your saved customer conversations"}</h3><p className="mt-4 text-sm text-dark/60">{zh ? `已有 ${workspace?.customerConversationCount ?? 0} 次含筆記的客戶對話，不用重新填寫；至少 5 次可整理草稿。` : `${workspace?.customerConversationCount ?? 0} customer conversations with notes are already saved. No need to re-enter them; at least 5 are needed for a draft.`}</p><div className="mt-4 flex flex-wrap gap-2"><Link className={`${button} bg-black text-white`} href={pathForLocale("/dashboard/insights", locale)}>{zh ? "記錄客戶對話" : "Log a conversation"}</Link>{canUseAi && <button type="button" disabled={disabled || (workspace?.customerConversationCount ?? 0) < 5} className={button} onClick={() => void mutate("discover", "discovery", "synthesize")}>{zh ? "整理客戶對話（產生草稿）" : "Prepare a draft from conversations"}</button>}</div></div>}
    {!canUseAi && <Link className={`${button} mt-4`} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "AI 分析需 Pro 以上方案；逐題整理與手動儲存仍可使用" : "AI analysis requires Pro or above. Guided editing and manual saving remain available."}</Link>}
    {result && workspace?.discovery?.path === path && <section className="mt-5 space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4"><h3 className="font-semibold">POLARIS</h3><p className="whitespace-pre-wrap text-sm">{result.message}</p>{result.candidates.map(candidate => <div key={candidate.name} className="rounded-xl border border-dark/10 bg-white p-4"><h4 className="font-semibold">{candidate.name}</h4><span className="mt-2 inline-block rounded-full bg-dark/5 px-2 py-1 text-xs">{(zh ? { easy: "容易接觸", some_effort: "需要一些努力", hard: "較難接觸" } : { easy: "Easy to reach", some_effort: "Some effort", hard: "Hard to reach" })[candidate.reach]}</span><p className="mt-2 text-sm">{candidate.whyFirst}</p><p className="mt-2 text-sm text-dark/60">{zh ? "建議接觸管道" : "Suggested channels"}: {candidate.whereToFind.join(" · ")}</p><p className="mt-2 text-sm">{zh ? "待驗證的假設" : "Assumption to test"}: {candidate.assumptionToTest}</p><button type="button" disabled={disabled} className={`${button} mt-3`} onClick={() => { adoptGuess(candidate.guess); }}>{zh ? "作為初始假設並編輯" : "Use as my first guess"}</button></div>)}{result.guess && <><dl className="space-y-2 text-sm">{Object.entries(result.guess).map(([k, v], i) => <div key={k}><dt className="text-dark/60">{(zh ? ["客戶", "問題", "情境", "现有解法"] : ["Customer", "Problem", "Situation", "Workaround"])[i]}</dt><dd>{v || (zh ? "尚未確認" : "Not confirmed")}</dd></div>)}</dl><button type="button" disabled={disabled} className={button} onClick={() => { adoptGuess(result.guess!); }}>{zh ? "編輯這份草稿" : "Edit this draft"}</button></>}{result.patterns.map(p => <div key={p.text} className="text-sm"><p className="font-semibold">{p.text}</p>{p.evidence.map(e => <blockquote key={e.id} className="mt-2 border-l-2 pl-3 text-dark/60">“{e.quote}”</blockquote>)}</div>)}{result.unclear.length > 0 && <p className="text-sm text-dark/60">{zh ? "尚待確認" : "Still unclear"}: {result.unclear.join(" · ")}</p>}</section>}
    {stale && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><p>{zh ? "已儲存的 ICP 有新版本。請先比較上方最新內容；草稿已保留。" : "Your saved ICP has a newer version. Compare the latest details above; your draft is retained."}</p><button type="button" className={`${button} mt-2`} disabled={disabled} onClick={() => { setBaseVersion(workspace!.currentProfileVersion); remember(path, guess, product, workspace!.currentProfileVersion); setNotice(zh ? "已保留目前草稿，請檢查摘要後再確認儲存。" : "Draft retained. Review the summary before confirming and saving."); }}>{zh ? "已比較最新內容，保留草稿繼續" : "Compared latest details; keep my draft"}</button></div>}
    {(busy || workspace?.pending) && <p role="status" className="mt-4 text-sm">{zh ? "處理中，請稍候。AI 分析約需一分鐘。" : "Working… AI analysis can take about a minute."}</p>}
    {(error || workspace?.error) && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error || workspace?.error}</p><button type="button" disabled={busy} className={`${button} mt-2`} onClick={() => { setError(""); void reload(!loaded); }}>{zh ? "重新載入工作區（保留輸入）" : "Reload workspace (keep input)"}</button></div>}{notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
  </div>;
}
