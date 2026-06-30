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

  // ---- QuizQuestion（市場進入風格測驗，3 題 × 4 選項；每選項自帶決策風格三維向量）----
  if ((await prisma.quizQuestion.count()) === 0) {
    // 4 種市場進入原型，跨題一致：A 分析型 / B 實驗型 / C ROI 型 / D 夥伴型。
    // scores = { planningDepth, executionStrength, visionClarity }（0~100），決定配對到哪位創辦人。
    const ARCHETYPE = {
      A: { planningDepth: 85, executionStrength: 50, visionClarity: 40 },
      B: { planningDepth: 25, executionStrength: 88, visionClarity: 62 },
      C: { planningDepth: 92, executionStrength: 72, visionClarity: 55 },
      D: { planningDepth: 55, executionStrength: 52, visionClarity: 88 },
    };
    await prisma.quizQuestion.createMany({
      data: [
        {
          order: 0,
          dimension: "entry-style",
          prompt: dual(
            "What would you do first when entering the Taiwan market?",
            "進入台灣市場時，你會先做什麼？",
          ),
          subtitle: dual("Pick the move that feels most like you", "選最像你的那一步"),
          optionA: { label: dual("Analyze case studies", "深入分析案例"), desc: dual("Analyze 3 successful case studies in detail", "深入分析 3 個成功案例"), icon: "doc", scores: ARCHETYPE.A },
          optionB: { label: dual("Talk & test fast", "對話並快速測試"), desc: dual("Talk directly to local people and start testing quickly", "直接與在地人對話，快速開始測試"), icon: "bolt", scores: ARCHETYPE.B },
          optionC: { label: dual("Model the ROI", "先建 ROI 模型"), desc: dual("Build a data model and ROI framework before deciding", "先建立數據模型與 ROI 框架再決定"), icon: "target", scores: ARCHETYPE.C },
          optionD: { label: dual("Find partners first", "先找夥伴/通路"), desc: dual("Find partners or distribution channels first", "先尋找合作夥伴或通路"), icon: "layers", scores: ARCHETYPE.D },
        },
        {
          order: 1,
          dimension: "entry-style",
          prompt: dual(
            "When information is incomplete, what do you usually do?",
            "當資訊不完整時，你通常怎麼做？",
          ),
          subtitle: dual("No right answer — go with your instinct", "沒有標準答案，跟著直覺走"),
          optionA: { label: dual("Wait for more data", "等更多資料"), desc: dual("Wait for more data before making a decision", "等更多資料再做決定"), icon: "doc", scores: ARCHETYPE.A },
          optionB: { label: dual("Act and adjust", "先行動再調整"), desc: dual("Act first and adjust along the way", "先行動，邊走邊調整"), icon: "bolt", scores: ARCHETYPE.B },
          optionC: { label: dual("Consult experts", "諮詢專家"), desc: dual("Consult experts or advisors for validation", "諮詢專家或顧問驗證"), icon: "target", scores: ARCHETYPE.C },
          optionD: { label: dual("Align the team", "與團隊形成共識"), desc: dual("Discuss with the team until reaching consensus", "與團隊討論到形成共識"), icon: "layers", scores: ARCHETYPE.D },
        },
        {
          order: 2,
          dimension: "entry-style",
          prompt: dual(
            "What is your preferred market entry approach?",
            "你偏好的市場進入方式是？",
          ),
          subtitle: dual("Last one — choose what resonates most", "最後一題，選最有共鳴的"),
          optionA: { label: dual("Replicate proven models", "複製成功模式"), desc: dual("Replicate proven models in a standardized way", "以標準化方式複製成功模式"), icon: "doc", scores: ARCHETYPE.A },
          optionB: { label: dual("Experiment & localize", "實驗並在地化"), desc: dual("Fast experimentation and local adaptation", "快速實驗並在地化調整"), icon: "bolt", scores: ARCHETYPE.B },
          optionC: { label: dual("ROI-driven, low risk", "ROI 導向、風險可控"), desc: dual("ROI-driven planning with controlled risk", "ROI 導向、風險可控的規劃"), icon: "target", scores: ARCHETYPE.C },
          optionD: { label: dual("Partnership-first", "夥伴優先"), desc: dual("Partnership-first market entry strategy", "夥伴優先的市場進入策略"), icon: "layers", scores: ARCHETYPE.D },
        },
      ],
    });
    console.log("✓ seeded QuizQuestion");
  }

  // ---- Founder（配對用，連結現有公司檔；內容為 sample，待後台精修） ----
  if ((await prisma.founder.count()) === 0) {
    await prisma.founder.createMany({
      data: [
        {
          slug: "morris-chang",
          companySlug: "tsmc",
          name: dual("Morris Chang", "張忠謀"),
          role: dual("Founder, TSMC", "台積電創辦人"),
          blurb: dual(
            "Pioneered the pure-play foundry model at 55, turning a contrarian long-term bet into the backbone of the global chip industry.",
            "55 歲創立純晶圓代工模式，把一個逆勢的長期賭注，變成全球半導體的中樞。",
          ),
          traits: {
            en: ["Long-term", "Visionary", "Disciplined", "Global"],
            "zh-tw": ["長期主義", "遠見", "紀律", "全球視野"],
          },
          foundedYear: 1987,
          statMarketCap: "~US$0.9T",
          statSecondary: { label: dual("Listed", "上市"), value: "1994" },
          planningDepth: 88,
          executionStrength: 82,
          visionClarity: 92,
          timeline: [
            {
              year: 1987,
              title: dual("TSMC founded", "台積電成立"),
              desc: dual(
                "Created the world's first dedicated semiconductor foundry in Hsinchu.",
                "在新竹創立全球第一家專業半導體代工廠。",
              ),
            },
            {
              year: 1994,
              title: dual("IPO on TWSE", "台股掛牌"),
              desc: dual(
                "Listed on the Taiwan Stock Exchange (2330).",
                "於台灣證券交易所掛牌（2330）。",
              ),
            },
            {
              year: 2018,
              title: dual("Hands over leadership", "交棒退休"),
              desc: dual(
                "Retired, leaving a dual-leadership structure to scale the empire.",
                "退休，留下雙首長制延續這座帝國的成長。",
              ),
            },
          ],
          businessDetails: [
            {
              heading: dual("Brand Story", "品牌故事"),
              body: dual(
                "Bet that fabless chip designers would rather outsource manufacturing — and built the foundry that made it possible.",
                "賭上「無廠設計公司寧願外包製造」的判斷，打造了讓這件事成真的代工廠。",
              ),
            },
            {
              heading: dual("Business Model", "商業模式"),
              body: dual(
                "Pure-play foundry: manufactures chips for others, never competing with its own customers.",
                "純代工：只為他人製造、絕不與客戶競爭。",
              ),
            },
          ],
          order: 0,
        },
        {
          slug: "terry-gou",
          companySlug: "hon-hai",
          name: dual("Terry Gou", "郭台銘"),
          role: dual("Founder, Hon Hai (Foxconn)", "鴻海（富士康）創辦人"),
          blurb: dual(
            "Turned a small connector workshop into the world's largest electronics manufacturer through relentless execution and scale.",
            "靠著極致執行與規模，把一間小小的連接器工廠，做成全球最大的電子製造商。",
          ),
          traits: {
            en: ["Relentless", "Hands-on", "Scale", "Decisive"],
            "zh-tw": ["拼勁", "親力親為", "規模", "果斷"],
          },
          foundedYear: 1974,
          statMarketCap: "~US$70B",
          statSecondary: { label: dual("Employees", "員工"), value: "~1M" },
          planningDepth: 55,
          executionStrength: 94,
          visionClarity: 62,
          timeline: [
            {
              year: 1974,
              title: dual("Hon Hai founded", "鴻海成立"),
              desc: dual(
                "Started with plastic parts and connectors on a small budget.",
                "以小額資本從塑膠零件與連接器起家。",
              ),
            },
            {
              year: 1988,
              title: dual("Shenzhen plant", "深圳設廠"),
              desc: dual(
                "Moved manufacturing to mainland China, unlocking massive scale.",
                "把製造移往中國大陸，解鎖巨大規模。",
              ),
            },
          ],
          businessDetails: [
            {
              heading: dual("Business Model", "商業模式"),
              body: dual(
                "Vertically integrated contract manufacturing at unmatched scale and speed.",
                "垂直整合的代工製造，規模與速度無人能及。",
              ),
            },
          ],
          order: 1,
        },
        {
          slug: "hung-chen-hai",
          companySlug: "eclat-textile",
          name: dual("Hung Chen-hai", "洪鎮海"),
          role: dual("Chairman, Eclat Textile", "儒鴻董事長"),
          blurb: dual(
            "Built a quiet, R&D-driven functional fabric powerhouse by compounding process discipline over decades.",
            "用數十年的製程紀律複利，打造低調但研發驅動的機能布料王國。",
          ),
          traits: {
            en: ["Methodical", "R&D-led", "Patient", "Quality"],
            "zh-tw": ["條理", "研發導向", "耐心", "品質"],
          },
          foundedYear: 1977,
          statMarketCap: "~US$5B",
          statSecondary: { label: dual("Sector", "產業"), value: "Textile" },
          planningDepth: 86,
          executionStrength: 85,
          visionClarity: 52,
          timeline: [
            {
              year: 1977,
              title: dual("Eclat founded", "儒鴻成立"),
              desc: dual(
                "Started as a knitted fabric maker focused on quality.",
                "以針織布料製造起家，專注品質。",
              ),
            },
            {
              year: 2000,
              title: dual("Functional fabrics", "機能布料轉型"),
              desc: dual(
                "Pivoted to high-margin functional fabrics for global sportswear brands.",
                "轉向高毛利機能布料，供應全球運動品牌。",
              ),
            },
          ],
          businessDetails: [
            {
              heading: dual("Business Model", "商業模式"),
              body: dual(
                "Vertically integrated, design-to-fabric partner for premium athletic brands.",
                "垂直整合，為高階運動品牌提供從設計到布料的夥伴。",
              ),
            },
          ],
          order: 2,
        },
        {
          slug: "kao-chin-yen",
          companySlug: "uni-president",
          name: dual("Kao Chin-yen", "高清愿"),
          role: dual("Founder, Uni-President", "統一企業創辦人"),
          blurb: dual(
            "Grew a flour mill into a pan-Asian food and retail empire by balancing patient brand-building with aggressive channel expansion.",
            "把一家麵粉廠養成橫跨亞洲的食品與零售帝國，靠的是耐心品牌經營與積極通路擴張的平衡。",
          ),
          traits: {
            en: ["Balanced", "Brand-builder", "Channel", "Empire"],
            "zh-tw": ["均衡", "品牌經營", "通路", "帝國"],
          },
          foundedYear: 1967,
          statMarketCap: "~US$13B",
          statSecondary: { label: dual("Stores (7-11)", "門市 (7-11)"), value: "6,000+" },
          planningDepth: 74,
          executionStrength: 72,
          visionClarity: 78,
          timeline: [
            {
              year: 1967,
              title: dual("Uni-President founded", "統一企業成立"),
              desc: dual("Started as a flour and feed mill in Tainan.", "於台南以麵粉與飼料廠起家。"),
            },
            {
              year: 1979,
              title: dual("7-Eleven Taiwan", "引進 7-ELEVEN"),
              desc: dual(
                "Brought convenience-store retail to Taiwan, reshaping daily life.",
                "把便利商店零售帶進台灣，重塑日常生活。",
              ),
            },
          ],
          businessDetails: [
            {
              heading: dual("Business Model", "商業模式"),
              body: dual(
                "From manufacturing to brands to retail channels — owning the full path to the consumer.",
                "從製造到品牌到零售通路，掌握通往消費者的完整路徑。",
              ),
            },
          ],
          order: 3,
        },
        {
          slug: "cht-founders",
          companySlug: "chunghwa-telecom",
          name: dual("Chunghwa Telecom", "中華電信"),
          role: dual("National infrastructure builders", "國家級基礎建設經營者"),
          blurb: dual(
            "Steady, systematic stewardship of Taiwan's telecom backbone — low drama, high reliability, methodical modernization.",
            "穩健、系統化地經營台灣電信骨幹——少波瀾、高可靠、按部就班地現代化。",
          ),
          traits: {
            en: ["Systematic", "Reliable", "Low-risk", "Operator"],
            "zh-tw": ["系統化", "可靠", "低風險", "營運者"],
          },
          foundedYear: 1996,
          statMarketCap: "~US$30B",
          statSecondary: { label: dual("Sector", "產業"), value: "Telecom" },
          planningDepth: 80,
          executionStrength: 62,
          visionClarity: 42,
          timeline: [
            {
              year: 1996,
              title: dual("Corporatized", "公司化"),
              desc: dual(
                "Spun out from the state postal/telecom administration.",
                "自國營郵電體系分拆成立。",
              ),
            },
            {
              year: 2005,
              title: dual("Privatized", "民營化"),
              desc: dual("Government stake reduced; listed and privatized.", "釋股民營化、掛牌上市。"),
            },
          ],
          businessDetails: [
            {
              heading: dual("Business Model", "商業模式"),
              body: dual(
                "Owns the fixed + mobile backbone; monetizes reliability, coverage, and enterprise services.",
                "握有固網與行動骨幹，以可靠度、涵蓋率與企業服務變現。",
              ),
            },
          ],
          order: 4,
        },
      ],
    });
    console.log("✓ seeded Founder");
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
