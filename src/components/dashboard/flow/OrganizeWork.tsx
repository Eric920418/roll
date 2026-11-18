"use client";
import { planText } from "@/lib/action-plan/display";
import { completedText } from "@/lib/action-plan/flow/evaluate";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STEPS, MILESTONES, words, type FlowData, type StepId } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import PositioningEditor, { positioningPreview } from "./PositioningEditor";
import CriteriaEditor, { CriteriaTable } from "./CriteriaEditor";
import LearningResources from "../LearningResources";
import { button } from "./Templates";

type Data = Extract<FlowData, { kind: "organize" }>;
export type ConfirmationRecipient = { leadId: string; email: string };
export type ParticipantLink = { leadId: string; href: string };
export function TaskSection({ number, title, detail }: { number: string; title: string; detail?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-baseline gap-3 text-base font-bold"><span className="text-[10px] font-normal tracking-widest text-dark/45">{number}</span>{title}</h2>{detail && <div className="text-xs text-dark/45">{detail}</div>}</div>;
}

export default function OrganizeWork({ step, data, view, locale, disabled, readOnly, onChange, onSave, onLinks, onEmail, links, notice }: {
  step: "01-2" | "01-3"; data: Data; view: Pick<FlowView, "leads" | "positioningReplies"> & { participantEmails?: FlowView["participantEmails"]; steps: Array<{ id: StepId; data: FlowData }> }; locale: string; disabled: boolean; readOnly: boolean;
  onChange(data: Data): void; onSave(data?: Data): void; onLinks?(ids: string[], save: boolean): void; onEmail?(recipients: ConfirmationRecipient[], reminder: boolean): Promise<string | null>; links: ParticipantLink[]; onRefresh(): void; notice: string;
}) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const [selected, setSelected] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const sendDialog = useRef<HTMLDialogElement>(null);
  const [toSend, setToSend] = useState<string[]>([]), [reminder, setReminder] = useState(false), [emails, setEmails] = useState<Record<string, string>>({}), [sendError, setSendError] = useState(""), [sending, setSending] = useState(false);
  const positioning = step === "01-2", active = data.criteria.find(c => c.id === selected) || data.criteria[0];
  const savedData = view.steps.find(s => s.id === step)?.data;
  const recipients = data.selections.filter(id => view.leads.some(l => l.id === id));
  const preview = positioningPreview(data.values, zh);
  const canPrepare = completedText(data.values.positioning || "") && (data.values.positioningMode !== "structured" || Boolean(preview)) && (!preview || preview === data.values.positioning);
  const confirmed = view.positioningReplies.filter(r => r.answer === "yes").length;
  const tableLeads = view.leads.filter(l => recipients.includes(l.id) || links.some(v => v.leadId === l.id) || view.positioningReplies.some(r => r.leadId === l.id && r.answer));
  function send(ids: string[], save: boolean) {
    if (!onEmail) { onLinks?.(ids, save); return; }
    if (save && confirmed >= 5 && savedData?.kind === "organize" && savedData.values.positioning === data.values.positioning) {
      onSave(data); return;
    }
    const pending = ids.filter(id => savedData?.kind !== "organize" || data.values.positioning !== savedData.values.positioning || !view.positioningReplies.some(reply => reply.leadId === id && reply.answer));
    setToSend(pending);
    setReminder(!save);
    setSendError("");
    sendDialog.current?.showModal();
  }
  async function copy(item: ParticipantLink) {
    const lead = view.leads.find(l => l.id === item.leadId);
    const statement = savedData?.kind === "organize" ? savedData.values.positioning : "";
    const text = w("您好 ", "Hello ") + (lead?.name || lead?.company || "") + w("，想請您確認這句話是否描述您的情況：", ", does this statement describe your situation?") + "\n" + statement + "\n" + item.href;
    try { await navigator.clipboard.writeText(text); setCopyStatus(w("已複製，請自行傳給對方。", "Copied. Send this message to the participant.")); }
    catch { setCopyStatus(w("無法使用剪貼簿，請手動複製下方訊息。", "Clipboard unavailable. Copy the message below manually.") + "\n" + text); }
  }
  return <>
    <div data-task-section="work" className="space-y-3">
    <TaskSection number="02" title={positioning ? w("定位草稿", "Positioning draft") : w("新增或修改評分條件", "Add or edit qualification criteria")} detail={positioning ? !view.leads.length ? w("尚無已儲存對話", "No saved conversations yet") : readOnly ? w(`已儲存 ${view.leads.length} 次對話`, `${view.leads.length} saved conversations`) : w(`依 ${view.leads.length} 次已存對話整理，可直接修改`, `Based on ${view.leads.length} saved conversations; edit as needed`) : w(`目前 ${data.criteria.length} 項條件`, `${data.criteria.length} criteria`)} />
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-task-columns>
      <section id="task-work" className="min-w-0 space-y-5 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6 [&_input:not([type=checkbox])]:min-h-[44px] [&_input:not([type=checkbox])]:py-[7px]" aria-label={positioning ? w("定位草稿", "Positioning draft") : w("評分條件", "Qualification criterion")}>
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {positioning ? <>
          <fieldset disabled={readOnly || disabled}><PositioningEditor data={data} locale={locale} readOnly={readOnly} compact onChange={onChange} /></fieldset>
          <div id="positioning-recipients" className="scroll-mt-6 space-y-2"><p className="text-sm font-semibold">{w("寄給哪些受訪者確認（至少 5 位）", "Who should confirm this? (at least five)")}</p><div className="flex gap-2 overflow-x-auto pb-2" role="group" aria-label={w("選擇受訪者", "Choose participants")}>{view.leads.map(l => <button type="button" key={l.id} title={l.company + " · " + l.name} aria-label={l.company + " · " + l.name} disabled={disabled || readOnly} aria-pressed={recipients.includes(l.id)} className={"min-h-[44px] max-w-40 shrink-0 truncate rounded-full border border-dark/15 px-3.5 py-2 text-xs font-semibold focus-visible:outline-2 " + (recipients.includes(l.id) ? "bg-black text-white" : "bg-white text-dark/65")} onClick={() => onChange({ ...data, selections: recipients.includes(l.id) ? recipients.filter(id => id !== l.id) : [...recipients, l.id] })}>{l.company}</button>)}</div></div>
        </> : <CriteriaEditor data={data} view={view} locale={locale} readOnly={readOnly} disabled={disabled} selected={active?.id} onSelect={setSelected} onChange={onChange} />}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark/10 pt-4">
          <p className="text-xs text-dark/50">{positioning ? w("NOVA 會產生一段確認訊息，受訪者點選即可回覆。", "NOVA prepares a confirmation message that participants can open to reply.") : w(`權重總和需為 100%，目前 ${data.criteria.reduce((sum, c) => sum + c.weight, 0)}%`, `Total required: 100%; currently ${data.criteria.reduce((sum, c) => sum + c.weight, 0)}%`)}</p>
          {!readOnly && !positioning && active && !completedText(active.label) && <p role="status" className="text-xs text-amber-800">{w("請填寫至少 3 個字元的具體條件，不要使用待補文字。", "Enter a specific criterion with at least three characters; avoid placeholders.")}</p>}
          {!readOnly && <div className="flex flex-wrap gap-2"><button type="button" className={button + " rounded-full! bg-black text-white"} disabled={disabled || (positioning ? recipients.length < 5 || !canPrepare : !active || !completedText(active.label))} onClick={() => positioning ? send(recipients, true) : onSave({ ...data, criteria: data.criteria.map(c => c.id === active?.id ? { ...c, confirmed: true } : c) })}>{positioning ? w("儲存並寄送", "Save and send") : w("儲存條件", "Save criterion")}</button></div>}
        </div>
        {!positioning && !readOnly && <button id="add-criterion" type="button" hidden disabled={disabled || data.criteria.length >= 6} onClick={() => { const id = crypto.randomUUID(); onChange({ ...data, criteria: [...data.criteria, { id, label: "", weight: 10, sources: [], confirmed: false }] }); setSelected(id); }}>{w("新增條件", "Add criterion")}</button>}
      </section>
      <aside className="min-w-0 space-y-4 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6" aria-label={w("方法指引", "Method guide")}>
        <div><p className="text-[10px] tracking-wider text-dark/45">{w("方法指引", "METHOD GUIDE")}</p><h3 className="mt-2 text-sm font-bold">{positioning ? w("一句話定位怎麼寫", "How to write your positioning statement") : w("好的評分條件是什麼", "What makes a good qualification criterion?")}</h3></div>
        {positioning ? <LearningResources kind="positioning" question={w("一句話定位怎麼寫", "How to write your positioning statement")} visual /> : <div className="flex aspect-video items-center justify-center rounded-xl bg-[#111114] p-5 text-center text-xs text-white/65">{w("方法影片待補", "Method video coming soon")}</div>}
        <div className="space-y-2 text-xs leading-6"><h4 className="font-bold">{positioning ? w("寫法", "Writing tips") : w("三個原則", "Three principles")}</h4>{positioning ? <><p>{w("格式：為（誰），在（情境）時，解決（痛點），透過（不同的做法）。", "Format: For (who), when (situation), solve (problem) through (a different approach).")}</p><p>{w("用客戶自己說過的話，而不是你的產品功能。", "Use your customers’ words, rather than listing product features.")}</p><p>{w("確認的重點：至少 5 位受訪者都認為「這就是我」。若回覆不太像，請回到對話紀錄找原因。", "Ask at least five participants whether this describes them. Revisit their conversation if it does not fit.")}</p></> : <ol className="list-inside list-decimal space-y-2"><li>{w("聯絡前就查得到（不必先打電話）。", "Observable before contacting the company.")}</li><li>{w("與付費意願有關，並附上對話佐證。", "Related to willingness to pay, with conversation evidence.")}</li><li>{w("保留 4–6 項，避免太多條件讓分數失去意義。", "Keep four to six criteria so scores remain meaningful.")}</li></ol>}{!positioning && <p>{w("少於 3 次對話佐證的條件，會先列為觀察條件，不計入評分。", "Fewer than three supporting conversations means an observation, excluded from scoring.")}</p>}</div>
      </aside>
    </div>
    </div>
    {positioning && onEmail && <dialog ref={sendDialog} aria-labelledby="positioning-email-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-dark/15 bg-white p-5 text-dark backdrop:bg-black/35" onCancel={event => { if (sending) event.preventDefault(); }}>
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (sending || !toSend.length) return;
        const selected = new FormData(event.currentTarget);
        setSending(true); setSendError("");
        try {
          const error = await onEmail(toSend.map(leadId => ({ leadId, email: String(selected.get(leadId) || "") })), reminder);
          if (error) setSendError(error);
          else sendDialog.current?.close();
        } finally { setSending(false); }
      }}>
        <h3 id="positioning-email-title" className="font-bold">{w("寄送確認訊息", "Send confirmation messages")}</h3>
        <fieldset className="space-y-3" disabled={sending}>
          {toSend.map(id => {
            const lead = view.leads.find(l => l.id === id);
            return <label key={id} className="block text-sm">{lead?.company} · {lead?.name}
              <input name={id} type="email" required maxLength={254} placeholder={w("收件 Email", "Recipient email")} value={emails[id] ?? view.participantEmails?.find(r => r.leadId === id)?.email ?? ""} onChange={event => setEmails(values => ({ ...values, [id]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-dark/20 px-3 text-sm" />
            </label>;
          })}
        </fieldset>
        {!toSend.length && <p role="status" className="text-sm">{w("所選受訪者都已回覆，請選擇其他受訪者。", "All selected participants have replied. Choose other participants.")}</p>}
        {sendError && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{sendError}</p>}
        <div className="flex justify-end gap-2">
          <button className={button} disabled={sending} type="button" onClick={() => sendDialog.current?.close()}>{w("取消", "Cancel")}</button>
          <button className={button + " bg-black text-white"} disabled={sending || !toSend.length} type="submit">{sending ? w("寄送中…", "Sending…") : w("寄送", "Send")}</button>
        </div>
      </form>
    </dialog>}
    {positioning ? <section data-next-step="insights" data-task-section="results" id="positioning-confirmations" className="scroll-mt-6 space-y-3" aria-label={w("受訪者確認", "Participant confirmations")}>
      <TaskSection number="03" title={w(`受訪者確認：${confirmed} 位認為描述準確`, `Participant confirmations: ${confirmed} say it fits`)} detail={<span className="inline-flex items-center gap-3">{w("目標 5 位", "Target: five")}</span>} />
      <div className="overflow-x-auto rounded-2xl border border-dark/10 bg-white px-5"><table className="w-full min-w-115 text-left text-sm"><thead className="text-xs text-dark/45"><tr>{[w("受訪者", "Participant"), w("回覆", "Response"), w("回饋", "Feedback")].map(label => <th scope="col" key={label} className="border-b border-dark/10 py-4 pr-4 font-medium">{label}</th>)}</tr></thead><tbody>{tableLeads.map(l => { const reply = view.positioningReplies.find(r => r.leadId === l.id), item = links.find(v => v.leadId === l.id); return <tr key={l.id} className="border-b border-dark/5 last:border-0"><th scope="row" className="py-4 pr-4 font-semibold">{l.company} · {l.name}</th><td className="pr-4"><span className={"inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs " + (reply?.answer === "yes" ? "bg-black text-white" : reply?.answer === "no" ? "bg-amber-50 text-amber-800" : "bg-dark/5 text-dark/55")}>{reply?.answer === "yes" ? w("符合", "Fits") : reply?.answer === "no" ? w("不太像", "Does not fit") : w("未回覆", "No response")}</span></td><td className="py-2 text-xs">{reply?.answer ? <span>{reply.feedback || "—"}</span> : !readOnly && <button type="button" className={button + " rounded-full!"} disabled={disabled || JSON.stringify(data) !== JSON.stringify(savedData)} onClick={() => item && !onEmail ? void copy(item) : send([l.id], false)}>{w("再次提醒", "Remind again")}</button>}</td></tr>; })}</tbody></table>{!tableLeads.length && <p className="py-5 text-sm text-dark/60">{w("選擇受訪者並儲存後，在這裡追蹤確認回覆。", "Choose participants and save to track their confirmations here.")}</p>}</div>
      {links.length > 0 && <details open className="space-y-3 rounded-2xl border border-dark/10 bg-white p-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{w("確認訊息已備妥，尚未寄送", "Confirmation messages ready; not sent")}</summary>{links.map(item => { const lead = view.leads.find(l => l.id === item.leadId); return <div key={item.leadId} className="flex flex-wrap items-center justify-between gap-2 border-t border-dark/10 py-3"><label className="min-w-0 flex-1 text-xs">{lead?.company} · {lead?.name}<input readOnly aria-label={(lead?.company || "") + w("確認連結", " confirmation link")} value={item.href} onFocus={e => e.target.select()} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border px-3 text-xs" /></label><button type="button" className={button} onClick={() => void copy(item)}>{w("複製訊息", "Copy message")}</button></div>; })}</details>}
      {copyStatus && <p role="status" className="whitespace-pre-wrap break-words text-sm">{copyStatus}</p>}
    </section> : <section data-next-step="insights" data-task-section="results" className="space-y-3"><TaskSection number="03" title={w(`評分標準：${data.criteria.length} 項條件，${data.criteria.filter(c => c.confirmed && completedText(c.label)).length} 項已確認`, `Qualification standard: ${data.criteria.length} criteria, ${data.criteria.filter(c => c.confirmed && completedText(c.label)).length} confirmed`)} detail={w("佐證＝有意願付費者中符合條件的比例", "Evidence: share of willing participants supporting the criterion")} /><CriteriaTable data={data} view={view} locale={locale} selected={active?.id} onSelect={id => { setSelected(id); document.getElementById("task-work")?.scrollIntoView({ block: "start" }); document.querySelector<HTMLInputElement>("#task-work input")?.focus(); }} /></section>}
  </>;
}

