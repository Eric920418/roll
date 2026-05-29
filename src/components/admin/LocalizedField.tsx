"use client";

import type { Localized } from "@/lib/cms/i18n";

type Props = {
  label: string;
  value: Localized;
  onChange: (next: Localized) => void;
  multiline?: boolean;
  required?: boolean;
};

/** 一個欄位、兩個語系（en + zh-tw）並排輸入 */
export default function LocalizedField({
  label,
  value,
  onChange,
  multiline,
  required,
}: Props) {
  const en = value?.en ?? "";
  const zh = value?.["zh-tw"] ?? "";

  function set(locale: "en" | "zh-tw", v: string) {
    onChange({ en, "zh-tw": zh, [locale]: v });
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">English</span>
          {multiline ? (
            <textarea
              rows={4}
              value={en}
              onChange={(e) => set("en", e.target.value)}
              className={inputClass}
            />
          ) : (
            <input value={en} onChange={(e) => set("en", e.target.value)} className={inputClass} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">繁體中文</span>
          {multiline ? (
            <textarea
              rows={4}
              value={zh}
              onChange={(e) => set("zh-tw", e.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              value={zh}
              onChange={(e) => set("zh-tw", e.target.value)}
              className={inputClass}
            />
          )}
        </div>
      </div>
    </div>
  );
}
