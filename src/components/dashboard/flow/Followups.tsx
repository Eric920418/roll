"use client";
import { useState } from "react";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { followupSchema } from "@/lib/action-plan/flow/catalog";
import { today } from "@/lib/roadmap/schema";
import { button, TextField } from "./Templates";

export default function Followups({ view, userId, locale, disabled, save }: { view: FlowView; userId: string; locale: string; disabled: boolean; save(body: object): Promise<unknown> }) {
  const w = (a: string, b: string) => locale === "zh-tw" ? a : b;
  const [selected, select] = useState("");
  const [draft, setDraft] = useState<ReturnType<typeof followupSchema.parse> | null>(null), [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const rows = view.followups.filter(c=>!c.resolved && c.status === "sent" && c.step !== view.current), contact = rows.find(c=>c.actionId+":"+c.contactId===selected);
  const key = (id: string) => `nova:followup:${userId}:${view.plan.id}:${id}`;
  function choose(row: typeof rows[number]) {
    const id=row.actionId+":"+row.contactId; select(id); setError("");
    let next = { id: crypto.randomUUID(), contactId: row.contactId, date: today(), status: row.status as "sent"|"replied"|"conversation"|"agreed", note: "" };
    try { const cached=followupSchema.safeParse(JSON.parse(localStorage.getItem(key(id))||"null")); if(cached.success && cached.data.contactId===row.contactId)next=cached.data; }
    catch { setError(w("無法讀取本機草稿。", "Could not read the local draft.")); }
    setDraft(next);
  }
  function change(next: NonNullable<typeof draft>) { setDraft(next); try { localStorage.setItem(key(selected),JSON.stringify(next)); } catch { setError(w("草稿暫存失敗，請先儲存再離開。", "Draft storage failed; save before leaving.")); } }
  return <section className="space-y-3 rounded-xl border border-dark/10 bg-white p-4" aria-label={w("提案跟進", "Proposal follow-up")}><h3 className="font-bold">{w("提案與聯絡跟進", "Proposal and contact follow-up")}</h3>
    {!rows.length ? <p className="text-xs">{w("沒有待跟進的聯絡紀錄。", "No outstanding contacts to follow up.")}</p> : <div className="grid gap-1">{(showAll ? rows : rows.slice(0,5)).map(row=><button type="button" disabled={disabled} key={row.actionId+row.contactId} className={button+" justify-between! gap-3 text-left"} onClick={()=>choose(row)}><span>{row.company} · {row.name}</span><span className="text-xs">{w(({sent:"已寄出",replied:"已回覆",conversation:"已對話",agreed:"已同意",draft:"草稿"})[row.status],row.status)} · {row.date}</span></button>)}</div>}
    {rows.length>5 && <button type="button" className={button} onClick={()=>setShowAll(!showAll)}>{showAll ? w("收合跟進名單", "Show fewer contacts") : w("查看全部跟進對象", "View all follow-up contacts")} · {rows.length}</button>}
    {contact && draft && <form className="space-y-3 border-t pt-3" onSubmit={async e=>{e.preventDefault();const result=await save({action:"followup",sourceActionId:contact.actionId,update:draft});if(result){try{localStorage.removeItem(key(selected));}catch{setError(w("已儲存，本機草稿未能清除。", "Saved; local draft could not be cleared."));}setDraft(null);select("");}}}><fieldset disabled={disabled} className="space-y-3"><TextField label={w("跟進日期", "Follow-up date")} type="date" value={draft.date} onChange={date=>change({...draft,date})}/><label className="block text-sm">{w("最新狀態", "Latest status")}<select aria-label={w("最新狀態", "Latest status")} className="mt-1 min-h-11 w-full rounded-xl border p-2" value={draft.status} onChange={e=>change({...draft,status:e.target.value as typeof draft.status})}>{(["sent","replied","conversation","agreed"] as const).map((status,i)=><option key={status} value={status}>{w(["再次聯絡，等待回覆","已回覆","已完成對話","已同意試點（不等於付款）"][i],["Contacted again; awaiting reply","Replied","Conversation held","Pilot agreed (not payment)"][i])}</option>)}</select></label><TextField multiline label={w("跟進紀錄", "Follow-up note")} value={draft.note} onChange={note=>change({...draft,note})}/><button className={button+" bg-black text-white"}>{w("儲存跟進", "Save follow-up")}</button></fieldset></form>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
