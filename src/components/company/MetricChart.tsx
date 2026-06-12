// 零相依 SVG 圖表（server component）。
import { formatMetric, shortPeriod } from "@/lib/company/format";

export type ChartPoint = { period: string; value: number };

export function MetricChart({
  points,
  kind = "bar",
  unit,
  color = "var(--color-navy)",
  height = 180,
}: {
  points: ChartPoint[];
  kind?: "bar" | "line";
  unit?: string | null;
  color?: string;
  height?: number;
}) {
  if (points.length === 0) return null;

  const W = 760;
  const H = height;
  const padX = 12;
  const padTop = 22;
  const padBottom = 26;
  const innerH = H - padTop - padBottom;

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const stepX = (W - padX * 2) / points.length;
  const y = (v: number) => padTop + innerH * (1 - (v - min) / range);
  const cx = (i: number) => padX + stepX * (i + 0.5);

  const maxIdx = values.indexOf(Math.max(...values));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" preserveAspectRatio="none">
      {min < 0 && (
        <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="var(--color-line)" strokeWidth={1} />
      )}

      {kind === "bar"
        ? points.map((p, i) => {
            const barW = stepX * 0.62;
            const top = y(Math.max(p.value, 0));
            const base = y(Math.min(p.value, 0));
            return (
              <rect
                key={p.period}
                x={cx(i) - barW / 2}
                y={Math.min(top, base)}
                width={barW}
                height={Math.max(Math.abs(base - top), 1)}
                rx={2}
                fill={color}
                opacity={i === maxIdx ? 1 : 0.78}
              />
            );
          })
        : (
          <>
            <polyline
              points={points.map((p, i) => `${cx(i)},${y(p.value)}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((p, i) => (
              <circle key={p.period} cx={cx(i)} cy={y(p.value)} r={2.5} fill={color} />
            ))}
          </>
        )}

      <text
        x={cx(maxIdx)}
        y={y(values[maxIdx]) - 7}
        textAnchor="middle"
        fontSize={11}
        fill="var(--color-muted)"
        fontFamily="var(--font-mono)"
      >
        {formatMetric(values[maxIdx], unit)}
      </text>

      <text x={cx(0)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
        {shortPeriod(points[0].period)}
      </text>
      <text x={cx(points.length - 1)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
        {shortPeriod(points[points.length - 1].period)}
      </text>
    </svg>
  );
}
