import { getTranslations } from "next-intl/server";
import { Info, Section } from "./Section";
import type { InvestorProfileView } from "@/lib/investor/portal";
import type { Locale } from "@/i18n/routing";

/**
 * 公司檔案。
 *
 * key「不存在」＝被擁有者隱藏，整列不渲染；
 * key 存在但值為 null／空陣列＝擁有者沒填，照舊顯示「—」。
 * 兩者刻意分開 —— 隱藏不該長得像「沒填」，反之亦然。
 */
export default async function ProfileSection({
  locale,
  profile,
}: {
  locale: Locale;
  profile: InvestorProfileView;
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const tOpt = await getTranslations({ locale, namespace: "Auth.options" });

  // onboarding 選項 slug → 當地語系標籤。
  // 用 has() 防禦：DB 可能留著舊版選項 slug，缺 key 會讓整頁掛掉，
  // 而這頁是給外部投資人看的，不能為了一個過期選項全毀。
  const opt = (ns: string, value?: string | null) => {
    if (!value) return null;
    const key = `${ns}.${value}`;
    return tOpt.has(key) ? tOpt(key) : value;
  };
  const optList = (ns: string, values: string[]) =>
    values.map((value) => opt(ns, value)).filter(Boolean).join(" · ");

  return (
    <Section title={t("profile")}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {"industry" in profile && (
          <Info label={t("industry")} value={opt("industry", profile.industry)} />
        )}
        {"companySize" in profile && (
          <Info label={t("companySize")} value={opt("companySize", profile.companySize)} />
        )}
        {"country" in profile && <Info label={t("country")} value={profile.country} />}
        {"companyAge" in profile && (
          <Info label={t("companyAge")} value={opt("timeline", profile.companyAge)} />
        )}
        {"seedFunding" in profile && (
          <Info label={t("seedFunding")} value={opt("budget", profile.seedFunding)} />
        )}
        {"targetMarkets" in profile && (
          <Info
            label={t("targetMarkets")}
            value={optList("markets", profile.targetMarkets ?? [])}
          />
        )}
        {"needs" in profile && (
          <Info label={t("needs")} value={optList("needs", profile.needs ?? [])} />
        )}
      </dl>

      {"notes" in profile && profile.notes && (
        <div className="mt-5 border-t border-dark/[0.08] pt-4">
          <p className="text-xs text-dark/40">{t("notes")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-dark/70">
            {profile.notes}
          </p>
        </div>
      )}

      {"website" in profile && profile.website && (
        <a
          className="mt-4 block text-sm font-bold text-primary"
          href={profile.website}
          target="_blank"
          rel="noreferrer"
        >
          {profile.website}
        </a>
      )}
    </Section>
  );
}
