import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import { MetricChart } from "@/components/company/MetricChart";
import { formatMetric } from "@/lib/company/format";
import type { InvestorKpiView } from "@/lib/investor/portal";
import type { Locale } from "@/i18n/routing";

/**
 * KPI。有時間序列（points）就畫走勢圖，沒有就維持原本的數字卡 ——
 * 既有 KPI 一筆 points 都沒有，行為與改版前完全一致。
 */
export default async function KpiSection({
  locale,
  kpis,
}: {
  locale: Locale;
  kpis: InvestorKpiView[];
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  return (
    <Section title={t("kpis")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {kpis.map((item) => (
          <div key={item.id} className="rounded-xl bg-dark/[0.04] p-4">
            <p className="text-xs text-dark/45">
              {item.label}
              {item.period ? ` · ${item.period}` : ""}
            </p>
            <p className="mt-1 text-2xl font-bold text-dark">{item.value}</p>

            {item.points.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-dark/35">
                  {t("kpiTrend")}
                </p>
                {/* MetricChart 預設是公司情報頁的 navy 色；這頁走官網暖紅主題 */}
                <MetricChart
                  points={item.points}
                  kind="line"
                  unit={item.unit}
                  color="var(--color-primary)"
                  height={120}
                />
                <p className="mt-1 text-[11px] text-dark/40">
                  {item.points.length === 1
                    ? `${item.points[0].period} · ${formatMetric(item.points[0].value, item.unit)}`
                    : `${item.points[0].period} – ${item.points[item.points.length - 1].period}`}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
