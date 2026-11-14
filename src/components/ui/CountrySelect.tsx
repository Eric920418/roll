"use client";
import { useId, useMemo } from "react";
import { COUNTRY_CODES, countryCode, countryLabel } from "@/lib/member-options";

export default function CountrySelect({ value, onChange, locale, label, disabled = false, compact = false }: { value: string; onChange: (v: string) => void; locale: string; label: string; disabled?: boolean; compact?: boolean }) {
  const id = useId(), zh = locale === "zh-tw";
  const canonical = countryCode(value), selected = canonical || value;
  const options = useMemo(() => COUNTRY_CODES.map(code => ({ code, name: countryLabel(code, locale) })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0), [locale]);
  const style = "min-h-11 w-full min-w-0 rounded-xl border border-dark/20 bg-white px-3 py-2 text-sm text-dark disabled:opacity-50";
  return <div className="min-w-0 space-y-2"><label htmlFor={id} className="block text-sm font-semibold">{label}</label><select id={id} name="country" value={selected} disabled={disabled} onChange={e => onChange(e.target.value)} className={style}><option value="">{compact ? (zh ? "全部國家" : "All countries") : (zh ? "選擇國家" : "Select country")}</option>{value && !canonical && <option value={value} disabled>{zh ? "請選擇國家" : "Select a country"}</option>}{options.map(v => <option value={v.code} key={v.code}>{v.name}</option>)}</select></div>;
}
