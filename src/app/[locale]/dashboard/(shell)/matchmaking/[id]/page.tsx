import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import MemberDetail from "@/components/dashboard/matchmaking/MemberDetail";
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params; const session = await requireUserPage(locale); setRequestLocale(locale);
  return <MemberDetail key={`${session!.uid}:${id}`} id={id} />;
}
