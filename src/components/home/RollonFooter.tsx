import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { INSIGHT_SLUGS, pathForLocale } from "@/lib/routes";
import { getSetting } from "@/lib/cms/content";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import HomeContactForm from "./HomeContactForm";
import styles from "./home.module.css";

export default async function RollonFooter({ locale, path = "/" }: { locale: Locale; path?: string }) {
  const t = await getTranslations({ locale, namespace: "HomeV10" });
  let contact: Record<string, unknown> = {};
  let contactError = "";
  try {
    contact = await getSetting("contactInfo");
  } catch (error) {
    contactError = publicErrorMessage(logSecurityError("home.contact-info", error));
  }
  const email = typeof contact.email === "string" ? contact.email : "Vivian.lee@roll-grp.com";
  const phone = typeof contact.phone === "string" ? contact.phone : "(+886) 980-371-946";
  const address = typeof contact.address === "string" ? contact.address : "Level 34, Taipei Nanshan Plaza, No. 100 Songren Road, Xinyi District, Taipei 110";
  const socialLinks = [
    { label: "Instagram", href: typeof contact.instagram === "string" ? contact.instagram : "https://www.instagram.com/rollon.tw/" },
    { label: "LinkedIn", href: typeof contact.linkedin === "string" ? contact.linkedin : "https://www.linkedin.com/company/rollon/" },
  ].filter(({ href }) => /^https?:\/\//i.test(href));

  return (
      <footer id="contact" className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.contactGrid}>
            <div>
              <h2 className={styles.contactTitle}>{t("contact.title")}</h2>
              <address className={styles.contactDetails}>
                {email && <a className={styles.contactEmail} href={`mailto:${email}`}>{email}</a>}
                {phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>{phone}</a>}
                {address && <p>{address}</p>}
              </address>
              {contactError && <p role="alert" className={styles.formError}>{contactError}</p>}
            </div>
            <HomeContactForm locale={locale} labels={{ name: t("contact.name"), email: t("contact.email"), message: t("contact.message"), send: t("contact.send"), sending: t("contact.sending"), success: t("contact.success"), error: t("contact.error") }} />
          </div>
          <div className={styles.footerResources}>
            <nav aria-label={t("footer.insights")}>
              <h3>{t("footer.insights")}</h3>
              {INSIGHT_SLUGS.map((slug) => <Link key={slug} href={pathForLocale(`/insights/${slug}`, locale)}>{t(`footer.${slug}`)}</Link>)}
            </nav>
            {socialLinks.length > 0 && <nav aria-label={t("footer.social")}>
              <h3>{t("footer.social")}</h3>
              {socialLinks.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}
            </nav>}
          </div>
          <div className={styles.footerBottom}>
            <div className={styles.footerBrand}>
              <Link href={pathForLocale("/", locale)} className={styles.wordmark}>ROLL ON.</Link>
              <p>{t("footer.tagline")}</p>
            </div>
            <div className={styles.footerProducts}><Link href={pathForLocale("/product", locale)}>NOVA ↗</Link><p>{t("footer.since")}</p></div>
          </div>
          <nav className={styles.footerLanguages} aria-label={t("footer.language")}>
            <Link href={pathForLocale(path, "en")} lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>EN</Link>
            <Link href={pathForLocale(path, "zh-tw")} lang="zh-TW" hrefLang="zh-TW" aria-current={locale === "zh-tw" ? "page" : undefined}>繁中</Link>
          </nav>
        </div>
      </footer>
  );
}
