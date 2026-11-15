import { NextIntlClientProvider } from "next-intl";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import Roundtables from "@/components/admin/Roundtables";
export default async function Page() {
  const admin = await requireAdminPage();
  if (!admin) redirect("/admin/login");
  return <NextIntlClientProvider locale="zh-tw" messages={{}} timeZone="Asia/Taipei"><Roundtables operator={admin.email} /></NextIntlClientProvider>;
}
