"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type DirectoryItem = {
  slug: string;
  ticker: string;
  market: string;
  nameEn: string;
  sector: string | null;
  status: string;
  summaryEn: string | null;
};

export function CompanyDirectory({
  companies,
  basePath = "/company",
}: {
  companies: DirectoryItem[];
  basePath?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return companies;
    return companies.filter(
      (c) =>
        c.nameEn.toLowerCase().includes(s) ||
        c.ticker.toLowerCase().includes(s) ||
        (c.sector?.toLowerCase().includes(s) ?? false),
    );
  }, [q, companies]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, ticker, or sector…"
        className="w-full max-w-md rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-navy"
      />

      <p className="mt-3 text-sm text-muted">
        {filtered.length} compan{filtered.length === 1 ? "y" : "ies"}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.slug}
            href={`${basePath}/${c.slug}`}
            className="group rounded-xl border border-line bg-paper p-5 transition-colors hover:border-navy"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-navy group-hover:text-navy-light">
                {c.nameEn}
              </h2>
              <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-muted">
                {c.market}:{c.ticker}
              </span>
            </div>
            {c.sector && <p className="mt-1 text-xs uppercase tracking-wide text-gold">{c.sector}</p>}
            {c.summaryEn && (
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink/75">{c.summaryEn}</p>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-10 text-center text-muted">No companies match “{q}”.</p>
      )}
    </div>
  );
}
