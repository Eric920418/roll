"use client";
import { useCallback, useEffect, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
import type { evidenceQueue } from "@/lib/action-plan/flow/review";
type Row = Awaited<ReturnType<typeof evidenceQueue>>[number];
export default function TaskEvidence() {
  const [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => { try { setRows(await memberFetch<Row[]>("/api/admin/task-evidence")); setError(""); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function review(row: Row, status: "approved" | "rejected") {
    if (busy) return; setBusy(true); setError("");
    try { setRows(await memberFetch<Row[]>("/api/admin/task-evidence", { method: "PATCH", body: JSON.stringify({ dealId: row.dealId, proofId: row.proofId, version: row.version, status, note: notes[row.proofId] || "" }) })); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }
  return <div className="space-y-5"><h1 className="text-3xl font-bold">今日任務證據審核</h1><p className="text-sm">核對公司、實際付款或已簽付費合約、金額、幣別與日期；不能核准自己的證據。審核理由與歷史會保留。</p><button className="min-h-11 rounded-xl border px-4" onClick={() => void load()}>重新載入</button>{error && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{!rows.length && <p>目前沒有待核對的新版證據。</p>}{[...rows].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")).map(r => <article key={r.proofId} className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-bold">{r.company} · {r.kind === "paid" ? "實際付款" : "付費合約"}</h2><p>{r.currency} {r.amount} · {r.date} · {({ pending: "待審", approved: "已通過", rejected: "未通過" })[r.status]}</p><a className="inline-flex min-h-11 items-center underline" href={"/api/admin/task-evidence?dealId=" + encodeURIComponent(r.dealId) + "&proofId=" + encodeURIComponent(r.proofId)}>{r.filename} · 下載私密附件</a>{r.note && <p>上次核對：{r.note} · {r.reviewedAt}</p>}<label className="block text-sm">本次核對理由<textarea aria-label="本次核對理由" rows={3} maxLength={2000} className="mt-1 w-full rounded-xl border p-3" value={notes[r.proofId] || ""} onChange={e => setNotes({ ...notes, [r.proofId]: e.target.value })} /></label><div className="flex flex-wrap gap-3"><button className="min-h-11 rounded-xl bg-black px-4 text-white disabled:opacity-50" disabled={busy || (notes[r.proofId]?.trim().length || 0) < 3} onClick={() => void review(r, "approved")}>核對通過</button><button className="min-h-11 rounded-xl border px-4 text-red-800 disabled:opacity-50" disabled={busy || (notes[r.proofId]?.trim().length || 0) < 3} onClick={() => void review(r, "rejected")}>要求補正</button></div></article>)}</div>;
}
