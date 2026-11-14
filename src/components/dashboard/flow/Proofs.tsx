"use client";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
import { SalesEditor } from "../ValidationWorkspace";
import type { validationSnapshot } from "@/lib/validation/service";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { companyKey } from "@/lib/customer-insights/interviews";
import { button, TextField } from "./Templates";
type Snapshot = Awaited<ReturnType<typeof validationSnapshot>>;
export default function Proofs({ userId, view, onChanged }: { userId: string; view: FlowView; onChanged(): void }) {
  const zh = useLocale() === "zh-tw", [data, setData] = useState<Snapshot | null>(null), [company, setCompany] = useState(""), [selected, setSelected] = useState(""), [error, setError] = useState("");
  const load = useCallback(async () => { try { setData(await memberFetch<Snapshot>("/api/pipeline?planId=" + view.plan.id)); setError(""); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } }, [view.plan.id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const companies = [...new Map([...(data?.deals || []).map(d => ({ company: d.company, name: d.name })), ...view.leads, ...view.payments, ...(company ? [{ company, name: "" }] : [])].map(c => [companyKey(c.company), c])).values()];
  const person = companies.find(c => companyKey(c.company) === companyKey(selected));
  return <section id="flow-evidence" className="space-y-4 rounded-xl border border-dark/20 p-4" aria-label={zh ? "付款與合約證明" : "Payment and contract proof"}>
    <h3 className="text-lg font-bold">{zh ? "付款與合約證明" : "Payment and contract proof"}</h3>
    <p className="text-sm text-dark/65">{zh ? "上傳後等待管理員審核。付款或合約日期、金額與公司必須一致；口頭承諾不計入。" : "Upload and await administrator review. Dates, amounts and companies must match; verbal promises do not count."}</p>
    <button className={button} type="button" onClick={() => { void load(); onChanged(); }}>{zh ? "更新審核結果" : "Refresh review status"}</button>
    {view.proofStatus.map((p, i) => <p key={i} className="text-sm">{p.company} · {p.kind === "paid" ? (zh ? "付款" : "Payment") : (zh ? "合約" : "Contract")} · {p.revoked ? (zh ? "已撤銷" : "Revoked") : p.approved ? (zh ? "審核通過" : "Approved") : (p.status === "rejected" ? (zh ? "審核未通過，請補正" : "Review rejected; correct the evidence") : (zh ? "等待管理員審核" : "Waiting for administrator review"))}{p.note ? " · " + p.note : ""}</p>)}
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><TextField label={zh ? "新增已認識的公司" : "Add a company you know"} value={company} onChange={setCompany} /><button className={button} type="button" disabled={!company.trim()} onClick={() => setSelected(company.trim())}>{zh ? "選擇公司" : "Select company"}</button></div>
    <label className="block text-sm">{zh ? "選擇證明所屬公司" : "Select the proof's company"}<select aria-label={zh ? "選擇證明所屬公司" : "Select the proof\'s company"} className="mt-1 min-h-11 w-full rounded-xl border px-3" value={selected} onChange={e => setSelected(e.target.value)}><option value="">{zh ? "請選擇" : "Choose"}</option>{companies.map(c => <option key={companyKey(c.company)} value={c.company}>{c.company}</option>)}</select></label>
    {person && data && <SalesEditor key={companyKey(person.company)} userId={userId} data={data} scope={{ planId: view.plan.id }} reviewRequired prospect={{ company: person.company, name: person.name, quote: "", amount: "", currency: "", willingness: "not_asked", heat: "unknown", respondedAt: "" }} onSaved={next => { setData(next); onChanged(); }} />}
    {error && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}<button className={button} type="button" onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
  </section>;
}
