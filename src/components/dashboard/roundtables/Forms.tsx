"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useLocale } from "next-intl";
import { TextField, button } from "../flow/Templates";
import { STEPS, words } from "@/lib/action-plan/flow/catalog";
import { LANGUAGES, INDUSTRIES, mentorDraftSchema, type RoundtableMutation } from "@/lib/roundtables/schema";
import { industryLabel } from "@/lib/member-options";
import type { RoundtableState } from "@/lib/roundtables/service";
export const field = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-dark/20 bg-white px-3 py-2 text-sm focus-visible:outline-2";
export function useDraft<T>(key: string, initial: T, schema: z.ZodType<T>) {
  const [draft, setDraft] = useState(initial), [warning, setWarning] = useState("");
  const edited = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
    if (edited.current) return;
    try { const value = localStorage.getItem(key); if (value) { const parsed = schema.safeParse(JSON.parse(value)); if (parsed.success) { setDraft(parsed.data); setWarning("已載入本機草稿，送出前請核對目前狀態 / Local draft loaded; check current state before submitting"); } else setWarning("本機草稿格式已變更，伺服器資料保留 / Local draft format changed; server records retained"); } }
    catch { setWarning("本機草稿無法讀取，請先儲存再離開 / Local draft unavailable; save before leaving"); }
    }, 0); return () => clearTimeout(timer);
  }, [key, schema]);
  function change(next: T) { edited.current = true; setDraft(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { setWarning("本機暫存失敗，請先儲存再離開 / Local draft could not be saved"); } }
  function clear() { try { localStorage.removeItem(key); } catch { setWarning("伺服器已儲存，本機草稿未能清除 / Server saved; local draft could not be cleared"); } }
  return { draft, change, clear, warning };
}
const short = z.string().max(4000), strings = z.array(short).max(16);
const mentorForm = z.object({ publicName: short, bio: short, expertise: short, references: short, languages: strings, industries: strings, consent: z.boolean() });
const sessionForm = z.object({ topic: short, description: short, steps: strings, industry: short, languages: strings, start: short, duration: short, capacity: short, repeatCount: short.default("1"), frameworkStages: strings.default([]), registrationMode: short, meetingUrl: short, requestId: short });
const outcomesForm = z.array(z.object({ registrationId: short, attendance: short, title: short, criteria: short, dueDate: short })).max(5);
type Write = (input: unknown) => Promise<boolean>;
export function Choice({ label, value, options, onChange }: { label: string; value: string; options: Array<readonly [string, string]>; onChange(value: string): void }) {
  return <label className="block min-w-0 text-sm">{label}<select aria-label={label} className={field} value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>;
}
function Checks({ label, values, options, onChange }: { label: string; values: string[]; options: Array<readonly [string, string]>; onChange(value: string[]): void }) {
  return <fieldset><legend className="mb-2 text-sm font-semibold">{label}</legend><div className="flex flex-wrap gap-x-5 gap-y-1">{options.map(([key, text]) => <label key={key} className="flex min-h-11 min-w-0 items-center gap-2 break-words text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={values.includes(key)} onChange={e => onChange(e.target.checked ? [...values, key] : values.filter(v => v !== key))} />{text}</label>)}</div></fieldset>;
}
export function languageLabel(value: string, zh: boolean) { return ({ "zh-tw": zh ? "繁體中文" : "Traditional Chinese", en: "English", ja: zh ? "日文" : "Japanese", ko: zh ? "韓文" : "Korean", other: zh ? "其他（請在說明註明）" : "Other (specify in description)" })[value] || value; }
export function MentorForm({ userId, cert, disabled, write, error = "", notice = "" }: { userId: string; cert: RoundtableState["certification"]; disabled: boolean; write: Write; error?: string; notice?: string }) {
  const zh = useLocale() === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const { draft, change, clear, warning } = useDraft("nova:mentor:" + userId, { publicName: cert?.draft.publicName || "", bio: cert?.draft.bio || "", expertise: cert?.draft.expertise || "", references: cert?.draft.references.join("\n") || "", languages: cert?.draft.languages || ["en"], industries: cert?.draft.industries || ["all"], consent: false }, mentorForm);
  const [validation, setValidation] = useState("");
  const feedback = useRef<HTMLDivElement>(null), message = validation || error;
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  return <form className="space-y-4" onSubmit={async e => {
    e.preventDefault();
    const parsed = mentorDraftSchema.safeParse({ publicName: draft.publicName, bio: draft.bio, expertise: draft.expertise, references: draft.references.split("\n").map(v => v.trim()).filter(Boolean), languages: draft.languages, industries: draft.industries });
    if (!parsed.success) {
      const labels: Record<string, string> = { publicName: w("公開導師名稱", "Public mentor name"), bio: w("專業簡介", "Professional bio"), expertise: w("專業經驗", "Expertise"), references: w("佐證網址", "Evidence URLs"), languages: w("可用語言", "Languages"), industries: w("專業產業", "Industries") };
      setValidation("HTTP 400\n" + parsed.error.issues.map(i => (labels[String(i.path[0])] || i.path.join(".")) + (i.path[0] === "references" && typeof i.path[1] === "number" ? w(" · 第 " + (i.path[1] + 1) + " 行", " · line " + (i.path[1] + 1)) : "") + ": " + i.message).join("\n"));
      return;
    }
    setValidation("");
    if (await write({ action: "mentorApply", revision: cert?.revision || 0, draft: parsed.data, consent: draft.consent })) {
      change({ ...draft, ...parsed.data, references: parsed.data.references.join("\n") });
      clear();
    }
  }}>
    <fieldset disabled={disabled} className="space-y-4">
      <TextField label={w("公開導師名稱", "Public mentor name")} value={draft.publicName} onChange={v => change({ ...draft, publicName: v })} />
      <TextField multiline label={w("專業簡介（至少 20 字）", "Professional bio (at least 20 characters)")} value={draft.bio} onChange={v => change({ ...draft, bio: v })} />
      <TextField multiline label={w("可協助的問題與經驗（至少 10 字）", "Expertise and experience (at least 10 characters)")} value={draft.expertise} onChange={v => change({ ...draft, expertise: v })} />
      <TextField multiline label={w("佐證網址（每行一個，僅本人及管理員可見）", "Evidence URLs (one per line; private to you and administrators)")} value={draft.references} onChange={v => change({ ...draft, references: v })} />
      <p className="text-sm text-dark/65">{w("可直接貼上 www.linkedin.com/...；未填協定的完整網域會自動補上 https://。最多 5 個網址。", "You may paste www.linkedin.com/...; full domains without a protocol use https:// automatically. Up to five URLs.")}</p>
      <Checks label={w("可用語言", "Languages")} values={draft.languages} options={LANGUAGES.map(k => [k, languageLabel(k, zh)])} onChange={v => change({ ...draft, languages: v })} />
      <Checks label={w("專業產業", "Industries")} values={draft.industries} options={INDUSTRIES.map(k => [k, k === "all" ? w("不限產業", "All industries") : industryLabel(k, zh ? "zh-tw" : "en")])} onChange={v => change({ ...draft, industries: v })} />
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm"><input aria-label={w("同意認證資料使用", "Consent to certification use")} className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={draft.consent} onChange={e => change({ ...draft, consent: e.target.checked })} />{w("同意管理員核對佐證，通過後在主持場次公開名稱與簡介；不自動變更會員角色、照片或方案。", "Allow administrators to review references and publish my name and bio on hosted sessions after approval. My member role, photo and plan stay under my control.")}</label>
      <button className={button + " bg-black text-white"} disabled={disabled || !draft.consent}>{w("送出導師認證申請", "Submit mentor application")}</button>
    </fieldset>
    {message && <div ref={feedback} tabIndex={-1} role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800">{message}</div>}
    {!message && notice && <p role="status" className="rounded-xl bg-dark/5 p-4 text-sm">{notice}</p>}
    {warning && <p role="status" className="text-sm">{warning}</p>}
  </form>;
}
export function SessionForm({ userId, initial, disabled, write }: { userId: string; initial?: RoundtableState["sessions"][number]; disabled: boolean; write: Write }) {
  const locale = useLocale(), zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  // The local input uses the browser's time zone; the server receives explicit UTC instants.
  const localTime = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const { draft, change, clear, warning } = useDraft("nova:roundtable-form:" + userId + ":" + (initial?.id || "new"), { topic: initial?.topic || "", description: initial?.description || "", steps: initial?.steps || ["01-1"], industry: initial?.industry || "all", languages: initial?.languages || ["en"], start: initial ? localTime(initial.startsAt) : "", repeatCount: "1", frameworkStages: initial?.frameworkStages.map(String) || [], duration: initial ? String((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 60000) : "60", capacity: String(initial?.capacity || 6), registrationMode: initial?.registrationMode || "approval", meetingUrl: initial?.meetingUrl || "", requestId: "" }, sessionForm);
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); const start = new Date(draft.start); const requestId = draft.requestId || crypto.randomUUID(); change({ ...draft, requestId }); void write({ action: initial ? "edit" : "create", ...(initial ? { id: initial.id, revision: initial.revision } : { requestId }), draft: { topic: draft.topic, description: draft.description, steps: draft.steps, industry: draft.industry, languages: draft.languages, startsAt: Number.isFinite(start.getTime()) ? start.toISOString() : "", endsAt: Number.isFinite(start.getTime()) ? new Date(start.getTime() + Number(draft.duration) * 60000).toISOString() : "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, repeatCount: initial ? 1 : Number(draft.repeatCount), frameworkStages: draft.frameworkStages.map(Number), capacity: Number(draft.capacity), registrationMode: draft.registrationMode, meetingUrl: draft.meetingUrl } }).then(ok => { if (ok) { clear(); if (!initial) change({ ...draft, topic: "", description: "", meetingUrl: "", start: "", requestId: "" }); } }); }}><fieldset disabled={disabled} className="space-y-4"><TextField label={w("圓桌主題", "Session topic")} value={draft.topic} onChange={v => change({ ...draft, topic: v })} /><TextField multiline label={w("交流目的與會前準備", "Purpose and preparation")} value={draft.description} onChange={v => change({ ...draft, description: v })} /><Checks label={w("適合的今日任務步驟", "Relevant task steps")} values={draft.steps} options={STEPS.map(s => [s.id, s.id + " " + words(s.title, locale)])} onChange={v => change({ ...draft, steps: v })} /><div className="grid gap-4 sm:grid-cols-2"><Choice label={w("產業", "Industry")} value={draft.industry} options={INDUSTRIES.map(k => [k, k === "all" ? w("不限產業", "All industries") : industryLabel(k, locale)])} onChange={v => change({ ...draft, industry: v })} /><Choice label={w("總人數（含主持導師）", "Total capacity (including the host)")} value={draft.capacity} options={["4", "5", "6"].map(v => [v, v])} onChange={v => change({ ...draft, capacity: v })} /></div><Checks label={w("適合的驗證階段（非里程碑；可複選）", "Relevant evidence stages (separate from milestones)")} values={draft.frameworkStages} options={[1,2,3,4,5].map(n => [String(n), String(n)])} onChange={v => change({ ...draft, frameworkStages: v })} />{!initial && <Choice label={w("系列場次（每兩週；每場皆由本人主持）", "Series sessions (fortnightly; you host each session)")} value={draft.repeatCount} options={[1,2,3,4,5,6].map(n => [String(n), String(n)])} onChange={v => change({ ...draft, repeatCount: v })} />}<Checks label={w("會議語言", "Session languages")} values={draft.languages} options={LANGUAGES.map(k => [k, languageLabel(k, zh)])} onChange={v => change({ ...draft, languages: v })} /><div className="grid gap-4 sm:grid-cols-2"><TextField type="datetime-local" label={w("開始時間（使用瀏覽器時區）", "Start time (your browser time zone)")} value={draft.start} onChange={v => change({ ...draft, start: v })} /><Choice label={w("會議長度", "Duration")} value={draft.duration} options={["30", "60", "90", "120", "150", "180"].map(v => [v, v + w(" 分鐘", " minutes")])} onChange={v => change({ ...draft, duration: v })} /></div><p className="text-sm text-dark/60">{w("時間會儲存為 UTC，其他會員依自己的時區查看。", "Times are stored as UTC and displayed in each member's local time zone.")}</p><Choice label={w("報名方式", "Registration mode")} value={draft.registrationMode} options={[["approval", w("導師審核，額滿候補", "Host approval, then waitlist")], ["instant", w("自動確認，額滿候補", "Automatic confirmation, then waitlist")]]} onChange={v => change({ ...draft, registrationMode: v })} /><TextField type="url" label={w("HTTPS 會議連結（僅主持與正式成員可見）", "HTTPS meeting URL (host and confirmed members only)")} value={draft.meetingUrl} onChange={v => change({ ...draft, meetingUrl: v })} /><button className={button + " bg-black text-white"} disabled={disabled}>{initial ? w("儲存場次修改", "Save session changes") : w("建立圓桌會議", "Create roundtable")}</button>{!initial && draft.requestId && <div className="space-y-2"><p className="text-xs text-dark/60">{w("若無法確認上次是否建立成功，請先查看我的主持紀錄。新的草稿不會更動已存場次。", "If the last result is uncertain, check your hosted sessions first. A new draft retains existing sessions.")}</p><button type="button" className={button} disabled={disabled} onClick={() => change({ ...draft, requestId: "" })}>{w("開始另一場圓桌草稿", "Start another roundtable draft")}</button></div>}</fieldset>{warning && <p role="status" className="text-sm">{warning}</p>}</form>;
}
export function OutcomesForm({ userId, session, disabled, write }: { userId: string; session: RoundtableState["sessions"][number]; disabled: boolean; write: Write }) {
  const zh = useLocale() === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const initial = session.people.filter(p => p.status === "confirmed").map(p => ({ registrationId: p.id, attendance: "", title: "", criteria: "", dueDate: "" }));
  const { draft, change, clear, warning } = useDraft("nova:roundtable-outcomes:" + userId + ":" + session.id, initial, outcomesForm);
  const rows = initial.map(row => draft.find(saved => saved.registrationId === row.registrationId) || row);
  function update(index: number, patch: Partial<typeof draft[number]>) { change(rows.map((r, i) => i === index ? { ...r, ...patch } : r)); }
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); const entries = rows.map(r => ({ registrationId: r.registrationId, attendance: r.attendance, ...(r.attendance === "attended" ? { commitment: { title: r.title, criteria: r.criteria, dueDate: r.dueDate } } : {}) })); void write({ action: "finish", id: session.id, revision: session.revision, entries } as RoundtableMutation).then(ok => { if (ok) clear(); }); }}><p className="text-sm">{w("請與成員核對實際承諾，出席者各建立一項附加待辦。內容對本場正式成員公開，不修改 16 步。", "Confirm each attendee's actual commitment. One additional task is created per attendee and shared within this session; the sixteen-step workflow is retained.")}</p><fieldset disabled={disabled} className="space-y-4">{rows.map((r, i) => <div key={r.registrationId} className="space-y-3 rounded-xl border p-4"><h4 className="font-bold">{session.people.find(p => p.id === r.registrationId)?.name}</h4><Choice label={w("實際出席", "Attendance")} value={r.attendance} options={session.people.find(p => p.id === r.registrationId)?.unavailable ? [["", w("請選擇", "Choose")], ["absent", w("未出席", "Absent")]] : [["", w("請選擇", "Choose")], ["attended", w("出席", "Attended")], ["absent", w("未出席", "Absent")]]} onChange={v => update(i, { attendance: v })} />{r.attendance === "attended" && <><TextField label={w("承諾行動", "Committed action")} value={r.title} onChange={v => update(i, { title: v })} /><TextField multiline label={w("可衡量的完成標準", "Measurable completion criteria")} value={r.criteria} onChange={v => update(i, { criteria: v })} /><TextField type="date" label={w("承諾期限", "Commitment deadline")} value={r.dueDate} onChange={v => update(i, { dueDate: v })} /></>}</div>)}<button className={button + " bg-black text-white"} disabled={disabled}>{w("確認結案並寫入今日任務", "Finish and add commitments to today's tasks")}</button></fieldset>{warning && <p role="status" className="text-sm">{warning}</p>}</form>;
}
