"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { myCommitments } from "@/lib/roundtables/service";
import { button } from "../flow/Templates";
type Rows = Awaited<ReturnType<typeof myCommitments>>;
export default function Commitments() {
  const locale = useLocale() as "zh-tw" | "en", zh = locale === "zh-tw", [rows, setRows] = useState<Rows | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const writing = useRef(false), request = useRef(0);
  const load = useCallback(async () => { const n = ++request.current; setLoading(true); try { const next = await memberFetch<Rows>("/api/roundtables?view=commitments"); if (n === request.current) { setRows(next); setError(""); } } catch (e) { if (n === request.current) setError(e instanceof Error ? e.message : String(e)); } finally { if (n === request.current) setLoading(false); } }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function complete(row: Rows[number]) {
    if (writing.current || loading) return; request.current++; writing.current = true; setBusy(true);
    try { await memberFetch("/api/roundtables", { method: "POST", body: JSON.stringify({ action: "commitmentDone", registrationId: row.id, revision: row.revision, done: !row.done }) }); await load(); window.dispatchEvent(new Event("nova-plan-changed")); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { writing.current = false; setBusy(false); }
  }
  useEffect(() => { if (!rows?.length || window.location.hash !== "#roundtable-commitments") return; const timer = setTimeout(() => { const target = document.getElementById("roundtable-commitments") as HTMLDetailsElement | null; if (target) { target.open = true; target.scrollIntoView({ block: "start" }); } }, 0); return () => clearTimeout(timer); }, [rows]);
  if (!rows?.length && !error) return null;
  return <details id="roundtable-commitments" className="my-6 rounded-2xl border border-dark/20 bg-white p-5"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{zh ? "來自圓桌會議的承諾" : "Commitments from roundtables"} · {rows?.filter(r => !r.done).length || 0} {zh ? "項待完成" : "pending"}</summary><button className={button + " mt-4"} disabled={busy || loading} onClick={() => void load()}>{zh ? "更新承諾" : "Refresh commitments"}</button>{error && <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}<div className="mt-4 space-y-4">{rows?.map(r => <article key={r.id} className="space-y-3 rounded-xl border p-4"><h2 className="break-words font-bold">{r.title}</h2><p className="whitespace-pre-wrap break-words text-sm">{r.criteria}</p><p className="text-sm">{r.dueDate} · {r.done ? (zh ? "已完成" : "Done") : (zh ? "待完成" : "Pending")}{r.stepId && /^\d{2}-\d$/.test(r.stepId) ? " · " + (zh ? "步驟 " : "Step ") + r.stepId : ""}</p><Link href={pathForLocale("/dashboard/matchmaking?tab=roundtables&roundtable=" + encodeURIComponent(r.session), locale)} className="inline-flex min-h-11 items-center break-words text-sm underline">{zh ? "來源圓桌：" : "Source session: "}{r.topic}</Link>{r.calendarRemoved && <p className="text-xs text-dark/60">{zh ? "週曆安排已移除，原承諾保留。" : "Calendar arrangement removed; original commitment retained."}</p>}<div><button className={button} disabled={busy || loading} onClick={() => void complete(r)}>{r.done ? (zh ? "重新開啟承諾" : "Reopen commitment") : (zh ? "標示承諾已完成" : "Mark commitment done")}</button></div></article>)}</div></details>;
}
