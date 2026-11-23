import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import NovaLogo from "@/components/brand/NovaLogo";
import type { Locale } from "@/i18n/routing";
import { getVideos, getSetting } from "@/lib/cms/content";
import { getRollonAssets } from "@/lib/cms/rollon-content";
import {
  novaCommunityCards, novaCommunityDate, novaLandingHttps,
  novaLandingSettingKey, novaNetworkRoles, resolveNovaLanding,
} from "@/lib/cms/nova-landing";
import { pathForLocale } from "@/lib/routes";
import { REPORT_PAGE } from "@/lib/reports/catalog";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import { MEETING_URL, meetingLabel } from "@/lib/public-contact";
import Newsletter from "./Newsletter";
import s from "./landing.module.css";

export default async function NovaLanding({ locale, pricing }: { locale: Locale; pricing: ReactNode }) {
  const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en;
  const path = (url: string) => pathForLocale(url, locale);
  const results = await Promise.allSettled([
    getVideos(), getSetting("contactInfo"), getRollonAssets("about"),
    getSetting(novaLandingSettingKey("network")), getSetting(novaLandingSettingKey("community")),
  ]);
  const [videos, contact, assets, networkSetting, communitySetting] = results;
  const clips = videos.status === "fulfilled" ? videos.value.filter(v => novaLandingHttps(v.href)) : [];
  const info = contact.status === "fulfilled" ? contact.value : {};
  const image = assets.status === "fulfilled" ? assets.value.image : (value: string) => value;
  const errors = results.flatMap((r, i) => r.status === "rejected"
    ? [publicErrorMessage(logSecurityError("nova.public." + i, r.reason))] : []);
  if (assets.status === "fulfilled" && assets.value.error) errors.push(assets.value.error);
  const network = resolveNovaLanding("network", networkSetting.status === "fulfilled" ? networkSetting.value : {});
  const community = resolveNovaLanding("community", communitySetting.status === "fulfilled" ? communitySetting.value : {});
  const linkedin = typeof info.linkedin === "string" ? novaLandingHttps(info.linkedin) : null;
  const communityLink = novaLandingHttps(community.link) ?? linkedin ?? "https://www.linkedin.com/company/rollon/";
  const signup = path("/signup"), matching = path("/dashboard/matchmaking");
  const moves = [
    { n: "01", label: w("新創生態系", "Value Network"), title: w("找到對的人", "Find the right people"),
      body: w("推薦值得認識的創辦人、實戰導師與投資人。", "Meet founders, experienced mentors and investors worth knowing."),
      photo: "market-roundtable", href: matching },
    { n: "02", label: w("每週圓桌會議", "Weekly roundtables"), title: w("與同階段創辦人對焦", "Connect with founders at your stage"),
      body: w("每週 50 分鐘，帶走明確的下週承諾。", "Fifty minutes each week. Leave with a clear commitment for next week."),
      photo: "founder-roundtable", href: path("/dashboard/matchmaking?tab=roundtables") },
    { n: "03", label: w("客戶驗證", "Customer validation"), title: w("確認誰會付錢", "Find who will pay"),
      body: w("3 次客戶對話，找出痛點與付費意願。", "Three customer conversations to understand pain and willingness to pay."),
      photo: "customer-conversation", href: signup },
    { n: "04", label: w("今日任務", "Today's priority"), title: w("每天聚焦一件最重要的事", "Focus on one priority every day"),
      body: w("5 個里程碑，進度清楚可追蹤。", "Five milestones with progress you can track."),
      photo: "founder-laptop", href: path("/dashboard/agenda") },
  ];
  const people = [
    { key: "vivian-lee", name: "Vivian Lee",
      role: w("創辦人暨執行長｜NOVA AI 與 Roll On", "Founder & CEO | NOVA AI & Roll On"),
      description: w("超過 10 年業務開發經驗，曾主導國際品牌在台灣的市場落地與行銷活動；協助美國公司在一年內於 5 個國家簽約。高中開始創業，曾受邀參加 Shark Tank Taiwan 第一季，具會計師執照。",
        "Over ten years in business development, leading international brands' Taiwan market entry and marketing. Helped a US company sign agreements in five countries within one year. Started her first business in high school, appeared in the first season of Shark Tank Taiwan and holds an accounting qualification.") },
    { key: "eric", name: "Eric", role: w("共同創辦人暨技術長｜NOVA AI", "Co-founder & CTO | NOVA AI"),
      description: w("負責 NOVA AI 的產品與技術架構，從零打造 NOVA 平台。曾參加 YC 黑客松，在 4 小時內完成一個 AI 資安工具。",
        "Leads NOVA AI's product and technology architecture, building the platform from scratch. Built an AI security tool in four hours at a YC hackathon.") },
    { key: "vincent", name: "Vincent Lu", role: w("商業顧問", "Business advisor"),
      description: w("台北天使投資合夥人，長期輔導新創的業務開發與市場定位。", "A Taipei angel investment partner advising startups on business development and market positioning.") },
    { key: "iris", name: "Iris", role: w("創意設計師", "Creative designer"),
      description: w("負責 NOVA AI 與 Roll On 的品牌視覺與設計。", "Leads brand identity and design for NOVA AI and Roll On.") },
  ];
  const caseStudies = [
    { name: "QUIBI", image: "quibi-91bcf9c1", metric: "$1.75B", label: w("先建置", "BUILD FIRST"),
      summary: w("募資金額；上線約六個月後宣布關閉", "Raised, then announced closure about six months after launch"),
      link: w("為什麼資金買不到需求", "Why funding can't buy demand"),
      source: "https://www.spglobal.com/market-intelligence/en/news-insights/research/quibis-2-billion-bet-on-mobile-video-fizzles-out" },
    { name: "DROPBOX", image: "dropbox-aafb77a9", metric: "15×", label: w("先驗證", "VALIDATE FIRST"),
      summary: w("一支示範影片帶來的候補名單成長", "Waitlist growth from one demo video"),
      link: w("一支影片如何驗證需求", "How one video proved demand"),
      source: "https://www.inc.com/30under30/2011/profile-drew-houston-and-arash-ferdowsi-founders-dropbox.html" },
    { name: "ZAPPOS", image: "zappos-ae8d7035", metric: "0", label: w("先驗證", "VALIDATE FIRST"),
      summary: w("第一筆成交前的庫存", "Inventory before the first sale"),
      link: w("先成交，再建置", "Selling before building"),
      source: "https://openclassrooms.com/en/courses/4544561-learn-about-lean-startup/4544568-the-lean-startup-cycle" },
  ];
  return <div className={s.page}>
    <section id="how" className={s.hero}>
      <div className={s.heroGrid}>
        <article className={s.cover}>
          <Image src="/nova/community/founder-talk.webp" alt="" fill priority sizes="(max-width: 767px) 100vw, 560px" className={s.heroPhoto} />
          <div className={s.coverContent}>
            <NovaLogo variant="metal" className={s.coverLogo} priority />
            <div className={s.coverCopy}>
              <h1>{w("先驗證，", "Validate first,")}<br />{w("再建置。", "then build.")}</h1>
              <p>{w("在花更多時間和錢之前，先確認誰會付錢給你。NOVA 用真實的客戶對話，幫你決定最重要的下一步。",
                "Before spending more time and money, find out who will pay. NOVA uses real customer conversations to help you decide your most important next step.")}</p>
            </div>
            <div className={s.coverBottom}><span>{w("今日任務 × 新創生態系", "Today's priority × Value Network")}</span><Link href={signup}>{w("開始驗證", "Start validating")} ↗</Link></div>
          </div>
        </article>
        <div className={s.steps}>{moves.map(move => <Link key={move.n} href={move.href} className={s.step}>
          {move.photo && <Image src={`/nova/community/${move.photo}.webp`} alt="" fill sizes="(max-width: 1000px) 50vw, 280px" className={s.heroPhoto} />}
          <div className={s.stepContent}><span className={s.number}>{move.n}</span><p className={s.stepLabel}>{move.label}</p><h2>{move.title}</h2><p>{move.body}</p></div>
        </Link>)}</div>
      </div>
      <div className={s.quickLinks}>
        <a href={clips[0]?.href || "https://www.youtube.com/@GOLDENTICKET-rollon"} target="_blank" rel="noopener noreferrer">GOLDEN TICKET ↗</a>
        <Link href={path("/insights")}>{w("創辦人指南", "Founder guides")} ↗</Link>
        <a href="#community">{w("社群與活動", "Community & events")} ↗</a>
        <a href={MEETING_URL} target="_blank" rel="noopener noreferrer">{meetingLabel(locale)} ↗</a>
      </div>
    </section>
    {errors.length > 0 && <div role="alert" className={s.error}>{errors.map((error, i) => <p key={i}>{error}</p>)}<a href={path("/product")}>{w("重新載入", "Reload page")}</a></div>}
    <aside className={s.pilot}><p>{w("來自 5 個國家的使用者，正在試行使用 NOVA AI。", "Users across five countries are piloting NOVA AI.")}</p><div><strong>5</strong><span>{w("個國家・", "countries ·")}<br />{w("試行使用者", "Pilot users")}</span></div></aside>
    <section id="cases" className={s.section} aria-labelledby="evidence-heading">
      <Link className={s.reportBanner} href={path(REPORT_PAGE)}><span>{w("下載 2026 第四季台灣市場進入報告 →", "Download the Q4 2026 Taiwan Market Entry Report →")}</span><small>From visions to big impacts</small></Link>
      <div className={s.sectionHeading}><h2 id="evidence-heading">{w("願景很昂貴。", "Vision is expensive.")}<br /><span>{w("證據，不必昂貴。", "Evidence is not.")}</span></h2></div>
      <div className={`${s.three} ${s.caseStats}`}>{caseStudies.map(c => <article key={c.name}>
        <div className={s.caseImage}><Image src={`/nova/cases/${c.image}.webp`} alt={w(`${c.name} 案例照片`, `${c.name} case study photo`)} fill sizes="(max-width: 767px) 100vw, 380px" className={s.casePhoto} /></div>
        <p className={s.eyebrow}>{c.label} · {c.name}</p><h3 className={s.caseNumber}>{c.metric}</h3><p className={s.caseSummary}>{c.summary}</p>
        <a className={s.caseSource} href={c.source} target="_blank" rel="noopener noreferrer">{c.link}<span aria-hidden="true">↗</span></a>
      </article>)}</div>
    </section>
    <section id="team" className={`${s.section} ${s.teamSection}`}>
      <div className={s.team}><h2>{w("認識 NOVA AI", "Meet the NOVA AI")}<br />{w("團隊。", "team.")}</h2><div>
        {people.map(person => <article key={person.key}>
          <Image src={person.key === "eric" ? "/nova/team/eric-bw.webp" : image(`/rollon-v10/${person.key}.jpg`)} alt={person.name} width={85} height={85} />
          <div><h3>{person.name}</h3><p>{person.role}</p></div><p>{person.description}</p>
        </article>)}
        <Link className={s.outlineButton} href={path("/about")}>{w("認識團隊", "Meet the team")} ↗</Link>
      </div></div>
    </section>
    <section id="network" className={`${s.section} ${s.editableSection}`} aria-labelledby="network-heading">
      <div className={s.sectionHeading}><h2 id="network-heading">{network[`title.${locale}`]}</h2><Link className={s.outlineButton} href={matching}>{network[`cta.${locale}`]} ↗</Link></div>
      <div className={s.roles}>{novaNetworkRoles.map(({ id }) => <Link href={matching} key={id}>
        <div className={s.roleImage}>{network[`${id}.image`]
          ? <Image src={network[`${id}.image`]} alt="" fill sizes="(max-width: 767px) 50vw, 224px" className={s.photo} />
          : <div className={s.assetPending}>{network[`${id}.imageLabel.${locale}`]}</div>}</div>
        <h3>{network[`${id}.title.${locale}`]}</h3><p>{network[`${id}.body.${locale}`]}</p>
      </Link>)}</div>
    </section>
    <div className={s.pricing}>{pricing}</div>
    <section id="community" className={`${s.section} ${s.editableSection}`} aria-labelledby="community-heading">
      <div className={s.sectionHeading}><h2 id="community-heading">{community[`title.${locale}`]}</h2><a className={s.outlineButton} href={communityLink} target="_blank" rel="noopener noreferrer">{community[`cta.${locale}`]} ↗</a></div>
      <div className={s.three}>{novaCommunityCards.map(id => {
        const cover = community[`${id}.image`], date = community[`${id}.date`];
        const href = novaLandingHttps(community[`${id}.link`]);
        return <article className={`${s.communityCard} ${id === "roundtable" ? s.communityFeatured : ""}`} key={id}>
          <div className={s.communityImage}>{cover
            ? <Image src={cover} alt="" fill sizes="(max-width: 767px) 100vw, 380px" className={s.photo} />
            : <div className={s.assetPending}>{community[`${id}.imageLabel.${locale}`]}</div>}</div>
          <div className={s.communityCopy}>
            <p className={s.eyebrow}>{community[`${id}.eyebrow.${locale}`]}</p>
            <p className={s.eventDate}>{date ? <time dateTime={date}>{novaCommunityDate(date, locale)}</time> : community[`${id}.dateLabel.${locale}`]}{date && community[`${id}.dateLabel.${locale}`] && `｜${community[`${id}.dateLabel.${locale}`]}`}</p>
            <h3>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{community[`${id}.title.${locale}`]} ↗</a> : community[`${id}.title.${locale}`]}</h3>
            <p className={s.communityBody}>{community[`${id}.body.${locale}`]}</p>
          </div>
        </article>;
      })}</div>
    </section>
    <div className={s.closing}>
      <div className={s.closingGrid}><div>
        <p className={s.eyebrow}>{w("敢於行動，先驗證。", "Be bold. Validate first.")}</p>
        <h2>{w("下一個決定，", "For your next decision,")}<br />{w("讓證據帶路。", "let evidence lead.")}</h2>
        <div className={s.actions}><Link className={s.lightButton} href={signup}>{w("免費開始", "Start free")} ↗</Link><a className={s.outlineLight} href={MEETING_URL} target="_blank" rel="noopener noreferrer">{meetingLabel(locale)} ↗</a></div>
      </div><Newsletter embedded /></div>
      <footer className={s.footer}>
        <a className={s.brand} href={path("/product")} aria-label="NOVA AI"><NovaLogo variant="metal" className={s.footerLogo} /><span>BY ROLL ON</span></a>
        <address>{typeof info.address === "string" && info.address.trim() ? info.address : "Level 34, Taipei Nanshan Plaza, No. 100 Songren Road, Xinyi District, Taipei 110"}</address>
        <div>{[["Instagram", info.instagram], ["LinkedIn", communityLink]].map(([label, href]) => typeof href === "string" && novaLandingHttps(href) ? <a key={label as string} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : null)}<span>© {new Date().getFullYear()} Roll On</span></div>
      </footer>
    </div>
  </div>;
}
