"use client";
import { useId, useMemo, useState } from "react";
import { COUNTRY_CODES, countryCode, countryLabel } from "@/lib/member-options";

export default function CountrySelect({ value, onChange, locale, label, disabled = false }: { value: string; onChange: (v: string) => void; locale: string; label: string; disabled?: boolean }) {
  const id = useId(), zh = locale === "zh-tw";
  const [query, setQuery] = useState("");
  const canonical = countryCode(value), selected = canonical || value;
  const options = useMemo(() => COUNTRY_CODES.map(code => ({ code, name: countryLabel(code, locale) })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).filter(v => v.code === selected || `${v.code} ${v.name} ${countryLabel(v.code)} ${countryLabel(v.code, "zh-tw")}`.normalize("NFKC").toLowerCase().includes(query.normalize("NFKC").trim().toLowerCase())), [locale, query, selected]);
  const style = "min-h-11 w-full min-w-0 rounded-xl border border-dark/20 bg-white px-3 py-2 text-sm text-dark disabled:opacity-50";
  return <div className="min-w-0 space-y-2"><label htmlFor={id} className="block text-sm font-semibold">{label}</label><input type="search" aria-label={zh ? "搜尋國家選項" : "Search country options"} placeholder={zh ? "搜尋國家…" : "Find a country…"} value={query} disabled={disabled} onChange={e => setQuery(e.target.value)} className={style} /><select id={id} name="country" value={selected} disabled={disabled} onChange={e => onChange(e.target.value)} className={style}><option value="">{zh ? "選擇國家" : "Select country"}</option>{value && !canonical && <option value={value}>{value} · {zh ? "既有值，請重新選擇" : "Existing value; select a country"}</option>}{options.map(v => <option value={v.code} key={v.code}>{v.name}</option>)}</select></div>;
}
