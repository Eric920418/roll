import { setRequestLocale, getTranslations } from "next-intl/server";
import { requirePlan } from "@/lib/billing/gate";
import { prisma } from "@/lib/prisma";
import NotesManager from "@/components/dashboard/NotesManager";
import PlanPaywall from "@/components/dashboard/PlanPaywall";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export default async function NotesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.notes" });

  const account = await requirePlan("pro");
  const rows = account
    ? await prisma.meetingNote.findMany({
        where: { userId: account.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, body: true, meetingAt: true },
      })
    : [];
  // Date → ISO 字串（傳給 client 元件）
  const notes = rows.map((n) => ({
    ...n,
    meetingAt: n.meetingAt ? n.meetingAt.toISOString() : null,
  }));

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      {!account ? <PlanPaywall locale={l} /> : <NotesManager notes={notes} />}
    </div>
  );
}
