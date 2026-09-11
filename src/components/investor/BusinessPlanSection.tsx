import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import type { Locale } from "@/i18n/routing";

export default async function BusinessPlanSection({
  locale,
  portalId,
  filename,
}: {
  locale: Locale;
  portalId: string;
  filename: string | null;
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  return (
    <Section title={t("businessPlan")}>
      <p className="text-sm text-dark/60">{filename}</p>
      {/* 下載每次都在 server 端重新驗權限，不是簽名連結 */}
      <a
        href={`/api/investor-portal/business-plan?portalId=${encodeURIComponent(portalId)}`}
        target="_blank"
        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white"
      >
        {t("openPdf")}
      </a>
    </Section>
  );
}
