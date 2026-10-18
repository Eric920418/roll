import { getRollonAssets } from "@/lib/cms/rollon-content";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import RollonPage, { SectionHeading } from "./RollonPage";
import base from "./home.module.css";
import s from "./pages.module.css";

export default async function AboutV10({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "AboutV10" });
  const { image } = await getRollonAssets("about");
  return <RollonPage page="about" locale={locale}>
    <section className={`${s.section} ${s.story}`}><div className={`${base.container} ${s.storyGrid}`}>
      <div><SectionHeading eyebrow={t("story.eyebrow")} title={t("story.title")} /></div>
      <div className={s.storyCopy}>{[1,2,3].map(i=><p key={i}>{i===3?<strong>{t(`story.${i}`)}</strong>:t(`story.${i}`)}</p>)}</div>
    </div></section>
    <section className={`${s.section} ${s.pink} ${s.thinking}`}><div className={base.container}>
      <SectionHeading eyebrow={t("thinking.eyebrow")} title={t("thinking.title")} description={t("thinking.description")} />
      <div className={`${s.fourGrid} ${s.storiesGrid}`}>{[1,2,3,4].map(i=><article key={i} className={s.card}><p className={s.number}>0{i}</p><h3>{t(`stories.${i}.title`)}</h3><p>{t(`stories.${i}.description`)}</p></article>)}</div>
    </div></section>
    <section className={`${s.section} ${s.red} ${s.philosophy}`}><div className={base.container}>
      <SectionHeading eyebrow={t("philosophy.eyebrow")} title={t("philosophy.title")} />
      <div className={`${s.threeGrid} ${s.equation}`}>{[1,2,3].map(i=><div key={i}><h3>{i>1&&<span>{i===2?"+":"="} </span>}{t(`philosophy.${i}.title`)}</h3><p>{t(`philosophy.${i}.description`)}</p></div>)}</div>
    </div></section>
    <section className={`${s.section} ${s.way}`}><div className={base.container}>
      <SectionHeading eyebrow={t("way.eyebrow")} title={t("way.title")} />
      <div className={`${s.threeGrid} ${s.valuesGrid}`}>{[1,2,3,4,5,6].map(i=><article key={i} className={`${s.card} ${s.bordered}`}><p className={s.number}>0{i}</p><h3>{t(`values.${i}.title`)}</h3><p>{t(`values.${i}.description`)}</p></article>)}</div>
      <p className={s.closing}>{t("way.closing")}</p>
    </div></section>
    <section className={`${s.section} ${s.pink} ${s.roadmap}`}><div className={base.container}>
      <SectionHeading eyebrow={t("roadmap.eyebrow")} title={t("roadmap.title")} />
      <div className={`${s.threeGrid} ${s.roadmapGrid}`}>{[1,2,3].map(i=><article key={i} className={s.reason}><p className={`${base.eyebrow} ${s.sectionEyebrow}`}>{t(`roadmap.${i}.eyebrow`)}</p><h3>{t(`roadmap.${i}.title`)}</h3><p>{t(`roadmap.${i}.description`)}</p></article>)}</div>
      <div className={s.sustainability}><SectionHeading eyebrow={t("sustainability.eyebrow")} title={t("sustainability.title")} />
        <div className={`${s.threeGrid} ${s.esgGrid}`}>{[1,2,3].map((i)=><article key={i} className={s.card}><p className={s.esgLetter}>{["E","S","G"][i-1]}</p><h3>{t(`sustainability.${i}.title`)}</h3><p>{t(`sustainability.${i}.description`)}</p></article>)}</div>
      </div>
    </div></section>
    <section className={`${s.section} ${s.team}`}><div className={base.container}>
      <SectionHeading eyebrow={t("team.eyebrow")} title={t("team.title")} />
      <div className={`${s.threeGrid} ${s.teamGrid}`}>{["vivian-lee", "vincent", "iris"].map((name,i)=><article key={name}>
        <Image src={image(`/rollon-v10/${name}.jpg`)} alt={t(`team.${i+1}.name`)} width={640} height={800} sizes="(max-width:767px) calc(100vw - 48px), 27vw" />
        <div className={s.teamDetails}><h3>{t(`team.${i+1}.name`)}</h3><p>{t(`team.${i+1}.role`)}</p><p>{t(`team.${i+1}.description`)}</p></div>
      </article>)}</div>
    </div></section>
  </RollonPage>;
}
