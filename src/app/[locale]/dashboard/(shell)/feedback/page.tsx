import { setRequestLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/auth/account";
import FeedbackManager, {
  type FeedbackRow,
} from "@/components/dashboard/FeedbackManager";

type Props = { params: Promise<{ locale: string }> };

// 問題回報 —— 全會員可用（不套 requirePlan，理由見 src/app/api/feedback/route.ts）。
// (shell)/layout 已擋未登入並 redirect；此處的 null 分支只為型別安全。
export default async function FeedbackPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Dashboard.feedback" });

  const account = await getCurrentAccount();
  const rows = account
    ? await prisma.feedbackReport.findMany({
        where: { userId: account.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          pageUrl: true,
          status: true,
          adminReply: true,
          createdAt: true,
        },
      })
    : [];

  // Date → ISO 字串（傳給 client 元件）
  const reports: FeedbackRow[] = rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>

      <FeedbackManager reports={reports} />
    </div>
  );
}
