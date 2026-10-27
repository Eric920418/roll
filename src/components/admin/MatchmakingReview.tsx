"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
type Row = { id: string; role: string; country: string; industry: string; slogan: string; visible: boolean; verified: boolean; recommended: boolean; revision: number; user: { email: string } };
const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm disabled:opacity-50";
export default function MatchmakingReview() {
  const [rows, setRows] = useState<Row[]>([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback((signal?: AbortSignal) => memberFetch<{ rows: Row[]; hasMore: boolean }>(`/api/admin/matchmaking?page=${page}`, { signal })
    .then(result => { if (!signal?.aborted) { setRows(result.rows); setHasMore(result.hasMore); } })
    .catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }), [page]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  async function save(row: Row) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await memberFetch("/api/admin/matchmaking", { method: "PATCH", body: JSON.stringify({ id: row.id, revision: row.revision, verified: row.verified, recommended: row.recommended }) }); setNotice("審核已儲存"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Matchmaking 審核</h1><p className="text-sm">僅設定人工角色驗證與 Roll On 推薦。資料自述不等於驗證，審核不會公開會員卡片。</p>{error && <p role="alert" className="whitespace-pre-wrap break-words rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status">{notice}</p>}<button className={button} disabled={busy} onClick={() => void load()}>載入最新版（重新選擇後儲存）</button>{!rows.length && <p>目前沒有卡片</p>}{rows.map(row => <article key={row.id} className="space-y-3 rounded-xl border p-4"><h2 className="break-words font-semibold">{row.slogan}</h2><p className="break-words text-sm">{row.user.email} · {row.role} · {row.country} · {row.industry} · {row.visible ? "可見" : "隱藏"}</p><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy || !["investor", "buyer"].includes(row.role)} checked={row.verified} onChange={e => setRows(old => old.map(r => r.id === row.id ? { ...r, verified: e.target.checked } : r))} />{row.role === "investor" ? "Verified Investor" : row.role === "buyer" ? "Verified Buyer" : "此角色不提供驗證標章"}</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={row.recommended} onChange={e => setRows(old => old.map(r => r.id === row.id ? { ...r, recommended: e.target.checked } : r))} />Roll On Recommended</label><button className={button} disabled={busy} onClick={() => void save(row)}>儲存審核</button></article>)}<div className="flex items-center gap-3"><button className={button} disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>上一頁</button><span>{page}</span><button className={button} disabled={busy || !hasMore} onClick={() => setPage(p => p + 1)}>下一頁</button></div></div>;
}
