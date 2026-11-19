"use client";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useEffectEvent, useId, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
import { SalesEditor } from "../ValidationWorkspace";
import type { validationSnapshot } from "@/lib/validation/service";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { companyKey } from "@/lib/customer-insights/interviews";
import { button } from "./Templates";

type Snapshot = Awaited<ReturnType<typeof validationSnapshot>>;
type Company = { company: string; name: string };

export default function Proofs({ userId, view, onChanged, companiesForEvidence, paidOnly }: {
  userId: string; view: FlowView; onChanged(): void; companiesForEvidence?: Company[]; paidOnly?: boolean;
}) {
  const zh = useLocale() === "zh-tw", [data, setData] = useState<Snapshot | null>(null);
  const [company, setCompany] = useState(""), [selected, setSelected] = useState(""), [error, setError] = useState("");
  const companyList = useId();
  const load = useCallback(async () => {
    try {
      setData(await memberFetch<Snapshot>("/api/pipeline?planId=" + view.plan.id));
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [view.plan.id]);
  const refresh = useEffectEvent(() => { void load(); onChanged(); });
  const pending = view.proofStatus.some(proof => proof.status === "pending" && !proof.revoked && (!paidOnly || proof.kind === "paid"));
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(initial); window.removeEventListener("focus", onFocus); };
  }, [load]);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [pending]);
  const companies = [...new Map((companiesForEvidence || [...(data?.deals || []), ...view.leads, ...view.payments])
    .filter(c => c.company.trim()).map(c => [companyKey(c.company), c])).values()];
  const existing = companies.find(c => companyKey(c.company) === companyKey(selected));
  const person = !companiesForEvidence && companyKey(company) !== companyKey(selected) ? undefined
    : existing || (!companiesForEvidence && selected ? { company: selected, name: "" } : undefined);
  const label = zh ? "客戶" : "Customer";
  const field = "mt-1 min-h-11 w-full rounded-xl border border-dark/20 px-3 text-sm";
  return <section className="space-y-4" aria-label={zh ? "付款與合約證明" : "Payment and contract proof"}>
    {companiesForEvidence ? companies.length > 0
      ? <label className="block text-sm">{label}<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">{zh ? "請選擇" : "Choose"}</option>
          {companies.map(c => <option key={companyKey(c.company)} value={c.company}>{c.company}</option>)}
        </select></label>
      : <p className="text-sm">{zh ? "儲存客戶紀錄後，就可以在這裡上傳證明。" : "Save the customer record to upload evidence."}</p>
      : <label className="block text-sm">{label}<input className={field} list={companyList} maxLength={200} value={company} onChange={e => setCompany(e.target.value)}
          onBlur={e => setSelected(e.target.value.trim())} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        <datalist id={companyList}>{companies.map(c => <option key={companyKey(c.company)} value={c.company} />)}</datalist>
      </label>}
    {person && data && <SalesEditor key={companyKey(person.company)} userId={userId} data={data} scope={{ planId: view.plan.id }} reviewRequired paidOnly={paidOnly}
      prospect={{ company: person.company, name: person.name, quote: "", amount: "", currency: "", willingness: "not_asked", heat: "unknown", respondedAt: "" }}
      onSaved={next => { setData(next); onChanged(); }} />}
    {error && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}<button className={button} type="button" onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
  </section>;
}
