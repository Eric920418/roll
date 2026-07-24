import { getTranslations } from "next-intl/server";
import NovaLogo from "@/components/brand/NovaLogo";
import Stepper from "./Stepper";

type Props = {
  step: 1 | 2 | 3;
  children: React.ReactNode;
};

// 註冊／登入／onboarding 共用的 NOVA 雙欄版型。
export default async function AuthShell({ step, children }: Props) {
  const t = await getTranslations("Auth");
  const steps = [
    { label: t("steps.account"), hint: t("steps.accountHint") },
    { label: t("steps.company"), hint: t("steps.companyHint") },
    { label: t("steps.requirements"), hint: t("steps.requirementsHint") },
  ];

  return (
    <div
      className="nova-theme flex min-h-screen flex-col bg-white md:flex-row"
      data-brand="nova"
    >
      {/* 左：NOVA 黑色品牌欄 */}
      <aside className="relative flex flex-col justify-center overflow-hidden bg-primary px-8 py-12 text-white md:w-[42%] md:px-12 md:py-16 lg:w-[40%] lg:px-16">
        <div className="relative z-10 max-w-md">
          <NovaLogo
            variant="white"
            alt={t("brand")}
            priority
            sizes="(min-width: 1024px) 300px, (min-width: 768px) 270px, 220px"
            className="h-auto w-[220px] object-contain md:w-[270px] lg:w-[300px]"
          />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
            {t("byline")}
          </p>
          <p className="mt-7 text-lg font-bold leading-snug tracking-[-0.01em] font-[family-name:var(--font-heading)] md:mt-9 md:text-xl">
            {t("tagline")}
          </p>
          <p className="mt-5 text-sm leading-relaxed text-white/65 font-[family-name:var(--font-body)] md:text-[15px]">
            {t("intro")}
          </p>
          <Stepper current={step} steps={steps} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/15" />
      </aside>

      {/* 右：白底表單欄 */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 md:px-10 lg:px-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
