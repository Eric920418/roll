import { getRollonAssets } from "@/lib/cms/rollon-content";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import RollonPage, { SectionHeading } from "./RollonPage";
import base from "./home.module.css";
import s from "./pages.module.css";

const gallery = [
  {src:"/IMG_0418.JPG",position:"center 42%"},
  {src:"/rollon-v10/medix-florida-trip.jpg",position:"center 45%"},
  {src:"/rollon-v10/medix-taipei-booth.jpg",position:"center 45%"},
  {src:"/rollon-v10/medix-taipei-visitors.jpg",position:"center 66%"},
  {src:"/rollon-v10/medix-vietnam-market.jpg",position:"center 40%"},
  {src:"/rollon-v10/medix-vietnam-pharmacy.jpg",position:"center 12%"},
  {src:"/rollon-v10/medix-vietnam-hospital.jpg",position:"center"},
  {src:"/rollon-v10/medix-hong-kong-fair.jpg",position:"center 62%"},
  {src:"/rollon-v10/medix-cambodia.jpg",position:"center"},
  {src:"/rollon-v10/medix-turkey.jpg",position:"center"},
  {src:"/rollon-v10/medix-taiwan-spca.jpg",position:"center 40%"},
  {src:"/rollon-v10/medix-straykind.jpg",position:"center"},
];
const events = [
  [{name:"enspyre-partnership-1",position:"center"},{name:"enspyre-partnership-2",position:"center 30%"}],
  [{name:"startup-terrace-1",position:"center 55%"},{name:"startup-terrace-2",position:"center 55%"}],
  [{name:"ieat-medical-1",position:"center 40%"},{name:"ieat-medical-2",position:"center"},{name:"ieat-medical-3",position:"center"}],
  [1,2,3,4].map(i=>({name:`taiwan-digital-festival-${i}`,position:"center"})),
  [{name:"shark-tank-taiwan",position:"center 55%"}],
  [{name:"prochile-visit",position:"center"}],
];
const partners = [
  {name:"enspyre",alt:"Enspyre",width:167,height:42}, {name:"deloitte",alt:"Deloitte",width:163,height:32},
  {name:"ma",alt:"M&A",width:120,height:54}, {name:"geber",alt:"Geber",width:135,height:42},
  {name:"prochile",alt:"ProChile",width:67,height:66},
];
export default async function CasesV10({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "CasesV10" });
  const { image } = await getRollonAssets("cases");
  return <RollonPage page="cases" locale={locale}>
    <section id="medix" className={`${s.section} ${s.red} ${s.medix}`}><div className={base.container}>
      <SectionHeading eyebrow={t("medix.eyebrow")} title={t("medix.title")} />
      <div className={s.medixSummary}>
        <div className={s.medixCopy}>{(["challenge","work","result"] as const).map(key=><div key={key}><h3 className={base.eyebrow}>{t(`medix.${key}Label`)}</h3><p>{t(`medix.${key}`)}</p></div>)}<a className={base.button} href="#contact">{t("medix.cta")}</a></div>
        <div className={s.medixMetrics}><div className={s.medixMetricRow}><div><p>{t("medix.fundingValue")}</p><p>{t("medix.funding")}</p></div><div><p>{t("medix.countriesValue")}</p><p>{t("medix.countries")}</p></div></div>
          <div className={s.markets}><h3 className={base.eyebrow}>{t("medix.markets")}</h3><ul>{[1,2,3,4,5].map(i=><li key={i}>{t(`medix.marketNames.${i}`)}</li>)}</ul></div>
        </div>
      </div>
      <div className={s.gallery}>{gallery.map((item,i)=><figure key={item.src}>
        <div className={s.galleryImage}><Image src={image(item.src)} alt={`${t(`gallery.${i+1}.title`)} — ${t(`gallery.${i+1}.location`)}`} fill sizes="(max-width:767px) calc(100vw - 48px), (max-width:1023px) 44vw, 27vw" style={{objectPosition:item.position}} /></div>
        <figcaption><p className={base.eyebrow}>{t(`gallery.${i+1}.location`)}</p><h3>{i >= 10 ? <a className={s.galleryLink} href={i === 10 ? "https://www.spca.org.tw/" : "https://www.facebook.com/StrayKindTaiwan/"}>{t(`gallery.${i+1}.title`)}</a> : t(`gallery.${i+1}.title`)}</h3>{t(`gallery.${i+1}.description`) && <p>{t(`gallery.${i+1}.description`)}</p>}</figcaption>
      </figure>)}</div>
    </div></section>
    <section id="ecosystem" className={`${s.section} ${s.ecosystem}`}><div className={base.container}>
      <SectionHeading eyebrow={t("ecosystem.eyebrow")} title={t("ecosystem.title")} />
      <div className={s.events}>{events.map((items,i)=><article key={i} className={s.event}>
        <div className={s.eventCopy}><p className={`${base.eyebrow} ${s.sectionEyebrow}`}>{t(`events.${i+1}.eyebrow`)}</p><h3>{t(`events.${i+1}.title`)}</h3>{t(`events.${i+1}.description`) && <p>{t(`events.${i+1}.description`)}</p>}</div>
        <div className={`${s.eventPhotos} ${s[`eventPhotos${i+1}`]}`}>{items.map((item,index)=><div key={item.name} className={s.eventImage}><Image src={image(`/rollon-v10/${item.name}.jpg`)} alt={`${t(`events.${i+1}.title`)} (${index+1})`} fill sizes="(max-width:767px) calc(100vw - 48px), 27vw" style={{objectPosition:item.position}} /></div>)}</div>
      </article>)}</div>
      <div className={s.partners}><h3 className={base.eyebrow}>{t("ecosystem.partners")}</h3><div>{partners.map(p=><Image key={p.name} src={image(`/rollon-v10/${p.name}-logo.png`)} alt={p.alt} loading="eager" width={p.width} height={p.height} style={{width:`calc(${p.width} * var(--home-unit))`,height:`calc(${p.height} * var(--home-unit))`}} />)}</div></div>
    </div></section>
  </RollonPage>;
}
