import { formatMetric, metricLabel } from "@/lib/company/format";

export function SnapshotCard({
  label,
  value,
  unit,
  period,
}: {
  label: string;
  value: number;
  unit?: string | null;
  period?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-mono)] text-xl font-semibold text-navy">
        {formatMetric(value, unit)}
      </p>
      {period && <p className="mt-0.5 text-xs text-muted">{period}</p>}
    </div>
  );
}

export function FactTable({
  metricKey,
  rows,
}: {
  metricKey: string;
  rows: { period: string; value: number; unit?: string | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="min-w-full text-sm">
        <thead className="bg-canvas text-left text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Period</th>
            <th className="px-4 py-2 text-right font-medium">{metricLabel(metricKey)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period} className="border-t border-line">
              <td className="px-4 py-2 text-ink/80">{r.period}</td>
              <td className="px-4 py-2 text-right font-[family-name:var(--font-mono)] text-ink">
                {formatMetric(r.value, r.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
