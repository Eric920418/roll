"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type FounderResultView = {
  name: string;
  role: string;
  blurb: string;
  traits: string[];
  foundedYear: number | null;
  statMarketCap: string | null;
  statSecondary: { label: string; value: string } | null;
  planningDepth: number;
  executionStrength: number;
  visionClarity: number;
  timeline: { year: number; title: string; desc: string }[];
  businessDetails: { heading: string; body: string }[];
  companyHref: string | null;
  homeHref: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

export default function FounderResult({
  founder: f,
}: {
  founder: FounderResultView;
}) {
  const t = useTranslations("Quiz.result");
  const [tab, setTab] = useState<"timeline" | "business">("timeline");

  return (
    <main className="min-h-screen bg-white px-5 py-12 font-[family-name:var(--font-body)] md:py-16">
      <div className="mx-auto w-full max-w-xl">
        {/* 頭部 */}
        <div className="flex flex-col items-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-white font-[family-name:var(--font-heading)]">
            {initials(f.name)}
          </span>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-primary/70 font-[family-name:var(--font-heading)]">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {f.name}
          </h1>
          <p className="mt-0.5 text-sm text-dark/50">{f.role}</p>
          <p className="mt-4 text-sm leading-relaxed text-dark/65">{f.blurb}</p>

          {f.traits.length > 0 && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {f.traits.map((tr) => (
                <span
                  key={tr}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white font-[family-name:var(--font-heading)]"
                >
                  {tr}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 數據卡 */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <StatCard label={t("founded")} value={f.foundedYear ? String(f.foundedYear) : "—"} />
          <StatCard label={t("marketCap")} value={f.statMarketCap ?? "—"} />
          {f.statSecondary && (
            <StatCard label={f.statSecondary.label} value={f.statSecondary.value} />
          )}
        </div>

        {/* 決策風格對齊 */}
        <section className="mt-9">
          <h2 className="text-lg font-bold text-dark font-[family-name:var(--font-heading)]">
            {t("decisionAlignment")}
          </h2>
          <div className="mt-4 flex flex-col gap-3.5">
            <Bar label={t("planningDepth")} value={f.planningDepth} />
            <Bar label={t("executionStrength")} value={f.executionStrength} />
            <Bar label={t("visionClarity")} value={f.visionClarity} />
          </div>
        </section>

        {/* 分頁 */}
        <section className="mt-9 rounded-2xl border border-dark/10">
          <div className="flex border-b border-dark/10">
            <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
              {t("timeline")}
            </TabButton>
            <TabButton active={tab === "business"} onClick={() => setTab("business")}>
              {t("businessDetails")}
            </TabButton>
          </div>

          <div className="p-5">
            {tab === "timeline" ? (
              <ol className="flex flex-col gap-5">
                {f.timeline.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary" />
                    <div>
                      <p className="text-sm font-bold text-primary font-[family-name:var(--font-heading)]">
                        {item.year}
                      </p>
                      <p className="text-sm font-semibold text-dark">{item.title}</p>
                      <p className="mt-0.5 text-sm leading-snug text-dark/60">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-col gap-5">
                {f.businessDetails.map((d, i) => (
                  <div key={i}>
                    <p className="text-sm font-bold text-primary font-[family-name:var(--font-heading)]">
                      {d.heading}
                    </p>
                    <p className="mt-1 text-sm leading-snug text-dark/65">{d.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {f.companyHref && (
          <a
            href={f.companyHref}
            className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline font-[family-name:var(--font-heading)]"
          >
            {t("fullAnalysis")} →
          </a>
        )}

        <p className="mt-8 text-center text-sm leading-relaxed text-dark/55">
          {t("intro")}
        </p>

        <div className="mt-6 flex justify-center">
          <a
            href={f.homeHref}
            className="inline-flex items-center justify-center rounded-full bg-primary px-10 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark font-[family-name:var(--font-heading)]"
          >
            {t("finish")}
          </a>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dark/10 px-3 py-4 text-center">
      <p className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-dark/45">{label}</p>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm font-medium text-dark">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-primary/10">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 text-right text-sm font-bold text-primary">{pct}%</span>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-5 py-3 text-sm font-bold transition-colors font-[family-name:var(--font-heading)] ${
        active
          ? "border-b-2 border-primary text-primary"
          : "text-dark/45 hover:text-dark/70"
      }`}
    >
      {children}
    </button>
  );
}
