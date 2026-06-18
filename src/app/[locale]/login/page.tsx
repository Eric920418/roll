import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Auth.login" });
  const m = { title: t("metaTitle"), description: t("metaDescription") };
  const url = absoluteUrl("/login", l);

  return {
    title: { absolute: m.title },
    description: m.description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: url,
      languages: {
        en: `${SITE_URL}/login`,
        "zh-TW": `${SITE_URL}/zh-tw/login`,
      },
    },
  };
}

export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthShell step={1}>
      <LoginForm />
    </AuthShell>
  );
}
