import { setRequestLocale, getTranslations } from "next-intl/server";
import { getCompanyList } from "@/lib/company/content";
import DashboardCompanyList from "@/components/dashboard/DashboardCompanyList";

type Props = { params: Promise<{ locale: string }> };

export default async function DashboardCompaniesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Dashboard.companies" });

  const companies = getCompanyList();

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-dark/60">{t("subtitle")}</p>

      <DashboardCompanyList companies={companies} />
    </div>
  );
}
