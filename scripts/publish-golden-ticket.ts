import { prisma } from "../src/lib/prisma";

const id = "golden-ticket-ep3-enspyre";
const video = {
  id,
  order: 0,
  published: true,
  thumb: "/golden-ticket-call-center.jpg",
  href: "https://www.youtube.com/watch?v=CAZhCUssgn0",
  title: {
    en: "How To Start & Grow a Business in Taiwan | GOLDEN TICKET EP.3",
    "zh-tw": "在台灣創業與成長：龍穴與 B2B 商機開發｜GOLDEN TICKET EP.3",
  },
  views: "",
};

async function main() {
  const existing = await prisma.video.findUnique({ where: { id } });
  if (existing) {
    if (existing.href !== video.href || existing.thumb !== video.thumb) {
      throw new Error("Golden Ticket EP.3 既有資料與預期不同；未覆寫任何資料。");
    }
    console.log("Golden Ticket EP.3 already published; no changes.");
    return;
  }
  await prisma.video.create({ data: video });
  console.log("Published Golden Ticket EP.3; existing videos preserved.");
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
