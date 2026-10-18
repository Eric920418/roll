import { getRollonAssets } from "@/lib/cms/rollon-content";
import Image from "next/image";
import Link from "next/link";
import { inter } from "./font";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import HomeNavigation from "./HomeNavigation";
import RollonFooter from "./RollonFooter";
import styles from "./home.module.css";

const logos = [
  { src: "/Medix.png", alt: "Medix", width: 497, height: 502, className: styles.logoMedix },
  { src: "/Max.png", alt: "HBO Max", width: 866, height: 650, className: styles.logoMax },
  { src: "/inspo.png", alt: "INSPO", width: 2000, height: 892, className: styles.logoInspo },
  { src: "/Teotihuacan.png", alt: "Teotihuacan", width: 1956, height: 1650, className: styles.logoTeotihuacan },
];

const steps = [
  { key: "think", href: "/approach#how-we-think" },
  { key: "execute", href: "/approach#what-we-do" },
  { key: "land", href: "/taiwan" },
] as const;

export default async function HomeV10({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "HomeV10" });
  const { image, error: assetError } = await getRollonAssets("home");

  return (
    <div id="home" className={`${styles.home} ${inter.variable}`} data-brand="rollon" data-home-v10 lang={locale}>
      <div className={styles.heroShell}>
        <HomeNavigation locale={locale} />
        <main id="home-content">
          {assetError && <p role="alert" className={styles.formError}>{assetError}</p>}
          <section className={`${styles.container} ${styles.hero}`} aria-labelledby="home-title">
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>{t("hero.eyebrow")}</p>
              <h1 id="home-title" className={styles.heroTitle}>{t("hero.title")}</h1>
              <p className={styles.heroDescription}>{t("hero.description")}</p>
              <div className={styles.heroActions}>
                <a href="#contact" className={styles.button}>{t("nav.book")}</a>
                <Link href={pathForLocale("/cases", locale)} className={`${styles.button} ${styles.outlineButton}`}>{t("hero.work")}</Link>
              </div>
            </div>
            <div className={styles.heroImage}>
              <Image src={image("/home-v10/taipei-101.jpg")} alt={t("hero.imageAlt")} fill sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1439px) 35vw, 498px" preload />
            </div>
          </section>

          <section className={styles.trusted} aria-labelledby="trusted-title">
            <div className={styles.container}>
              <h2 id="trusted-title" className={styles.eyebrow}>{t("trusted.eyebrow")}</h2>
              <div className={styles.logos}>
                {logos.map((logo) => <Image key={logo.src} src={image(logo.src)} alt={logo.alt} width={logo.width} height={logo.height} className={logo.className} sizes="140px" />)}
              </div>
              <p className={styles.trustedAlso}>{t("trusted.also")}</p>
            </div>
          </section>

          <section className={styles.lead} aria-labelledby="lead-title">
            <div className={styles.container}>
              <p className={styles.eyebrow}>{t("lead.eyebrow")}</p>
              <h2 id="lead-title" className={styles.sectionTitle}>{t("lead.title")}</h2>
              <div className={styles.leadGrid}>
                {(["brand", "sales"] as const).map((key) => (
                  <article key={key} className={`${styles.leadCard} ${key === "brand" ? styles.brandCard : styles.salesCard}`}>
                    <p className={styles.eyebrow}>{t(`lead.${key}.eyebrow`)}</p>
                    <h3>{t(`lead.${key}.title`)}</h3>
                    <p className={styles.leadDescription}>{t(`lead.${key}.description`)}</p>
                    <div className={styles.metric}>
                      <p>{t(`lead.${key}.metric`)}</p>
                      <p>{t(`lead.${key}.caption`)}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="approach" className={styles.approach} aria-labelledby="approach-title">
            <div className={styles.container}>
              <p className={styles.eyebrow}>{t("approach.eyebrow")}</p>
              <h2 id="approach-title" className={styles.sectionTitle}>{t("approach.title")}</h2>
              <div className={styles.stepGrid}>
                {steps.map(({ key, href }, index) => (
                  <article id={key === "land" ? "taiwan" : undefined} key={key} className={styles.stepCard}>
                    <p className={styles.stepNumber}>0{index + 1}</p>
                    <h3>{t(`approach.${key}.title`)}</h3>
                    <p className={styles.stepDescription}>{t(`approach.${key}.description`)}</p>
                    <Link href={pathForLocale(href, locale)}>{t(`approach.${key}.link`)}</Link>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="case-study" className={styles.caseStudy} aria-labelledby="case-title">
            <div className={styles.container}>
              <p className={styles.eyebrow}>{t("case.eyebrow")}</p>
              <h2 id="case-title" className={styles.sectionTitle}>{t("case.title")}</h2>
              <div className={styles.caseGrid}>
                <div className={styles.caseCopy}>
                  <p>{t("case.description")}</p>
                  <Link className={styles.button} href={pathForLocale("/cases#medix", locale)}>{t("case.link")}</Link>
                </div>
                <div className={styles.caseImage}>
                  <Image src={image("/IMG_0418.JPG")} alt={t("case.imageAlt")} fill sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1439px) 36vw, 518px" />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.belief} aria-labelledby="belief-title">
            <div className={styles.container}>
              <p className={styles.eyebrow}>{t("belief.eyebrow")}</p>
              <h2 id="belief-title">{t("belief.title")}</h2>
              <a href="#contact" className={`${styles.button} ${styles.redButton}`}>{t("nav.book")}</a>
            </div>
          </section>
        </main>
      </div>

      <RollonFooter locale={locale} />
    </div>
  );
}
