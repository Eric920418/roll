type Step = { label: string; hint: string };

// 左側紅欄的垂直三步驟指示器（純展示，label/hint 由 AuthShell 解析 i18n 後傳入）。
export default function Stepper({
  current,
  steps,
}: {
  current: number;
  steps: Step[];
}) {
  return (
    <ol className="mt-12 md:mt-16 flex flex-col">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        const isLast = i === steps.length - 1;
        return (
          <li key={n} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[18px] top-9 bottom-0 w-px bg-white/25"
              />
            )}
            <span
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold font-[family-name:var(--font-heading)] transition-colors ${
                active || done
                  ? "bg-white text-primary"
                  : "border border-white/40 text-white/70"
              }`}
            >
              {n}
            </span>
            <div className="pt-1">
              <p
                className={`text-[15px] font-bold leading-tight font-[family-name:var(--font-heading)] ${
                  active ? "text-white" : "text-white/80"
                }`}
              >
                {s.label}
              </p>
              <p className="mt-0.5 text-xs text-white/55 font-[family-name:var(--font-body)]">
                {s.hint}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
