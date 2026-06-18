"use client";

type Props = {
  children: React.ReactNode;
  type?: "submit" | "button";
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

// 主要動作按鈕：滿版深紅圓角矩形（對齊設計圖的 Continue 按鈕）。
export default function AuthButton({
  children,
  type = "submit",
  loading,
  disabled,
  onClick,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full rounded-xl bg-primary py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60 font-[family-name:var(--font-heading)]"
    >
      {children}
    </button>
  );
}
