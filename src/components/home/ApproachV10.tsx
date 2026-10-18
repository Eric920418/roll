import { getRollonAssets } from "@/lib/cms/rollon-content";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import RollonPage, { SectionHeading } from "./RollonPage";
import base from "./home.module.css";
import s from "./pages.module.css";

const beyondLogos = [
  { src: "/rollon-v10/day1-logo.png", alt: "day1", width: 125, height: 60 },
  { src: "/rollon-v10/project-ark-logo.png", alt: "Project Ark", width: 190, height: 60 },
  { src: "/nova/logo-metal.png", alt: "NOVA", width: 267, height: 60 },
];
export default async function ApproachV10({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "ApproachV10" });
  const { image } = await getRollonAssets("approach");
  return <RollonPage page="approach" locale={locale}>
    <section id="how-we-think" className={`${s.section} ${s.pink} ${s.think}`}>
      <div className={base.container}>
        <SectionHeading eyebrow={t("think.eyebrow")} title={t("think.title")} description={t("think.description")} />
        <div className={s.thinkGrid}>{[1,2,3,4,5].map(i => <article key={i} className={s.card}>
          <p className={s.number}>0{i}</p><h3>{t(`principles.${i}.title`)}</h3><p>{t(`principles.${i}.description`)}</p>
        </article>)}</div>
      </div>
    </section>
    <section id="what-we-do" className={`${s.section} ${s.services}`}>
      <div className={base.container}>
        <SectionHeading eyebrow={t("services.eyebrow")} title={t("services.title")} description={t("services.description")} />
        {(["consult", "execute"] as const).map((kind, row) => <div className={s.serviceGroup} key={kind}>
          <div className={s.groupHeading}><p className={`${base.eyebrow} ${s.sectionEyebrow}`}>{t(`services.${kind}`)}</p><h3>{t(`services.${kind}Title`)}</h3></div>
          <div className={s.serviceGrid}>{[1,2,3,4,5].map(n => { const i = n + row * 5; return <article className={s.serviceCard} key={i}><p className={s.number}>{String(i).padStart(2,"0")}</p><h4>{t(`serviceNames.${i}`)}</h4></article>; })}</div>
        </div>)}
        <div className={s.serviceGroup}>
          <div className={s.groupHeading}><p className={`${base.eyebrow} ${s.sectionEyebrow}`}>{t("services.beyond")}</p><h3>{t("services.beyondTitle")}</h3></div>
          <div className={s.threeGrid}>{beyondLogos.map((logo,index) => <article key={logo.alt} className={s.beyondCard}>
            <div className={s.beyondLogo}><Image src={image(logo.src)} alt={logo.alt} width={logo.width} height={logo.height} style={{width:`calc(${logo.width} * var(--home-unit))`}} /></div>
            <div><h4>{index === 2 ? <Link href={pathForLocale("/product",locale)}>{t(`beyond.${index+1}.title`)}</Link> : t(`beyond.${index+1}.title`)}</h4><p>{t(`beyond.${index+1}.description`)}</p></div>
          </article>)}</div>
        </div>
      </div>
    </section>
    <section className={`${s.section} ${s.pink} ${s.phases}`}>
      <div className={base.container}>
        <SectionHeading eyebrow={t("phases.eyebrow")} title={t("phases.title")} description={t("phases.description")} />
        <div className={`${s.threeGrid} ${s.phaseGrid}`}>{[1,2,3].map(i => <article key={i} className={s.phaseCard}>
          <p className={s.number}>{t(`phases.${i}.label`)}</p><h3>{t(`phases.${i}.title`)}</h3>
          <p className={s.smallLabel}>{t("phases.includes")}</p><ul>{t(`phases.${i}.items`).split("\n").map(item => <li key={item}>{item}</li>)}</ul>
          <div className={s.phasePrice}>{i<3 && <><p className={s.smallLabel}>{t("phases.time")}</p><p>{t(`phases.${i}.time`)}</p></>}
            <p className={s.smallLabel}>{t("phases.fee")}</p><p className={s.price}>{t(`phases.${i}.fee`)}</p><p className={s.priceNote}>{t(`phases.${i}.note`)}</p>
          </div>
        </article>)}</div>
      </div>
    </section>
    <section className={`${s.section} ${s.comparison}`}>
      <div className={base.container}>
        <SectionHeading eyebrow={t("comparison.eyebrow")} title={t("comparison.title")} />
        <div className={s.tableScroll} role="region" aria-label={t("comparison.label")} tabIndex={0}>
          <table className={s.comparisonTable}><caption className={s.srOnly}>{t("comparison.label")}</caption><thead><tr><td />{[1,2,3,4].map(i=><th scope="col" key={i}>{t(`comparison.columns.${i}`)}</th>)}</tr></thead>
            <tbody>{[1,2,3,4,5].map(row=><tr key={row}><th scope="row">{t(`comparison.rows.${row}.label`)}</th>{[1,2,3,4].map(col=><td key={col}>{t(`comparison.rows.${row}.${col}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  </RollonPage>;
}
