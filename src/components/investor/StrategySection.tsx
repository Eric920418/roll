import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import { bottleneckLabel } from "@/lib/action-plan/constants";
import type { InvestorStrategyView } from "@/lib/investor/portal";
import type { Locale } from "@/i18n/routing";

/** 公司階段與當前瓶頸。stage / bottleneck 可各自被隱藏。 */
export default async function StrategySection({
  locale,
  strategy,
}: {
  locale: Locale;
  strategy: InvestorStrategyView;
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  return (
    <Section title={t("strategy")}>
      {strategy.stage && (
        <>
          <p className="font-bold text-dark">{strategy.stage.companyStage}</p>
          <p className="mt-2 text-sm leading-6 text-dark/60">{strategy.stage.stageReason}</p>
        </>
      )}
      {strategy.bottleneck && (
        <>
          <p className={`font-bold text-dark ${strategy.stage ? "mt-5" : ""}`}>
            {strategy.bottleneck.group} ·{" "}
            {bottleneckLabel(strategy.bottleneck.group, strategy.bottleneck.code)}
          </p>
          <p className="mt-2 text-sm leading-6 text-dark/60">{strategy.bottleneck.reason}</p>
        </>
      )}
    </Section>
  );
}
