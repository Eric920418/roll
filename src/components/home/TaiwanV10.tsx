import { getRollonAssets } from "@/lib/cms/rollon-content";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import RollonPage, { SectionHeading } from "./RollonPage";
import base from "./home.module.css";
import s from "./pages.module.css";

export default async function TaiwanV10({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "TaiwanV10" });
  const { image } = await getRollonAssets("taiwan");
  return <RollonPage page="taiwan" locale={locale}>
    <section className={`${s.section} ${s.hub}`}><div className={base.container}>
      <SectionHeading eyebrow={t("hub.eyebrow")} title={t("hub.title")} />
      <div className={`${s.fourGrid} ${s.reasonGrid}`}>{[1,2,3,4].map(i=><article key={i} className={s.reason}><p className={`${base.eyebrow} ${s.sectionEyebrow}`}>{t(`reasons.${i}.eyebrow`)}</p><h3>{t(`reasons.${i}.title`)}</h3><p>{t(`reasons.${i}.description`)}</p></article>)}</div>
    </div></section>
    <section className={`${s.section} ${s.red} ${s.now}`}><div className={base.container}>
      <SectionHeading eyebrow={t("now.eyebrow")} title={t("now.title")} />
      <div className={`${s.threeGrid} ${s.statGrid}`}>{[1,2,3].map(i=><div className={s.stat} key={i}><p>{t(`now.${i}.value`)}</p><p>{t(`now.${i}.caption`)}</p></div>)}</div>
    </div></section>
    <section className={`${s.section} ${s.pink} ${s.taiwanValue}`}><div className={base.container}>
      <SectionHeading eyebrow={t("value.eyebrow")} title={t("value.title")} />
      <dl className={s.contributions}>{[1,2,3].map(i=><div key={i}><dt>{t(`contributions.${i}.title`)}</dt><dd>{t(`contributions.${i}.description`)}</dd></div>)}</dl>
    </div></section>
    <section className={`${s.section} ${s.community}`}><div className={base.container}>
      <SectionHeading eyebrow={t("community.eyebrow")} title={t("community.title")} />
      <div className={s.communityGrid}>{["asia-founders-club", "golden-ticket"].map((name,i)=><article key={name}>
        <div className={`${s.communityImage} ${i===0?s.clubImage:""}`}><Image src={image(`/rollon-v10/${name}.jpg`)} alt={t(`communities.${i+1}.title`)} fill sizes="(max-width:767px) calc(100vw - 48px), 41vw" /></div>
        <h3>{t(`communities.${i+1}.title`)}</h3><p>{t(`communities.${i+1}.description`)}</p>
      </article>)}</div>
    </div></section>
  </RollonPage>;
}
