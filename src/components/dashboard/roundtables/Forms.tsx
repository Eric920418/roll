"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
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
const mentorForm = z.object({ publicName: short, bio: short, expertise: short, references: short, languages: strings, industries: strings, consent: z.boolean(), revision: z.number().int().nonnegative().optional() });
const sessionForm = z.object({ topic: short, description: short, steps: strings, industry: short, languages: strings, start: short, duration: short, capacity: short, repeatCount: short.default("1"), frameworkStages: strings.default([]), registrationMode: short, meetingUrl: short, requestId: short, revision: z.number().int().nonnegative().optional() });
const outcomesForm = z.array(z.object({ registrationId: short, attendance: short, title: short, criteria: short, dueDate: short })).max(9);
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
  const { draft, change, clear, warning } = useDraft("nova:mentor:" + userId, { publicName: cert?.draft.publicName || "", bio: cert?.draft.bio || "", expertise: cert?.draft.expertise || "", references: cert?.draft.references.join("\n") || "", languages: cert?.draft.languages || ["en"], industries: cert?.draft.industries || ["all"], consent: false, revision: cert?.revision || 0 } as z.infer<typeof mentorForm>, mentorForm);
  const [validation, setValidation] = useState("");
  const feedback = useRef<HTMLDivElement>(null), message = validation || error;
  const revision = draft.revision ?? (cert ? -1 : 0), conflict = revision !== (cert?.revision || 0);
  useEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  return <form className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" onSubmit={async e => {
    e.preventDefault();
    if (conflict) { setValidation(w("HTTP 409\n請先比較最新申請，再確認使用最新版本重試。", "HTTP 409\nCompare the latest application before retrying.")); return; }
    const parsed = mentorDraftSchema.safeParse({ publicName: draft.publicName, bio: draft.bio, expertise: draft.expertise, references: draft.references.split("\n").map(v => v.trim()).filter(Boolean), languages: draft.languages, industries: draft.industries });
    if (!parsed.success) {
      const labels: Record<string, string> = { publicName: w("公開導師名稱", "Public mentor name"), bio: w("專業簡介", "Professional bio"), expertise: w("專業經驗", "Expertise"), references: w("佐證網址", "Evidence URLs"), languages: w("可用語言", "Languages"), industries: w("專業產業", "Industries") };
      setValidation("HTTP 400\n" + parsed.error.issues.map(i => (labels[String(i.path[0])] || i.path.join(".")) + (i.path[0] === "references" && typeof i.path[1] === "number" ? w(" · 第 " + (i.path[1] + 1) + " 行", " · line " + (i.path[1] + 1)) : "") + ": " + (i.code === "too_small" ? w(`至少提供 ${i.minimum} ${["references","languages","industries"].includes(String(i.path[0])) ? "項" : "字"}。`, `Provide at least ${i.minimum} ${["references","languages","industries"].includes(String(i.path[0])) ? "items" : "characters"}.`) : i.code === "too_big" ? w(`最多 ${i.maximum} ${["references","languages","industries"].includes(String(i.path[0])) ? "項" : "字"}。`, `Use at most ${i.maximum} items or characters.`) : i.message.includes(" / ") ? i.message.split(" / ")[zh ? 0 : 1] : i.path[0] === "references" ? w("請提供可驗證的 HTTPS 網址。", "Provide a valid HTTPS reference URL.") : i.message)).join("\n"));
      return;
    }
    setValidation("");
    if (await write({ action: "mentorApply", revision, draft: parsed.data, consent: draft.consent })) {
      change({ ...draft, ...parsed.data, references: parsed.data.references.join("\n"), revision: revision + 1 });
      clear();
    }
  }}>
    <div className="min-w-0 space-y-4">
    <fieldset disabled={disabled} className="min-w-0 space-y-5">
      <TextField label={w("公開導師名稱", "Public mentor name")} value={draft.publicName} onChange={v => change({ ...draft, publicName: v })} />
      <section className="space-y-3"><h4 className="text-sm font-bold">{w("01 · LinkedIn／其他可驗證連結", "01 · LinkedIn / verifiable references")}</h4>
      <TextField multiline hideLabel label={w("佐證網址", "Evidence URLs")} value={draft.references} onChange={v => change({ ...draft, references: v })} />
      </section>
      <section className="space-y-3"><h4 className="text-sm font-bold">{w("02 · 專業領域", "02 · Areas of expertise")}</h4>
      <TextField multiline hideLabel label={w("專業經驗", "Expertise")} value={draft.expertise} onChange={v => change({ ...draft, expertise: v })} />
      </section>
      <section className="space-y-3"><h4 className="text-sm font-bold">{w("03 · 公開簡介與可驗證的經歷", "03 · Public bio and verifiable experience")}</h4>
      <TextField multiline hideLabel label={w("專業簡介", "Professional bio")} value={draft.bio} onChange={v => change({ ...draft, bio: v })} />
      </section>
      <details className="rounded-xl border border-dark/15 p-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{w("其他設定", "Other settings")} · {draft.languages.map(v=>languageLabel(v,zh)).join(" / ")} · {draft.industries.map(v=>v==='all'?w('不限產業','All industries'):industryLabel(v,zh?'zh-tw':'en')).join(" / ")}</summary><div className="space-y-4 pt-3">
      <Checks label={w("可用語言", "Languages")} values={draft.languages} options={LANGUAGES.map(k => [k, languageLabel(k, zh)])} onChange={v => change({ ...draft, languages: v })} />
      <Checks label={w("專業產業", "Industries")} values={draft.industries} options={INDUSTRIES.map(k => [k, k === "all" ? w("不限產業", "All industries") : industryLabel(k, zh ? "zh-tw" : "en")])} onChange={v => change({ ...draft, industries: v })} />
      </div></details>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm"><input aria-label={w("同意認證資料使用", "Consent to certification use")} className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={draft.consent} onChange={e => change({ ...draft, consent: e.target.checked })} />{w("同意管理員核對佐證，通過後在主持場次公開名稱與簡介；不自動變更會員角色、照片或方案。", "Allow administrators to review references and publish my name and bio on hosted sessions after approval. My member role, photo and plan stay under my control.")}</label>
      <button className={button + " bg-black text-white"} disabled={disabled || !draft.consent || conflict}>{w("送出導師認證申請", "Submit mentor application")}</button>
    </fieldset>
    {conflict && <section aria-label={w("最新導師申請比較", "Compare latest mentor application")} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><h4 className="font-bold">{w("申請已更新，請先比較", "Your application changed. Compare before retrying.")}</h4><p>{w("目前輸入完整保留；以下是伺服器最新資料。", "Your input is retained. The latest server record is shown below.")}</p>{cert ? <><p>{cert.status === "pending" ? w("待 NOVA 審核", "Awaiting NOVA review") : cert.status === "rejected" ? w("需補正", "More information required") : cert.status === "approved" ? w("申請通過", "Approved") : w("已撤銷", "Revoked")} · {cert.note}</p><dl className="space-y-2"><div><dt>{w("公開導師名稱", "Public mentor name")}</dt><dd>{cert.draft.publicName}</dd></div><div><dt>{w("佐證網址", "Evidence URLs")}</dt><dd className="whitespace-pre-wrap break-all">{cert.draft.references.join("\n")}</dd></div><div><dt>{w("專業經驗", "Expertise")}</dt><dd className="whitespace-pre-wrap">{cert.draft.expertise}</dd></div><div><dt>{w("專業簡介", "Professional bio")}</dt><dd className="whitespace-pre-wrap">{cert.draft.bio}</dd></div><div><dt>{w("語言／產業", "Languages / industries")}</dt><dd>{cert.draft.languages.map(v=>languageLabel(v,zh)).join(" / ")} · {cert.draft.industries.map(v=>v==='all'?w('不限產業','All industries'):industryLabel(v,zh?'zh-tw':'en')).join(" / ")}</dd></div></dl></> : <p>{w("目前尚無已送出的申請。", "No application has been submitted yet.")}</p>}<button type="button" className={button} disabled={disabled} onClick={()=>{change({...draft,revision:cert?.revision||0});setValidation("");}}>{w("已比較，使用最新版本重試", "Compared; use latest version to retry")}</button></section>}
    {message && <div ref={feedback} tabIndex={-1} role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800">{message}</div>}
    {!message && notice && <p role="status" className="rounded-xl bg-dark/5 p-4 text-sm">{notice}</p>}
    {warning && <p role="status" className="text-sm">{warning.split(" / ")[zh ? 0 : 1] || warning}</p>}
    </div>
    <aside className="min-w-0 space-y-4 rounded-xl bg-dark/5 p-4 sm:p-5"><h4 className="text-base font-bold">{w("NOVA 會審核這 3 項", "What NOVA reviews")}</h4><ol className="list-decimal space-y-3 pl-5 text-sm leading-7"><li>{w("能核對身分或經歷的公開連結。", "Public links that verify your identity or experience.")}</li><li>{w("與創辦人需求相關的專業領域。", "Expertise relevant to founders' needs.")}</li><li>{w("至少一項可驗證的專業經歷或案例。", "At least one verifiable role, experience or case.")}</li></ol></aside>
  </form>;
}
function Segments({ label, values, options, multiple = false, pills = false, onChange }: { label: string; values: string[]; options: Array<readonly [string, string]>; multiple?: boolean; pills?: boolean; onChange(values: string[]): void }) {
  return <fieldset className="min-w-0"><legend className="mb-2 text-base font-medium sm:text-lg">{label}</legend><div className={pills ? "flex flex-wrap gap-2" : "inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-dark/20"}>{options.map(([key, text]) => <label key={key} className="relative cursor-pointer"><input className="peer sr-only" type={multiple ? "checkbox" : "radio"} name={label} aria-label={label + " · " + text} checked={values.includes(key)} onChange={e => onChange(multiple ? e.target.checked ? [...values, key] : values.filter(v => v !== key) : [key])} /><span className={`flex min-h-12 items-center justify-center whitespace-nowrap px-4 text-base sm:text-lg peer-checked:bg-black peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 ${pills ? "rounded-full border border-dark/20" : "border-r border-dark/10"}`}>{text}</span></label>)}</div></fieldset>;
}
export function SessionForm({ userId, initial, disabled, write }: { userId: string; initial?: Pick<RoundtableState["sessions"][number], "id" | "revision" | "topic" | "description" | "steps" | "industry" | "languages" | "startsAt" | "endsAt" | "timezone" | "frameworkStages" | "capacity" | "registrationMode" | "meetingUrl">; disabled: boolean; write: Write }) {
  const locale = useLocale(), zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const stepOptions = STEPS.map(step => [step.id, `${step.id} ${words(step.title, locale)}`] as const);
  // The local input uses the browser's time zone; the server receives explicit UTC instants.
  const localTime = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const { draft, change, clear, warning } = useDraft("nova:roundtable-form:" + userId + ":" + (initial?.id || "new"), { topic: initial?.topic || "", description: initial?.description || "", steps: initial?.steps || ["01-1"], industry: initial?.industry || "all", languages: initial?.languages || ["en"], start: initial ? localTime(initial.startsAt) : "", repeatCount: "1", frameworkStages: initial?.frameworkStages.map(String) || [], duration: initial ? String((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 60000) : "60", capacity: String(initial?.capacity || 6), registrationMode: initial?.registrationMode || "approval", meetingUrl: initial?.meetingUrl || "", requestId: "", revision: initial?.revision }, sessionForm);
  const [validation, setValidation] = useState("");
  const conflict = Boolean(initial && draft.revision !== initial.revision);
  const choices = (values: string[], selected: string) => [...new Set([...values, selected])].map(value => [value, value] as const);
  return <form className="space-y-6" data-session-form onSubmit={e => {
    e.preventDefault();
    if (conflict) { setValidation(w("HTTP 409\n請先比較最新場次，草稿保留。", "HTTP 409\nCompare the latest session first; your draft is retained.")); return; }
    setValidation(""); const start = new Date(draft.start), requestId = draft.requestId || crypto.randomUUID(); change({ ...draft, requestId });
    void write({ action: initial ? "edit" : "create", ...(initial ? { id: initial.id, revision: draft.revision } : { requestId }), draft: { topic: draft.topic, description: draft.description, steps: draft.steps, industry: draft.industry, languages: draft.languages, startsAt: Number.isFinite(start.getTime()) ? start.toISOString() : "", endsAt: Number.isFinite(start.getTime()) ? new Date(start.getTime() + Number(draft.duration) * 60000).toISOString() : "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, repeatCount: initial ? 1 : Number(draft.repeatCount), frameworkStages: draft.frameworkStages.map(Number), capacity: Number(draft.capacity), registrationMode: draft.registrationMode, meetingUrl: draft.meetingUrl } }).then(ok => { if (ok) { clear(); if (!initial) change({ ...draft, topic: "", description: "", meetingUrl: "", start: "", requestId: "" }); else change({ ...draft, revision: draft.revision! + 1 }); } });
  }}>
    <fieldset disabled={disabled} className="min-w-0 space-y-7 rounded-2xl border border-dark/10 bg-white p-5 sm:p-7 [&_label]:text-base sm:[&_label]:text-lg [&_select]:min-h-13 [&_select]:text-base sm:[&_select]:text-lg [&_input:not([type=checkbox]):not([type=radio])]:min-h-13 [&_input:not([type=checkbox]):not([type=radio])]:text-base sm:[&_input:not([type=checkbox]):not([type=radio])]:text-lg [&_textarea]:min-h-20 [&_textarea]:text-base sm:[&_textarea]:text-lg">
      <section className="min-w-0 space-y-6" aria-label={w("主題設定", "Topic settings")}><h4 className="text-lg font-semibold sm:text-xl">{w("主題", "Topic")}</h4>
        <TextField label={w("圓桌主題", "Session topic")} placeholder={w("例：如何找到第一批付費客戶", "e.g. How to find your first paying customers")} value={draft.topic} onChange={topic => change({ ...draft, topic })} />
        <TextField multiline label={w("交流目的與會前準備", "Purpose and preparation")} placeholder={w("參加者需要準備什麼？", "What should participants prepare?")} value={draft.description} onChange={description => change({ ...draft, description })} />
        <div className="grid min-w-0 items-start gap-6 sm:grid-cols-2">
          <div className="min-w-0"><p className="mb-1 text-base font-medium sm:text-lg">{w("相關步驟", "Related steps")}</p><details className="rounded-xl border border-dark/20"><summary className="flex min-h-13 list-none [&::-webkit-details-marker]:hidden cursor-pointer items-center gap-3 px-3 py-2 text-base sm:text-lg"><span className="min-w-0 flex-1 break-words">{draft.steps.map(id => stepOptions.find(([key]) => key === id)?.[1] || id).join("、") || w("選擇相關步驟", "Select relevant steps")}</span><ChevronDownIcon aria-hidden="true" className="h-4 w-4 shrink-0" /></summary><div className="border-t p-3"><Checks label={w("選擇相關步驟", "Select relevant steps")} values={draft.steps} options={stepOptions} onChange={steps => change({ ...draft, steps })} /></div></details></div>
          <Choice label={w("產業", "Industry")} value={draft.industry} options={INDUSTRIES.map(k => [k, k === "all" ? w("所有產業", "All industries") : industryLabel(k, locale)])} onChange={industry => change({ ...draft, industry })} />
          <Segments label={w("適合的驗證階段", "Relevant evidence stages")} values={draft.frameworkStages} options={[1,2,3,4,5].map(n => [String(n), String(n)])} multiple onChange={frameworkStages => change({ ...draft, frameworkStages })} />
          <Segments label={w("人數上限（含主持人）", "Capacity (including host)")} values={[draft.capacity]} options={choices(["4","6","8","10"], draft.capacity)} onChange={([capacity]) => change({ ...draft, capacity })} />
        </div>
        <Segments label={w("使用語言", "Session languages")} values={draft.languages} options={LANGUAGES.map(k => [k, k === "other" ? w("其他", "Other") : languageLabel(k, zh)])} multiple pills onChange={languages => change({ ...draft, languages })} />
      </section>
      <section className="space-y-6 border-t border-dark/10 pt-6" aria-label={w("時間設定", "Time settings")}><h4 className="text-lg font-semibold sm:text-xl">{w("時間", "Time")}</h4><div className="grid min-w-0 items-start gap-6 sm:grid-cols-2">
        <TextField type="datetime-local" label={w("開始時間（使用瀏覽器時區）", "Start time (your browser time zone)")} value={draft.start} onChange={start => change({ ...draft, start })} />
        <Segments label={w("時長", "Duration")} values={[draft.duration]} options={choices(["30","60","90"], draft.duration).map(([v]) => [v, v + w(" 分", " min")])} onChange={([duration]) => change({ ...draft, duration })} />
      </div>{!initial && <Segments label={w("系列場次（每兩週一次）", "Series sessions (fortnightly)")} values={[draft.repeatCount]} options={choices(["1","2","3","4"], draft.repeatCount).map(([v]) => [v, v === "1" ? w("單場", "Single") : v + w(" 場", " sessions")])} onChange={([repeatCount]) => change({ ...draft, repeatCount })} />}</section>
      <section className="space-y-6 border-t border-dark/10 pt-6" aria-label={w("報名與連結", "Registration and link")}><h4 className="text-lg font-semibold sm:text-xl">{w("報名與連結", "Registration and link")}</h4><div className="grid min-w-0 items-start gap-6 sm:grid-cols-2">
        <Choice label={w("報名方式", "Registration mode")} value={draft.registrationMode} options={[["approval", w("導師審核，額滿候補", "Host approval, then waitlist")], ["instant", w("自動確認，額滿候補", "Automatic confirmation, then waitlist")]]} onChange={registrationMode => change({ ...draft, registrationMode })} />
        <div><TextField type="url" label={w("會議連結", "Meeting URL")} placeholder="https://meet.google.com/..." value={draft.meetingUrl} onChange={meetingUrl => change({ ...draft, meetingUrl })} /><p className="mt-2 text-xs text-dark/50">{w("只有主持人和已確認的參加者看得到", "Visible only to the host and confirmed participants")}</p></div>
      </div></section>
      <div className="flex justify-end"><button className={button + " rounded-full! border-0 bg-black px-6 text-base! text-white"} disabled={disabled || conflict}>{initial ? w("儲存場次修改", "Save session changes") : w("建立 Roundtable", "Create roundtable")}</button></div>
      {!initial && draft.requestId && <div className="space-y-2"><p className="text-xs text-dark/60">{w("若無法確認上次是否建立成功，請先查看場次紀錄。新的草稿不會更動已存場次。", "If the last result is uncertain, check the session history first. A new draft retains existing sessions.")}</p><button type="button" className={button} disabled={disabled} onClick={() => change({ ...draft, requestId: "" })}>{w("開始另一場圓桌草稿", "Start another roundtable draft")}</button></div>}
    </fieldset>
    {initial && conflict && <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><h4 className="text-lg font-semibold sm:text-xl">{w("場次已更新，請比較後重試", "Session changed; compare before retrying")}</h4><dl className="space-y-2 break-words">{[
      [w("主題／交流目的", "Topic / purpose"), initial.topic + "\n" + initial.description],
      [w("時間／時區", "Time / time zone"), initial.startsAt + " – " + initial.endsAt + " · " + initial.timezone],
      [w("相關步驟／驗證階段", "Steps / evidence stages"), initial.steps.join(", ") + " · " + initial.frameworkStages.join(", ")],
      [w("產業／語言", "Industry / languages"), industryLabel(initial.industry, locale) + " · " + initial.languages.map(v => languageLabel(v, zh)).join(", ")],
      [w("名額／報名方式", "Capacity / registration"), initial.capacity + " · " + (initial.registrationMode === "instant" ? w("自動確認", "Automatic confirmation") : w("導師審核", "Host approval"))],
      [w("會議連結", "Meeting URL"), initial.meetingUrl],
    ].map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-all">{value}</dd></div>)}</dl><button type="button" disabled={disabled} className={button} onClick={() => { change({ ...draft, revision: initial.revision }); setValidation(""); }}>{w("已比較，使用最新版本重試", "Compared; use latest version to retry")}</button></section>}
    {validation && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{validation}</p>}{warning && <p role="status" className="text-xs text-dark/50">{warning.split(" / ")[zh ? 0 : 1] || warning}</p>}
  </form>;
}
export function OutcomesForm({ userId, session, disabled, write }: { userId: string; session: RoundtableState["sessions"][number]; disabled: boolean; write: Write }) {
  const zh = useLocale() === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const initial = session.people.filter(p => p.status === "confirmed").map(p => ({ registrationId: p.id, attendance: "", title: "", criteria: "", dueDate: "" }));
  const { draft, change, clear, warning } = useDraft("nova:roundtable-outcomes:" + userId + ":" + session.id, initial, outcomesForm);
  const rows = initial.map(row => draft.find(saved => saved.registrationId === row.registrationId) || row);
  function update(index: number, patch: Partial<typeof draft[number]>) { change(rows.map((r, i) => i === index ? { ...r, ...patch } : r)); }
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); const entries = rows.map(r => ({ registrationId: r.registrationId, attendance: r.attendance, ...(r.attendance === "attended" ? { commitment: { title: r.title, criteria: r.criteria, dueDate: r.dueDate } } : {}) })); void write({ action: "finish", id: session.id, revision: session.revision, entries } as RoundtableMutation).then(ok => { if (ok) clear(); }); }}><p className="text-sm">{w("請與成員核對實際承諾，出席者各建立一項附加待辦。內容對本場正式成員公開，不修改 16 步。", "Confirm each attendee's actual commitment. One additional task is created per attendee and shared within this session; the sixteen-step workflow is retained.")}</p><fieldset disabled={disabled} className="space-y-4">{rows.map((r, i) => <div key={r.registrationId} className="space-y-3 rounded-xl border p-4"><h4 className="font-bold">{session.people.find(p => p.id === r.registrationId)?.name}</h4><Choice label={w("實際出席", "Attendance")} value={r.attendance} options={session.people.find(p => p.id === r.registrationId)?.unavailable ? [["", w("請選擇", "Choose")], ["absent", w("未出席", "Absent")]] : [["", w("請選擇", "Choose")], ["attended", w("出席", "Attended")], ["absent", w("未出席", "Absent")]]} onChange={v => update(i, { attendance: v })} />{r.attendance === "attended" && <><TextField label={w("承諾行動", "Committed action")} value={r.title} onChange={v => update(i, { title: v })} /><TextField multiline label={w("可衡量的完成標準", "Measurable completion criteria")} value={r.criteria} onChange={v => update(i, { criteria: v })} /><TextField type="date" label={w("承諾期限", "Commitment deadline")} value={r.dueDate} onChange={v => update(i, { dueDate: v })} /></>}</div>)}<button className={button + " bg-black text-white"} disabled={disabled}>{w("確認結案並寫入今日任務", "Finish and add commitments to today's tasks")}</button></fieldset>{warning && <p role="status" className="text-sm">{warning}</p>}</form>;
}
