"use client";

type Props = {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
};

// 對齊設計圖的淺灰填色輸入框（聚焦時轉白底 + 品牌紅 ring）。
export default function AuthInput({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: Props) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
        {label}
      </span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-3 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]"
      />
    </label>
  );
}
