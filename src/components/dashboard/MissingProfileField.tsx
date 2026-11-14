"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import CountrySelect from "@/components/ui/CountrySelect";
import { memberFetch } from "@/lib/member-fetch";
import { notifyPlanChanged } from "./PlanRefresh";
import { useDashboardUser } from "./DashboardUserProvider";

export default function MissingProfileField({ field, label, options, maxLength }: {
  field: "companyName" | "oneLinePitch" | "industry" | "companyStage" | "companySize" | "website" | "country";
  label: string; options?: { value: string; label: string }[]; maxLength?: number;
}) {
  const locale = useLocale(), zh = locale === "zh-tw", t = useTranslations("Dashboard.account"), router = useRouter(), userId = useDashboardUser();
  const [open, setOpen] = useState(false), [value, setValue] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (open) form.current?.querySelector<HTMLElement>("input, select")?.focus(); }, [open]);
  const saving = useRef(false), trigger = useRef<HTMLButtonElement>(null);
  const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/15 px-3 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
  if (saved) return <span role="status">{options?.find(option => option.value === value)?.label || value}</span>;
  if (!open) return <button ref={trigger} type="button" className={button} aria-label={`${zh ? "新增" : "Add"}: ${label}`} onClick={() => setOpen(true)}>{zh ? "新增＋" : "Add +"}</button>;
  return <form ref={form} className="space-y-3 text-left" aria-label={label} onSubmit={async event => {
    event.preventDefault(); if (saving.current || !value.trim()) return;
    saving.current = true; setBusy(true); setError("");
    try {
      await memberFetch("/api/account/profile", { method: "PATCH", body: JSON.stringify({ data: { [field]: value.trim() } }) });
      setSaved(true); notifyPlanChanged(userId || undefined); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { saving.current = false; setBusy(false); }
  }}><fieldset disabled={busy} className="min-w-0 space-y-3">
    {field === "country" ? <CountrySelect label={label} value={value} onChange={setValue} locale={locale} /> : <label className="block text-sm"><span className="mb-1 block">{label}</span>{options ? <select required className="min-h-11 w-full rounded-xl border border-dark/20 bg-white p-3 text-sm" value={value} onChange={event => setValue(event.target.value)}><option value="">{t("selectPlaceholder")}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input required maxLength={maxLength} className="min-h-11 w-full rounded-xl border border-dark/20 bg-white p-3 text-sm" value={value} onChange={event => setValue(event.target.value)} />}</label>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={!value.trim()} className={button + " bg-black text-white"}>{busy ? t("saving") : t("save")}</button><button type="button" className={button} onClick={() => { setOpen(false); setError(""); requestAnimationFrame(() => trigger.current?.focus()); }}>{zh ? "取消" : "Cancel"}</button></div>
  </fieldset>{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}</form>;
}
