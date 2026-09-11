import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import type { Locale } from "@/i18n/routing";

type Milestone = {
  id: string;
  title: string;
  status: string;
  targetDate: Date | null;
  notes: string | null;
};

export default async function MilestoneSection({
  locale,
  milestones,
}: {
  locale: Locale;
  milestones: Milestone[];
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const fmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US");
  return (
    <Section title={t("milestones")}>
      <ul className="space-y-3">
        {milestones.map((item) => (
          <li key={item.id} className="rounded-xl bg-dark/[0.04] p-4">
            <p className="font-bold text-dark">{item.title}</p>
            <p className="mt-1 text-xs text-dark/50">
              {item.status}
              {item.targetDate ? ` · ${fmt.format(item.targetDate)}` : ""}
            </p>
            {item.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-dark/60">{item.notes}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
