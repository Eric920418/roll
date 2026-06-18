import { prisma } from "@/lib/prisma";
import { pick } from "@/lib/quiz/locale";
import JsonRecordsAdmin, {
  type AdminRecord,
} from "@/components/admin/JsonRecordsAdmin";

export const dynamic = "force-dynamic";

const TEMPLATE = {
  slug: "",
  companySlug: "",
  name: { en: "", "zh-tw": "" },
  role: { en: "", "zh-tw": "" },
  blurb: { en: "", "zh-tw": "" },
  traits: { en: [], "zh-tw": [] },
  foundedYear: null,
  statMarketCap: "",
  statSecondary: { label: { en: "", "zh-tw": "" }, value: "" },
  planningDepth: 50,
  executionStrength: 50,
  visionClarity: 50,
  timeline: [
    { year: 2000, title: { en: "", "zh-tw": "" }, desc: { en: "", "zh-tw": "" } },
  ],
  businessDetails: [
    { heading: { en: "", "zh-tw": "" }, body: { en: "", "zh-tw": "" } },
  ],
  order: 0,
  published: true,
};

export default async function FoundersAdminPage() {
  const rows = await prisma.founder.findMany({ orderBy: { order: "asc" } });
  const records: AdminRecord[] = rows.map((f) => ({
    id: f.id,
    summary: `${f.slug} · ${pick(f.name, "zh-tw")}${
      f.companySlug ? ` (${f.companySlug})` : ""
    } · P${f.planningDepth}/E${f.executionStrength}/V${f.visionClarity}${
      f.published ? "" : " [隱藏]"
    }`,
    data: {
      slug: f.slug,
      companySlug: f.companySlug,
      name: f.name,
      role: f.role,
      blurb: f.blurb,
      traits: f.traits,
      foundedYear: f.foundedYear,
      statMarketCap: f.statMarketCap,
      statSecondary: f.statSecondary,
      planningDepth: f.planningDepth,
      executionStrength: f.executionStrength,
      visionClarity: f.visionClarity,
      timeline: f.timeline,
      businessDetails: f.businessDetails,
      order: f.order,
      published: f.published,
    },
  }));

  return (
    <JsonRecordsAdmin
      resource="founders"
      title="創辦人"
      description="測驗配對用創辦人（雙語 JSON 編輯）。planningDepth / executionStrength / visionClarity 為 0~100，影響配對。companySlug 連結既有公司分析頁。"
      records={records}
      template={TEMPLATE}
    />
  );
}
