import path from "node:path";
import { prisma } from "../src/lib/prisma";

// seed 以獨立 tsx 程序執行，需自行載入 .env 取得 DATABASE_URL
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* CI 環境直接注入環境變數 */
}

/** 雙語值 helper */
const dual = (en: string, zh: string) => ({ en, "zh-tw": zh });

async function main() {
  // ---- Services（對齊 messages 內容） ----
  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({
      data: [
        {
          slug: "fundraising",
          icon: "/10.png",
          title: dual("Fundraising", "募資"),
          desc: dual("From Angel Round to IPO", "從天使輪到IPO的全程陪跑"),
          order: 0,
        },
        {
          slug: "market-entry",
          icon: "/20.png",
          title: dual("Global Expansion", "海外拓展"),
          desc: dual("Landing in Taiwan, Expanding into Asia", "落地台灣、前進亞洲"),
          order: 1,
        },
        {
          slug: "marketing",
          icon: "/30.png",
          title: dual("Marketing", "行銷策略"),
          desc: dual("Precision Marketing & Brand Positioning", "精準行銷、品牌定位"),
          order: 2,
        },
        {
          slug: "legal",
          icon: "/40.png",
          title: dual("Legal Support", "法規支援"),
          desc: dual("Company Setup & Compliance", "公司設立與合規諮詢"),
          order: 3,
        },
        {
          slug: "sales-channel",
          icon: "/50.png",
          title: dual("Sales Channel Development", "通路開發"),
          desc: dual("Distribution Channel Expansion", "銷售管道拓展"),
          order: 4,
        },
        {
          slug: "investor-access",
          icon: "/60.png",
          title: dual("All Nighter Community", "All Nighter Community"),
          desc: dual(
            "Connecting Entrepreneurs & Investors",
            "外商人脈圈 串連創業者與投資人",
          ),
          order: 5,
        },
      ],
    });
    console.log("✓ seeded Service");
  }

  // ---- Events（current 顯示英中混合，雙語先填相同值） ----
  if ((await prisma.event.count()) === 0) {
    const events = [
      {
        date: "11–12 MAY",
        image: "/4.png",
        title: "2026 Asia Summit on Global Health",
        location: "Hong Kong",
        description: "亞洲醫療健康高峰論壇",
      },
      {
        date: "Wed. 27 MAY",
        image: "/2.jpg",
        title: "2026 Taiwan Digital Festival",
        location: "Taitung City",
        description: "演講主題：解決落地的最後一哩路",
      },
      {
        date: "May 29th",
        image: "",
        title: "2026 Dragon's Chamber",
        location: "Taipei City",
        description: "科技新創與投資人聚會 — Ensypre × ROLL ON",
      },
      {
        date: "Coming Up",
        image: "",
        title: "2026 Founder's Cafe",
        location: "",
        description: "",
      },
    ];
    await prisma.event.createMany({
      data: events.map((e, i) => ({
        date: dual(e.date, e.date),
        title: dual(e.title, e.title),
        location: dual(e.location, e.location),
        description: dual(e.description, e.description),
        image: e.image || null,
        order: i,
      })),
    });
    console.log("✓ seeded Event");
  }

  // ---- Clients ----
  if ((await prisma.client.count()) === 0) {
    await prisma.client.createMany({
      data: [
        { name: "Max", logo: "/Max.png", order: 0 },
        { name: "Solo automatic", logo: "/solo.png", order: 1 },
        { name: "INSPO", logo: "/inspo.png", order: 2 },
        { name: "Medix", logo: "/Medix.png", order: 3 },
        { name: "R.co", logo: "/R.co.png", order: 4 },
        { name: "Teotihuacan", logo: "/Teotihuacan.png", order: 5 },
      ],
    });
    console.log("✓ seeded Client");
  }

  // ---- WorkCase（Medix LLC） ----
  if ((await prisma.workCase.count()) === 0) {
    const cases = [
      {
        image: "/IMG_0518.JPG",
        href: "https://www.linkedin.com/posts/vivianlee-rollgrp_medixproclot-medtech-marketentry-activity-7445308208061108224-Dd9P",
        description:
          "Since our trip in January, things have been moving fast. We're seeing great traction in both the MIS (Minimally Invasive Surgery) and pet markets. Our local partners' incredible hustle.",
      },
      {
        image: "/IMG_0418.JPG",
        href: "https://www.linkedin.com/posts/vivianlee-rollgrp_i-have-met-with-more-than-10-investors-and-activity-7444006287463571456-3fk0",
        description:
          "I have met with more than 10 investors and expanded our reach into 3 different countries. One question I am constantly asked is: “How well do you know Steve Lazar?”",
      },
      {
        image: "/IMG_0517.JPG",
        href: "https://www.linkedin.com/posts/vivianlee-rollgrp_medixproclot-hemostasis-biotech-activity-7403122522767974400-WP6I",
        description:
          "Today marks a truly exciting milestone! We have officially entered the Vietnam market! This step not only solidifies our presence in another key region but also offers a valuable opportunity to connect with other leading hemostatic brands and wound care gel suppliers locally.",
      },
    ];
    await prisma.workCase.createMany({
      data: cases.map((c, i) => ({
        group: "Medix LLC",
        image: c.image,
        href: c.href,
        description: dual(c.description, c.description),
        order: i,
      })),
    });
    console.log("✓ seeded WorkCase");
  }

  // ---- Video（GoldenTicket） ----
  if ((await prisma.video.count()) === 0) {
    const videos = [
      {
        thumb: "/1.png",
        href: "https://www.youtube.com/shorts/bPcfxUZQb68",
        title: "不能忽視創新紮根？把模式帶進傳統市場才是…",
        views: "312 次",
      },
      {
        thumb: "/2.png",
        href: "https://www.youtube.com/shorts/6XoZxYTC_cw",
        title: "要賣出去會更重要？創成式比地的關鍵就是…",
        views: "5 次",
      },
      {
        thumb: "/3.png",
        href: "https://www.youtube.com/shorts/bPcfxUZQb68",
        title: "冷門市場才是機會？為什麼越小眾越容易成功",
        views: "5 次",
      },
    ];
    await prisma.video.createMany({
      data: videos.map((v, i) => ({
        thumb: v.thumb,
        href: v.href,
        title: dual(v.title, v.title),
        views: v.views,
        order: i,
      })),
    });
    console.log("✓ seeded Video");
  }

  // ---- InsightTeaser ----
  if ((await prisma.insightTeaser.count()) === 0) {
    await prisma.insightTeaser.createMany({
      data: [
        {
          slug: "taiwan-market-entry-guide",
          title: dual("Taiwan Market Entry Guide", "台灣市場進入完整指南"),
          blurb: dual(
            "The complete pillar guide for foreign companies assessing Taiwan: entity options, timelines, regulation, and go-to-market playbooks.",
            "給評估進入台灣的外商：法人型態選擇、時程、法規、在地 go-to-market 方法論一次看完。",
          ),
          order: 0,
        },
        {
          slug: "foreign-company-setup-taiwan",
          title: dual("Foreign Company Setup in Taiwan", "外商在台公司設立教學"),
          blurb: dual(
            "Step-by-step walkthrough — FIA filing, entity type, bank account, work permits, and realistic timelines.",
            "一步一步走：FIA 送件、法人型態、銀行開戶、工作證、實際時程。",
          ),
          order: 1,
        },
        {
          slug: "asia-expansion-from-taiwan",
          title: dual("Asia Expansion from Taiwan", "從台灣拓展亞洲"),
          blurb: dual(
            "Why Taiwan is the highest-leverage bridge city for Asia rollout, and how to route from Taipei to Tokyo, Seoul, Singapore, HCMC, Bangkok.",
            "為什麼台灣是亞洲拓展槓桿最高的橋樑城市；從台北路由到東京、首爾、新加坡、胡志明、曼谷。",
          ),
          order: 2,
        },
      ],
    });
    console.log("✓ seeded InsightTeaser");
  }

  // ---- Settings（singleton） ----
  // 翻譯覆蓋層初始為空物件（前台 fallback 至 messages/*.json）
  for (const locale of ["en", "zh-tw"]) {
    await prisma.setting.upsert({
      where: { key: `messages.${locale}` },
      create: { key: `messages.${locale}`, value: {} },
      update: {}, // 已存在則不動，避免覆蓋業主翻譯
    });
  }

  // 聯絡資訊 / 社群（Footer）
  await prisma.setting.upsert({
    where: { key: "contactInfo" },
    create: {
      key: "contactInfo",
      value: {
        phone: "(+886) 980-371-946",
        email: "Vivian.lee@roll-grp.com",
        address:
          "Level 34, Taipei Nanshan Plaza, No. 100 Songren Road, Xinyi District, Taipei 110",
        instagram: "https://www.instagram.com/rollon.tw/",
        linkedin: "https://www.linkedin.com/company/rollon/",
      },
    },
    update: {},
  });

  // GoldenTicket channel 設定
  await prisma.setting.upsert({
    where: { key: "goldenTicket" },
    create: {
      key: "goldenTicket",
      value: {
        channelTitle: "GOLDEN TICKET",
        subscribeUrl: "https://www.youtube.com/@GOLDENTICKET-rollon",
        avatar: "/rollon-avatar.png",
        clubImage: "/asia-founders-club.png",
      },
    },
    update: {},
  });

  console.log("✓ seeded Settings");
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