export function TaskRoadmap({ view, selected, locale, onSelect }: { view: FlowView; selected: StepId; locale: string; onSelect(id: StepId): void }) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b, spec = STEPS.find(s => s.id === selected)!;
  const milestones = view.plan.roadmap?.milestones || [], current = milestones[spec.milestone], steps = STEPS.filter(s => s.milestone === spec.milestone);
  const details = useRef<HTMLDetailsElement>(null);
  const firstStep = steps[0].id === selected && view.current === selected && !view.archived;
  useEffect(() => {
    if (!firstStep || !details.current) return;
    try {
      const key = "nova:flow-map:" + view.plan.id + ":" + spec.milestone;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "seen");
      details.current.open = true;
    } catch {
      // Manual expansion remains available when the browser cannot store the preference.
    }
  }, [firstStep, spec.milestone, view.plan.id]);

  return <section className="space-y-3" id="action-map" data-next-step="map" data-task-roadmap data-task-section="map">
    <TaskSection number={["01-1", "03-1", "04-1", "05-2"].includes(selected) ? "05" : "04"} title={w("行動地圖", "Action map")} detail={w("點開可查看全部里程碑與每一步", "Expand to view every milestone and step")} />
    <details ref={details} className="rounded-2xl border border-dark/10 bg-white px-5">
      <summary className="flex min-h-26 cursor-pointer list-none flex-wrap items-center gap-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-[10px] tracking-wider text-dark/45">{w("目前位置", "CURRENT POSITION")}</p>
          <p className="mt-2 text-sm font-bold">{w("里程碑", "Milestone")} {String(spec.milestone + 1).padStart(2, "0")}　{words(MILESTONES[spec.milestone], locale)}</p>
          <p className="mt-1 text-xs text-dark/50">{steps.findIndex(s => s.id === selected) + 1} / {steps.length} · {w("截止", "Due")} {current?.targetDate || "—"}</p>
        </div>
        <div className="min-w-20 flex-1">
          <div className="flex gap-1">{milestones.map((m, i) => <span key={m.id} className={"h-1 flex-1 rounded-full " + (m.achievedAt || i === spec.milestone ? "bg-dark/50" : "bg-dark/10")} />)}</div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-dark/45"><span>{w("里程碑", "Milestone")} {String(spec.milestone + 1).padStart(2, "0")}</span><span>{String(milestones.length).padStart(2, "0")} · {view.plan.roadmap?.deadline || "—"}</span></div>
        </div>
        <span className={button + " rounded-full! text-xs"}>{w(`查看全部 ${milestones.length} 個里程碑`, `View all ${milestones.length} milestones`)} →</span>
      </summary>
      <ol className="space-y-4 border-t border-dark/10 py-5">{milestones.map((m, i) => <li key={m.id}>
        <h4 className="text-sm font-bold">{String(i + 1).padStart(2, "0")} · {planText(m.title, locale)} <span className="font-normal text-dark/45">{m.targetDate}</span></h4>
        <ol className="mt-2 grid gap-2 sm:grid-cols-2">{view.steps.filter(s => s.milestone === i).map(s => <li key={s.id}>
          {s.done || s.id === view.current ? <button type="button" aria-current={s.id === selected ? "step" : undefined} className="min-h-11 w-full rounded-xl border border-dark/10 px-3 py-2 text-left text-xs aria-[current=step]:border-black aria-[current=step]:bg-dark/5" onClick={() => onSelect(s.id)}>
            {s.id} · {s.title} · {s.done ? w("已完成", "Done") : w("進行中", "Current")}
          </button> : <div className="rounded-xl border border-dark/10 px-3 py-2 text-xs text-dark/65">
            <p className="font-semibold">{s.id} · {s.title}</p>
            <p className="mt-1">{words(STEPS.find(step => step.id === s.id)!.criteria, locale)}</p>
            <p className="mt-1">{w("完成上一步後開啟", "Opens after the previous step")}</p>
          </div>}
        </li>)}</ol>
      </li>)}</ol>
    </details>
  </section>;
}
