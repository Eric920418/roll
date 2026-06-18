"use client";

type Tab<T extends string> = { key: T; label: string };

// Email / Google 分段切換藥丸（對齊設計圖：作用中段為白底 + 紅色細框）。
export default function SegmentedToggle<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: [Tab<T>, Tab<T>];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-dark/10 bg-dark/[0.03] p-1">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-all font-[family-name:var(--font-heading)] ${
              active
                ? "bg-white text-primary shadow-[0_1px_4px_rgba(0,0,0,0.08)] ring-1 ring-primary/30"
                : "text-dark/45 hover:text-dark/70"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
