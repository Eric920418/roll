"use client";
import { useState } from "react";
import { today } from "@/lib/roadmap/schema";
import { scoreForCriteria } from "@/lib/action-plan/flow/evaluate";
import { countryCode } from "@/lib/member-options";
import { companyKey } from "@/lib/customer-insights/interviews";
import PositioningEditor from "./PositioningEditor";
import CriteriaEditor from "./CriteriaEditor";
import ConversationEditor from "./ConversationEditor";
import { CHAPTERS, ORGANIZE_FIELDS, STEP_WORK, emptyRecord, emptyContact, words, type FlowData, type StepId } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";

export const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45";
const field = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-dark/20 bg-white px-3 py-2 text-sm focus-visible:outline-2";
type Props = { step: StepId; data: FlowData; view: FlowView; locale: string; disabled?: boolean; readOnly?: boolean; onChange(data: FlowData): void; onSave?(data: FlowData): void; resetVersion?: number; reference?: boolean };
export function TextField({ label, value, onChange, multiline = false, type = "text", hideLabel = false, placeholder }: { placeholder?: string; label: string; value: string; onChange(value: string): void; multiline?: boolean; type?: string; hideLabel?: boolean }) {
  return <label className="block min-w-0 text-sm">{!hideLabel && label}{multiline ? <textarea aria-label={label} placeholder={placeholder} className={field} rows={2} maxLength={4000} value={value} onChange={e => onChange(e.target.value)} /> : <input aria-label={label} placeholder={placeholder} className={field} type={type} step={type === "number" ? "any" : undefined} maxLength={4000} value={value} onChange={e => onChange(e.target.value)} />}</label>;
}
function Choice({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange(value: string): void }) {
  return <label className="block min-w-0 text-sm">{label}<select aria-label={label} className={field} value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}
