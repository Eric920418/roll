import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserSession } from "@/lib/auth/guard";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
export const metadata: Metadata = { title: "NOVA · Roundtables", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) notFound();
  const l = locale as Locale, returnPath = pathForLocale("/roundtables/" + id, l);
  if (!await getUserSession()) redirect(pathForLocale("/login", l) + "?next=" + encodeURIComponent(returnPath));
  redirect(pathForLocale("/dashboard/matchmaking?tab=roundtables&roundtable=" + encodeURIComponent(id), l));
}
