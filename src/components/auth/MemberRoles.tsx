"use client";
import { useLocale, useTranslations } from "next-intl";
import { ROLES, type MemberRole } from "@/lib/matchmaking/roles";

export default function MemberRoles({ value, onChange, disabled = false }: { value: MemberRole[]; onChange: (roles: MemberRole[]) => void; disabled?: boolean }) {
  const zh = useLocale() === "zh-tw", t = useTranslations("Matchmaking");
  return <fieldset disabled={disabled} className="space-y-3"><legend className="text-sm font-semibold">{zh ? "你的身份（可複選）" : "Your roles (select all that apply)"}</legend><div className="flex flex-wrap gap-2">{ROLES.map(role => <label key={role} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm ${value.includes(role) ? "border-black bg-black text-white" : "border-dark/20 bg-white"}`}><input type="checkbox" name="roles" value={role} checked={value.includes(role)} onChange={e => onChange(e.target.checked ? [...value, role] : value.filter(v => v !== role))} className="size-4 accent-black" />{t(`roles.${role}`)}</label>)}</div>{value.some(v => v === "mentor" || v === "investor") && <p className="text-xs text-dark/65">{zh ? "身份為自我介紹；投資人驗證與導師認證需另經審核。" : "Roles describe you. Investor verification and mentor certification require separate review."}</p>}</fieldset>;
}
