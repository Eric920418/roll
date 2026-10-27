import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import MindsetPage from "@/components/dashboard/MindsetPage";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; const session = await requireUserPage(locale); setRequestLocale(locale);
  return <MindsetPage key={session!.uid} />;
}