export function OptionButtons({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange(value: string): void }) {
  return <fieldset className="min-w-0"><legend className="mb-1 text-sm">{label}</legend><div className="flex flex-wrap gap-1">{options.map(([key, text]) =>
    <button key={key} type="button" className={button + " px-3 text-xs aria-pressed:bg-black aria-pressed:text-white"} aria-pressed={key === value} onClick={() => onChange(key)}>{text}</button>
  )}</div></fieldset>;
}
export default function Templates({ step, data, view, locale, disabled, readOnly = disabled, onChange, onSave, resetVersion = 0, reference = false }: Props) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const serverData = view.steps.find(s => s.id === step)?.data;
  const savedRecords = serverData?.kind === "conversation" ? serverData.records : [];
  const [editing, setEditing] = useState(() => data.kind === "conversation" ? data.records.find(v=>JSON.stringify(v)!==JSON.stringify(savedRecords.find(s=>s.id===v.id)))?.id || "" : "");
  const [newRecord, setNewRecord] = useState(() => emptyRecord(crypto.randomUUID()));
  const [lastReset, setLastReset] = useState(resetVersion);
  if (lastReset !== resetVersion) {
    setLastReset(resetVersion);
    if (step === "01-1") { setEditing(""); setNewRecord(emptyRecord(crypto.randomUUID())); }
    if (step === "01-4" && data.kind === "organize") setEditing(data.tiers.find(t => !t.confirmed)?.leadId || editing);
  }
  const conversationRow = data.kind === "conversation" ? data.records.find(v => v.id === editing) || (step === "04-2" || readOnly ? data.records[0] : data.records.find(v => JSON.stringify(v) !== JSON.stringify(savedRecords.find(s => s.id === v.id)))) || newRecord : null;
  function selectRecord(id: string) {
    if (!readOnly && serverData && JSON.stringify(data) !== JSON.stringify(serverData)) {
      if (!window.confirm(w("切換前要放棄尚未儲存的修改？", "Discard unsaved changes before switching records?"))) return false;
      onChange(serverData);
    }
    setEditing(id);
    return true;
  }
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [contactPage, setContactPage] = useState(0);
  const [supplementIndex, setSupplementIndex] = useState(0);
  const [newOutreach, setNewOutreach] = useState(() => emptyContact(crypto.randomUUID()));
  function closeRecords() { (document.getElementById("first-task-records") as HTMLDialogElement | null)?.close(); }
  const conversationRecords = <>{!savedRecords.length ? <p className="text-xs">{w("尚無對話紀錄", "No saved conversations yet")}</p> : <div className="grid gap-2">{(showAllRecords ? savedRecords : savedRecords.slice(0,3)).map(row => <button key={row.id} type="button" disabled={Boolean(disabled && !readOnly)} aria-pressed={conversationRow?.id === row.id} className={button + " justify-between! gap-3 text-left text-xs"} onClick={() => { if (selectRecord(row.id) && reference) closeRecords(); }}><span className="min-w-0 break-words">{row.company} · {row.name}<span className="mt-1 block font-normal">{row.date || "—"} · {w("痛點", "Pain")} {w(({low:"低",medium:"中",high:"高"})[row.severity as "low"|"medium"|"high"] || "—", row.severity || "—")}</span></span><span>{readOnly ? w("查看", "View") : w("編輯", "Edit")}</span></button>)}</div>}{savedRecords.length>3 && <button type="button" className={button} disabled={Boolean(disabled && !readOnly)} onClick={()=>setShowAllRecords(!showAllRecords)}>{showAllRecords ? w("收合紀錄", "Show fewer records") : w("查看全部紀錄", "View all records")} · {savedRecords.length}</button>}{!readOnly && savedRecords.some(v=>v.id===conversationRow?.id) && <button type="button" className={button} disabled={disabled} onClick={() => { const next=emptyRecord(crypto.randomUUID()); if (selectRecord(next.id)) { setNewRecord(next); if (reference) closeRecords(); } }}>{w("返回新增對話", "Return to new conversation")}</button>}</>;
  return <>
    {step === "01-4" && data.kind === "organize" && <Choice label={w("受訪者", "Participant")} value={editing || data.tiers.find(t => !t.confirmed)?.leadId || data.tiers[0]?.leadId || ""} options={data.tiers.map(t => {
    const lead = view.leads.find(l => l.id === t.leadId);
    return [t.leadId, lead ? [lead.company, lead.name].filter(Boolean).join(" · ") : w("未命名受訪者", "Unnamed participant")];
  })} onChange={setEditing} />}
    {step === "03-3" && data.kind === "document" && <div className="flex flex-wrap gap-2" role="group" aria-label={w("文件章節", "Document chapters")}>{(CHAPTERS[step] || []).map((title,i)=><button key={i} type="button" className={button + " text-left aria-pressed:bg-black aria-pressed:text-white"} aria-pressed={(editing || "0")===String(i)} onClick={()=>setEditing(String(i))}>{words(title,locale)}</button>)}</div>}
    <fieldset disabled={disabled && step !== "01-3"} className="min-w-0 space-y-3">
    <legend className="sr-only">{words(STEP_WORK[step], locale)}</legend>
    {step === "05-2" && data.kind === "outreach" && view.needsOriginalMarket && <TextField label={w("原市場／國家", "Original market / country")} value={data.originalMarket || ""} onChange={originalMarket => onChange({ ...data, originalMarket })} />}
    {step === "05-2" && data.kind === "outreach" && <div className="space-y-3">
      <OptionButtons label={w("市場", "Market")} value={["JP", "SG", "US"].includes(countryCode(data.market) || "") ? countryCode(data.market)! : "other"} options={[["JP", w("日本", "Japan")], ["SG", w("新加坡", "Singapore")], ["US", w("美國", "United States")], ["other", w("其他", "Other")]]} onChange={market => onChange({ ...data, market: market === "other" ? "" : market })} />
      {!["JP", "SG", "US"].includes(countryCode(data.market) || "") && <TextField hideLabel label={w("市場", "Market")} value={data.market} onChange={market => onChange({ ...data, market })} />}
      <TextField multiline label={w("選擇原因", "Reason for choosing this market")} value={data.marketReason || ""} onChange={marketReason => onChange({ ...data, marketReason })} />
      <TextField multiline label={w("在地化調整", "Local adaptation")} value={data.localApproach || ""} onChange={localApproach => onChange({ ...data, localApproach })} />
      <OptionButtons label={w("第一批名單來源", "Initial lead source")} value={data.marketChannel || ""} options={[["referral", w("既有客戶介紹", "Customer referrals")], ["nova", w("NOVA 商機媒合", "NOVA Matchmaking")], ["event", w("活動", "Events")], ["linkedin", "LinkedIn"]]} onChange={marketChannel => onChange({ ...data, marketChannel })} />
    </div>}
    {data.kind === "conversation" && (() => {
      const row = conversationRow!;
      const update = (value: typeof row) => { setEditing(value.id); onChange({...data,records:data.records.some(v=>v.id===value.id)?data.records.map(v=>v.id===value.id?value:v):[...data.records,value]}); };
      if (step === "01-1") return <ConversationEditor row={row} locale={locale} onChange={update} />;
      const payers = [...new Set([...view.payments.map(p => p.company), row.company].filter(Boolean))].map(value => [value, value] as [string, string]);
      return <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice label={w("客戶", "Customer")} value={row.company} options={[["", w("請選擇", "Choose")], ...payers]} onChange={company => {
            const existing = data.records.find(r => companyKey(r.company) === companyKey(company));
            if (existing) selectRecord(existing.id);
            else if (company) update({ ...newRecord, company, name: view.payments.find(p => p.company === company)?.name || "" });
          }} />
          <TextField label={w("已付費期間", "Paid period")} value={row.paidPeriod || ""} onChange={paidPeriod => update({ ...row, paidPeriod })} />
        </div>
        <TextField multiline label={w("為什麼繼續使用", "Why they keep using it")} value={row.reason} onChange={reason => update({ ...row, reason })} />
        <TextField multiline label={w("還缺什麼", "What is missing")} value={row.missing} onChange={missing => update({ ...row, missing })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionButtons label={w("續約意願", "Renewal intent")} value={row.renewalIntent || ""} options={[["yes", w("會續約", "Will renew")], ["unsure", w("評估中", "Considering")], ["no", w("不續約", "Will not renew")]]} onChange={renewalIntent => update({ ...row, renewalIntent })} />
          <OptionButtons label={w("願意推薦", "Willing to refer")} value={row.referralIntent || ""} options={[["yes", w("願意", "Willing")], ["unsure", w("不確定", "Unsure")], ["no", w("不願意", "Not willing")]]} onChange={referralIntent => update({ ...row, referralIntent, referral: referralIntent === "yes" ? row.referral : "" })} />
        </div>
        {(row.referralIntent === "yes" || !row.referralIntent && row.referral) && <TextField label={w("可推薦的對象（選填）", "Possible referrals (optional)")} value={row.referral} onChange={referral => update({ ...row, referral })} />}
        {!readOnly && onSave && <div className="flex justify-end"><button type="button" className={button + " bg-black text-white"} disabled={!row.company || !row.reason.trim() || !row.missing.trim() || !(row.referralIntent || row.referral)} onClick={() => onSave({ ...data, records: data.records.map(record => record.id === row.id ? { ...row, date: row.date || today(), referral: row.referral || (row.referralIntent === "yes" ? w("願意，尚未提供對象", "Willing, no name supplied") : row.referralIntent === "no" ? w("不願意推薦", "Not willing to refer") : w("不確定", "Unsure")) } : record) })}>{w("儲存紀錄", "Save review")}</button></div>}
      </div>;
    })()}
    {data.kind === "organize" && <>
      {step === "01-2" && <PositioningEditor data={data} locale={locale} readOnly={readOnly} compact onChange={onChange} />}
      {ORGANIZE_FIELDS[step]?.map(f => <TextField key={f.key} label={words(f.label, locale)} value={data.values[f.key] || ""} multiline={["scope", "terms"].includes(f.key)} type={f.number ? "number" : "text"} onChange={value => onChange({ ...data, values: { ...data.values, [f.key]: value } })} />)}
      {step === "02-3" && <>
        <OptionButtons label={w("計費方式", "Billing method")} value={data.values.billing || ""} options={[["monthly", w("月費", "Monthly")], ["annual", w("年費", "Annually")], ["usage", w("依用量", "By usage")]]} onChange={billing => onChange({ ...data, values: { ...data.values, billing } })} />
        <OptionButtons label={w("客戶對價格的反應", "Customer response to price")} value={data.values.priceResponse || ""} options={[["accepted", w("可接受", "Acceptable")], ["expensive", w("偏貴", "Too expensive")], ["none", w("未表態", "No response")]]} onChange={priceResponse => onChange({ ...data, values: { ...data.values, priceResponse } })} />
      </>}
      {step === "01-3" && <CriteriaEditor data={data} view={view} locale={locale} readOnly={readOnly} disabled={disabled} onChange={onChange} />}

      {step === "01-4" && data.tiers.filter(t => t.leadId === (editing || data.tiers.find(t => !t.confirmed)?.leadId || data.tiers[0]?.leadId)).map(t => {
        const score = scoreForCriteria(view.criteria, t.matches);
        const suggested = score >= 80 ? "A" : score >= 60 ? "B" : "C";
        const update = (patch: Partial<typeof t>) => onChange({ ...data, tiers: data.tiers.map(tier => tier.leadId === t.leadId ? { ...tier, ...patch } : tier) });
        const options: Array<[string, string]> = [["yes", w("符合", "Fits")], ["partial", w("部分符合", "Partly fits")], ["no", w("不符合", "Does not fit")]];
        return <section key={t.leadId} className="space-y-3">
          {view.criteria.map(c => <OptionButtons key={c.id} label={c.label} value={t.matches.includes(c.id) ? "yes" : t.partial?.includes(c.id) ? "partial" : "no"} options={options} onChange={choice => update({
            confirmed: false, matches: [...t.matches.filter(id => id !== c.id), ...(choice === "yes" ? [c.id] : [])],
            partial: [...(t.partial || []).filter(id => id !== c.id), ...(choice === "partial" ? [c.id] : [])],
          })} />)}
          <p className="rounded-lg bg-dark/5 p-3 text-sm">{w("自動計算", "Calculated score")} · {score}/100 · {w("建議", "Suggested")} {suggested}</p>
          <OptionButtons label={w("最終分級", "Final tier")} value={t.override || suggested} options={["A", "B", "C"].map(value => [value, value])} onChange={value => update({ override: value === suggested ? "" : value as "A" | "B" | "C", confirmed: false })} />
          {t.override && <TextField label={w("調整理由", "Override reason")} value={t.reason} onChange={reason => update({ reason, confirmed: false })} />}
          {!readOnly && onSave && <div className="flex justify-end"><button type="button" className={button + " bg-black text-white"} disabled={Boolean(t.override && !t.reason.trim())} onClick={() => onSave({ ...data, tiers: data.tiers.map(tier => tier.leadId === t.leadId ? { ...tier, confirmed: true } : tier) })}>{w("儲存並下一位", "Save and next participant")}</button></div>}
        </section>;
      })}
      {step === "03-2" && <>
        <fieldset><legend className="mb-2 text-sm">{w("保留（選 2 個）", "Keep (choose 2)")}</legend><div className="flex flex-wrap gap-2">
          {view.channels.map(channel => <button key={channel.channel} type="button" className={button + " aria-pressed:bg-black aria-pressed:text-white"} aria-pressed={data.selections.includes(channel.channel)} disabled={data.selections.length === 2 && !data.selections.includes(channel.channel)} onClick={() => onChange({
            ...data, selections: data.selections.includes(channel.channel) ? data.selections.filter(value => value !== channel.channel) : [...data.selections, channel.channel],
          })}>{channel.channel}</button>)}
        </div></fieldset>
        <TextField multiline label={w("選擇原因", "Reason for choosing")} value={data.values.reason || ""} onChange={reason => onChange({ ...data, values: { ...data.values, reason } })} />
        <TextField label={w("補充未記錄的成本（選填）", "Unrecorded costs (optional)")} value={data.values.channelCost || ""} onChange={channelCost => onChange({ ...data, values: { ...data.values, channelCost } })} />
      </>}
      {step === "04-3" && <fieldset><legend className="mb-2 text-sm">{w("已到續約時間的客戶", "Customers eligible for renewal")}</legend><div className="flex flex-wrap gap-2">
        {view.payments.filter(p => p.currency === data.values.currency).map(p => { const key = companyKey(p.company); return <button key={key} type="button" className={button + " aria-pressed:bg-black aria-pressed:text-white"} aria-pressed={data.selections.includes(key)} onClick={() => onChange({ ...data, selections: data.selections.includes(key) ? data.selections.filter(v => v !== key) : [...data.selections, key] })}>{p.company}</button>; })}
      </div></fieldset>}
      {step === "05-1" && (() => {
        const { currency, averageRevenue, renewalRate, contactToConversation, conversationToPaid } = view.weekly;
        const rate = (value: number | null | undefined) => value == null ? "—" : (value * 100).toLocaleString(locale, { maximumFractionDigits: 2 });
        const update = (key: string, value: string) => onChange({
          ...data,
          values: { ...data.values, ...(key === "target" ? {} : { conversion: "" }), [key]: value },
          confirmed: data.confirmed.filter(v => v !== "activity" && (key === "target" ? v !== "target" : v !== "assumption")),
        });
        return <>
          <TextField label={w("季度營收目標", "Quarterly revenue target") + (currency ? " (" + currency + ")" : "")} type="number" value={data.values.target || ""} onChange={value => update("target", value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">{w("平均客單價", "Average revenue per customer")}<input className={field} readOnly value={averageRevenue ? currency + " " + averageRevenue.toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"} /></label>
            <label className="block text-sm">{w("續約率", "Renewal rate")}<input className={field} readOnly value={renewalRate == null ? w("不適用（無到期客戶）", "N/A (no renewal-eligible customers)") : rate(renewalRate) + "%"} /></label>
            <TextField label={w("聯絡到對話率（%）", "Contact-to-conversation rate (%)")} type="number" value={data.values.contactToConversation || ""} placeholder={rate(contactToConversation)} onChange={value => update("contactToConversation", value)} />
            <TextField label={w("對話到成交率（%）", "Conversation-to-sale rate (%)")} type="number" value={data.values.conversationToPaid || ""} placeholder={rate(conversationToPaid)} onChange={value => update("conversationToPaid", value)} />
          </div>
        </>;
      })()}
    </>}
    {data.kind === "outreach" && ["02-1", "03-1", "05-2"].includes(step) && (() => {
      const outreach = data, pilot = step === "02-1", newMarket = step === "05-2";
      const row = data.contacts.find(v => v.id === editing) || (editing === newOutreach.id ? newOutreach : data.contacts[0]) || (pilot ? null : newOutreach);
      function add() {
        const next = emptyContact(crypto.randomUUID());
        setNewOutreach(next);
        setEditing(next.id);
      }
      function update(patch: Partial<typeof newOutreach>) {
        if (!row) return;
        const next = { ...row, ...patch, ...(newMarket ? { status: "conversation" as const } : {}) };
        setEditing(row.id);
        onChange({ ...outreach, contacts: outreach.contacts.some(c => c.id === row.id) ? outreach.contacts.map(c => c.id === row.id ? next : c) : [...outreach.contacts, next] });
      }
      const channels: Array<[string, string]> = [["Email", "Email"], ["LinkedIn", "LinkedIn"], ...(pilot ? [["Meeting", w("面談", "In person")]] : [["Event", w("活動", "Event")], ["Referral", w("介紹", "Referral")], ["NOVA", w("NOVA 商機媒合", "NOVA Matchmaking")]]).map(([key,label]): [string, string] => [key,label])];
      if (row?.channel && !channels.some(([key]) => key === row.channel)) channels.push([row.channel, row.channel]);
      const form = row ? <div className="space-y-3">
        {pilot ? <>
          <Choice label={w("對象（A 級客戶）", "A-tier customer")} value={row.id} options={data.contacts.map(c => [c.id, [c.company, c.name].filter(Boolean).join(" · ")])} onChange={setEditing} />
          <TextField multiline label={w("試點內容", "Pilot content")} value={row.offer} onChange={offer => update({ offer })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionButtons label={w("期間", "Duration")} value={row.pilotDuration || ""} options={["1","3","6"].map(months => [months, w(months + " 個月", months + (months === "1" ? " month" : " months"))])} onChange={pilotDuration => update({ pilotDuration })} />
            <TextField label={w("價格", "Price")} value={row.pilotPrice || ""} onChange={pilotPrice => update({ pilotPrice })} />
          </div>
          <TextField label={w("成功標準", "Success criteria")} value={row.pilotSuccess || ""} onChange={pilotSuccess => update({ pilotSuccess })} />
        </> : <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={w("公司", "Company")} value={row.company} onChange={company => update({ company })} />
          <TextField label={w("日期", "Date")} type="date" value={row.date} onChange={date => update({ date })} />
        </div>}
        <OptionButtons label={w(pilot ? "寄送方式" : "管道", pilot ? "Delivery method" : "Channel")} value={row.channel} options={channels} onChange={channel => update({ channel })} />
        {!pilot && <TextField label={w("使用的訊息範本", "Message template used")} value={row.offer} onChange={offer => update({ offer })} />}
        {!newMarket && <OptionButtons label={w("結果", "Outcome")} value={row.status} options={[["sent", w("已寄出", "Sent")], ["replied", w("已回覆", "Replied")], pilot ? ["agreed", w("已同意", "Agreed")] : ["conversation", w("約到對話", "Conversation held")], ["draft", w("未寄出", "Not sent")], ...(row.status === "agreed" && !pilot ? [["agreed", w("已同意", "Agreed")] as [string,string]] : []), ...(row.status === "conversation" && pilot ? [["conversation", w("已對話", "Conversation held")] as [string,string]] : [])]} onChange={value => update({ status: value as typeof row.status, ...(pilot && value !== "draft" && !row.date ? { date: today() } : {}) })} />}
        {step === "03-1" && <>
          <TextField label={w("下次跟進日期", "Next follow-up date")} type="date" value={row.followupDate || ""} onChange={followupDate => update({ followupDate })} />
          {view.criteria.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{w("聯絡前核對評分條件", "Check qualification before outreach")}</summary>{view.criteria.map(c => <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm"><input className="h-5 w-5" type="checkbox" checked={row.matches.includes(c.id)} onChange={e => update({ matches: e.target.checked ? [...row.matches,c.id] : row.matches.filter(id => id !== c.id) })} />{c.label}</label>)}</details>}
        </>}
        {(!pilot && row.status === "conversation" || newMarket) && <>
          <TextField multiline label={w("主要痛點", "Main pain point")} value={row.pain} onChange={pain => update({ pain })} />
          <TextField label={w("目前的解決方式", "Current solution")} value={row.solution} onChange={solution => update({ solution })} />
          <OptionButtons label={w("付費意願", "Willingness to pay")} value={row.wtp} options={[["willing", w("有意願", "Willing")], ["considering", w("評估中", "Considering")], ["declined", w("無意願", "Not willing")]]} onChange={value => update({ wtp: value as typeof row.wtp })} />
        </>}
      </div> : null;
      const contactList = data.contacts.length > 0 && <>
        <div role="group" aria-label={w("公司聯絡表", "Company outreach table")} className="flex flex-wrap gap-2">{data.contacts.slice(contactPage * 10, contactPage * 10 + 10).map(c =>
          <button type="button" key={c.id} aria-pressed={row?.id === c.id} className={button + " text-xs aria-pressed:bg-black aria-pressed:text-white"} onClick={() => setEditing(c.id)}>{c.company || w("新公司", "New company")}</button>
        )}</div>
        {data.contacts.length > 10 && <div className="flex items-center justify-between gap-2 text-xs">
          <button type="button" className={button} disabled={contactPage === 0} onClick={() => setContactPage(contactPage - 1)}>{w("上一頁", "Previous")}</button>
          <span>{contactPage + 1}/{Math.ceil(data.contacts.length / 10)}</span>
          <button type="button" className={button} disabled={(contactPage + 1) * 10 >= data.contacts.length} onClick={() => setContactPage(contactPage + 1)}>{w("下一頁", "Next")}</button>
        </div>}
      </>;
      if (pilot) return form;
      if (!newMarket) return <>{form}{contactList}{!readOnly && <button id="new-outreach-record" type="button" hidden onClick={add}>{w("記錄聯絡", "Record outreach")}</button>}</>;
      return <dialog id="second-market-conversation" aria-label={w("記錄客戶對話", "Record a customer conversation")} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg space-y-4 overflow-y-auto rounded-2xl border bg-white p-5 text-dark backdrop:bg-black/35">
        {contactList}
        {form}
        <div className="flex flex-wrap justify-end gap-2">
          {!readOnly && <button type="button" className={button} onClick={add}>{w("新增對話", "New conversation")}</button>}
          <button type="button" className={button} onClick={event => event.currentTarget.closest("dialog")?.close()}>{w("關閉", "Close")}</button>
          {!readOnly && onSave && <button type="button" className={button + " bg-black text-white"} onClick={event => { event.currentTarget.closest("dialog")?.close(); onSave(data); }}>{w("儲存紀錄", "Save conversation")}</button>}
        </div>
      </dialog>;
    })()}
    {data.kind === "document" && (CHAPTERS[step] || []).map((_, i) => {
      const chapter = data.sections.find(s => s.id === String(i));
      if (!chapter || (step === "05-3" ? i !== 3 : String(i) !== (editing || "0"))) return null;
      const update = (patch: Partial<typeof chapter>) => onChange({ ...data, sections: data.sections.map(s => s.id === chapter.id ? { ...s, ...patch } : s) });
      return <section key={chapter.id} className="space-y-3">
        <TextField multiline label={step === "05-3" ? w("擴張計畫", "Expansion plan") : w("內容", "Content")} value={chapter.body} onChange={body => update({ body, confirmed: false })} />
        {step === "03-3" && <>
          <TextField label={w("這個章節的負責人", "Chapter owner")} value={chapter.owner || ""} onChange={owner => update({ owner })} />
          {!readOnly && onSave && <div className="flex justify-end"><button type="button" className={button + " bg-black text-white"} disabled={!chapter.body.trim()} onClick={() => onSave({ ...data, sections: data.sections.map(s => s.id === chapter.id ? { ...s, confirmed: true } : s) })}>{w("儲存章節", "Save chapter")}</button></div>}
        </>}
      </section>;
    })}
    {step === "01-4" && data.kind === "organize" && Boolean(data.supplements?.length) && (() => {
      const rounds = data.supplements!, round = rounds.at(-1)!, stored = serverData?.kind === "organize" ? serverData.supplements?.at(-1) : undefined;
      const finished = stored?.records.length === 3 && view.leads.some(l=>l.id===stored.records[0]?.id);
      const index = Math.min(supplementIndex, 2), row = round.records[index];
      return <section className="space-y-3 border-t pt-4"><h3 className="font-bold">{w("補訪第 ", "Supplemental round ")}{rounds.length} · {round.records.length}/3</h3>
        <div className="flex flex-wrap gap-2">{round.records.map((r,i)=><button type="button" key={r.id} className={button} aria-pressed={index===i} onClick={()=>setSupplementIndex(i)}>{r.company || (i+1)}</button>)}{!finished && round.records.length<3 && <button type="button" className={button} onClick={()=>{const next={...data,supplements:rounds.map(r=>r.id===round.id?{...r,records:[...r.records,emptyRecord(crypto.randomUUID())]}:r)};onChange(next);setSupplementIndex(round.records.length);}}>{w("新增補訪對象", "Add supplemental participant")}</button>}</div>
        {row && <fieldset disabled={readOnly || disabled || finished}><ConversationEditor row={row} locale={locale} onChange={record=>onChange({...data,supplements:rounds.map(r=>r.id===round.id?{...r,records:r.records.map((v,i)=>i===index?record:v)}:r)})}/></fieldset>}
        <p className="text-xs">{finished ? w("本輪已保存，請在上方確認新對象分級。", "Round retained. Confirm the new customer tiers above.") : w("三位不同對象皆填寫完成並儲存後，才加入分級。", "Three complete, distinct conversations enter tiering after saving.")}</p>
      </section>;
    })()}
  </fieldset>
  {step === "01-1" && data.kind === "conversation" && (reference ? <dialog
    id="first-task-records"
    aria-label={w("已儲存對話", "Saved conversations")}
    className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-2xl border bg-white p-5 text-dark backdrop:bg-black/35"
  >
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-bold">{w("已儲存對話", "Saved conversations")}</h3>
      <button type="button" className={button} onClick={closeRecords}>{w("關閉", "Close")}</button>
    </div>
    {conversationRecords}
  </dialog> : <section className="mt-4 space-y-3 border-t border-dark/10 pt-4" aria-label={w("已儲存對話", "Saved conversations")}>
    <h4 className="text-sm font-semibold">{w("已儲存對話", "Saved conversations")} · {view.steps.find(s => s.id === step)?.current || 0} / {view.steps.find(s => s.id === step)?.target || 0}</h4>
    {conversationRecords}
  </section>)}
  </>;
}
