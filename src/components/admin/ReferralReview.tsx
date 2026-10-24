"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
type Row = { id: string; revision: number; status: string; reason: string | null; errorRequestId: string | null; paymentKey: string | null; payment: { kind: string | null; orderId: string | null; subscriptionId: string | null; amountMinor: number | null; currency: string | null } | null; paidAt: string | null; eligibleAt: string | null; checkedAt: string | null; reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null };
const control = "min-h-11 rounded-lg border border-neutral-300 p-3 text-sm disabled:opacity-40";
export default function ReferralReview() {
  const [data, setData] = useState<{ rows: Row[]; hasMore: boolean } | null>(null), [page, setPage] = useState(1), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const writing = useRef(false);
  const load = useCallback((signal?: AbortSignal) => memberFetch<{ rows: Row[]; hasMore: boolean }>(`/api/admin/referrals?page=${page}`, { signal })
    .then(result => { if (!signal?.aborted) setData(result); })
    .catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }), [page]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  async function save(event: React.FormEvent<HTMLFormElement>, row: Row) {
    event.preventDefault(); if (writing.current) return;
    const form = new FormData(event.currentTarget), decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if (decision !== "approve" && decision !== "reject") return;
    if (decision === "approve" && !String(form.get("payerId") ?? "").trim()) { setError("核准前須填寫由付款來源核對的 PayPal payer ID，不可填姓名或 Email。"); return; }
    writing.current = true; setBusy(true); setError(""); setNotice("");
    try { await memberFetch("/api/admin/referrals", { method: "PATCH", body: JSON.stringify({ id: row.id, revision: row.revision, decision, note: form.get("note"), ...(form.get("payerId") ? { payerId: form.get("payerId") } : {}) }) }); setNotice("核對已儲存；以最新狀態為準。"); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { writing.current = false; setBusy(false); }
  }
  return <div className="space-y-5"><h1 className="text-2xl font-bold">邀請獎勵核對</h1><p className="text-sm">只核對權威付款與身分；雙方固定各 5 次、等待 14 天。核准不能繞過金額、重複付款身分或月上限。請勿在理由中填寫會員姓名、Email 或其他個人資料。</p>{error && <div role="alert" className="whitespace-pre-wrap break-words rounded-lg bg-red-50 p-4 text-red-800">{error}<button className={control+" mt-3 block"} onClick={() => { setError(""); void load(); }}>重新載入比對</button></div>}{notice && <p role="status">{notice}</p>}
    {!data ? <p>載入中…</p> : !data.rows.length ? <p>尚無邀請紀錄。</p> : data.rows.map(row => <section key={row.id} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"><p className="break-all font-mono text-sm">{row.id}</p><p>{row.status} · {row.reason ?? "—"} · v{row.revision}</p>{row.errorRequestId && <p className="break-words text-sm">上次來源核對 HTTP 503 · payment_unavailable · {row.errorRequestId}</p>}<p className="break-all text-sm">交易：{row.paymentKey ?? "—"}；來源：{row.payment?.orderId ?? row.payment?.subscriptionId ?? "—"}；金額：{row.payment?.currency ?? "—"} {row.payment?.amountMinor !== null && row.payment?.amountMinor !== undefined ? (row.payment.amountMinor / 100).toFixed(2) : "—"}</p><p className="text-sm">付款：{row.paidAt ?? "—"}；預計發放：{row.eligibleAt ?? "—"}；最近核對：{row.checkedAt ?? "—"}</p>{row.reviewNote && <p className="whitespace-pre-wrap text-sm">核對紀錄：{row.reviewNote}（{row.reviewedAt}）</p>}{row.status === "review" && <form onSubmit={event => void save(event, row)} className="grid gap-3"><label className="text-sm">已向付款來源核對的 PayPal payer ID<input name="payerId" autoComplete="off" pattern="[A-Za-z0-9_-]{5,128}" maxLength={128} className={control+" mt-2 block w-full"} /></label><label className="text-sm">核對理由（至少 5 字）<textarea name="note" required minLength={5} maxLength={1000} rows={3} className={control+" mt-2 block w-full"} /></label><div className="flex gap-3"><button value="approve" className={control} disabled={busy}>核准並重新檢查資格</button><button value="reject" className={control} disabled={busy}>拒絕</button></div></form>}</section>)}
    <div className="flex items-center gap-3"><button className={control} disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}>上一頁</button><span>{page}</span><button className={control} disabled={!data?.hasMore || busy} onClick={() => setPage(value => value + 1)}>下一頁</button></div></div>;
}
