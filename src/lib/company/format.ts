// 財務數字格式化（英文輸出）。

export function formatTWD(amount: number): string {
  if (!isFinite(amount)) return "—";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1e9) return `${sign}NT$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}NT$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}NT$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}NT$${abs.toFixed(0)}`;
}

export function formatMetric(value: number, unit?: string | null): string {
  if (!isFinite(value)) return "—";
  switch (unit) {
    case "percent":
      return `${value.toFixed(2)}%`;
    case "TWD_thousand":
      return formatTWD(value * 1000);
    case "TWD":
      return formatTWD(value);
    case "TWD_per_share":
      return `NT$${value.toFixed(2)}`;
    case "x":
      return `${value.toFixed(2)}×`;
    default:
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
}

export const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue",
  monthlyRevenue: "Monthly Revenue",
  revenueYoY: "Revenue YoY",
  grossMargin: "Gross Margin",
  opMargin: "Operating Margin",
  netMargin: "Net Margin",
  netIncome: "Net Income",
  eps: "EPS",
  roe: "ROE (TTM)",
  totalAssets: "Total Assets",
  totalEquity: "Total Equity",
  debtRatio: "Debt Ratio",
  cash: "Cash & Equivalents",
  operatingCashFlow: "Operating Cash Flow",
  cashDividend: "Cash Dividend",
  pe: "P/E",
  pb: "P/B",
  dividendYield: "Dividend Yield",
  stockPrice: "Share Price",
};

export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key;
}

export function shortPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) {
    const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2])]} '${m[1].slice(2)}`;
  }
  return period;
}
