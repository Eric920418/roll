import Image from "next/image";
import { getTranslations } from "next-intl/server";
import Stepper from "./Stepper";

type Props = {
  step: 1 | 2 | 3;
  children: React.ReactNode;
};

// 註冊／登入／onboarding 共用的雙欄版型：左品牌紅欄（白 logo + 標語 + stepper）、右白底表單欄。
export default async function AuthShell({ step, children }: Props) {
  const t = await getTranslations("Auth");
  const steps = [
    { label: t("steps.account"), hint: t("steps.accountHint") },
    { label: t("steps.company"), hint: t("steps.companyHint") },
    { label: t("steps.requirements"), hint: t("steps.requirementsHint") },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      {/* 左：品牌紅欄 */}
      <aside className="relative flex flex-col justify-center overflow-hidden bg-primary px-8 py-12 text-white md:w-[42%] md:px-12 md:py-16 lg:w-[40%] lg:px-16">
        <div className="relative z-10 max-w-md">
          <Image
            src="/horizontal.png"
            alt={t("brand")}
            width={1341}
            height={245}
            priority
            className="h-auto w-[220px] object-contain md:w-[270px] lg:w-[300px]"
          />
          <p className="mt-7 text-lg font-bold leading-snug tracking-[-0.01em] font-[family-name:var(--font-heading)] md:mt-9 md:text-xl">
            {t("tagline")}
          </p>
          <p className="mt-5 text-sm leading-relaxed text-white/65 font-[family-name:var(--font-body)] md:text-[15px]">
            {t("intro")}
          </p>
          <Stepper current={step} steps={steps} />
        </div>
        {/* 底部漸層增加層次（呼應首頁 hero） */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary-dark/40 to-transparent" />
      </aside>

      {/* 右：白底表單欄 */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 md:px-10 lg:px-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
