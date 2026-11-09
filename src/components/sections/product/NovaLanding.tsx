import Image from "next/image";
import NovaLogo from "@/components/brand/NovaLogo";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";
import { getVideos, getSetting } from "@/lib/cms/content";
import { getRollonAssets } from "@/lib/cms/rollon-content";
import { pathForLocale } from "@/lib/routes";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import s from "./landing.module.css";
import Newsletter from "./Newsletter";
import { MEETING_URL, meetingLabel } from "@/lib/public-contact";
const safeLink = (value: unknown) => typeof value === "string" && /^https:\/\//i.test(value) ? value : null;
export default async function NovaLanding({ locale, pricing }: {
    locale: Locale;
    pricing: ReactNode;
}) {
    const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en, path = (url: string) => pathForLocale(url, locale);
    const results = await Promise.allSettled([getVideos(), getSetting("contactInfo"), getRollonAssets("about")]);
    const [videos, contact, assets] = results;
    const clips = videos.status === "fulfilled" ? videos.value.filter(v => safeLink(v.href)) : [];
    const info = contact.status === "fulfilled" ? contact.value : {};
    const image = assets.status === "fulfilled" ? assets.value.image : (value: string) => value;
    const errors = results.flatMap((r, i) => r.status === "rejected" ? [publicErrorMessage(logSecurityError("nova.public." + i, r.reason))] : []);
    const team = await getTranslations({ locale, namespace: "AboutV10.team" });
    const signup = path("/signup"), matching = path("/dashboard/matchmaking");
    return <div className={s.page}>
    <section className={s.hero}>
      <div className={s.heroTitle}><p className={s.eyebrow}>{w("先驗證，再建置", "EVIDENCE BEFORE EXECUTION")}</p><h1>{w("為敢於行動的人，", "Built for the Bold,")}<br /><span>{w("從想法走向全球。", "from Idea to Global.")}</span></h1><div><p>{w("先確認誰需要你的產品，再把每一次客戶對話，變成清楚的下一步。", "Find who needs your product. Turn real customer conversations into one clear next move.")}</p><Link className={s.lightButton} href={signup}>{w("開始免費體驗", "Start free trial")} <span aria-hidden="true">↗</span></Link><small>{w("14 天 · 3 家客戶對話 · 無需信用卡", "14 days · 3 customer conversations · No credit card")}</small><a href={MEETING_URL} target="_blank" rel="noopener noreferrer">{meetingLabel(locale)} ↗</a></div></div>
      <div id="how" className={s.heroGrid}>
        <article className={s.cover} aria-label={w("NOVA AI：先驗證，再建置", "NOVA AI: validate first, build with evidence")}><div>
          <NovaLogo variant="white" className="h-auto w-44" />
          <div className={s.coverCopy}><p className={s.eyebrow}>{w("讓證據帶路", "LET EVIDENCE LEAD")}</p><h2>{w("先驗證，", "Validate first.")}<br />{w("再建置。", "Build with evidence.")}</h2><p>{w("釐清目標客戶，完成眼前一步，讓每一次交流成為下一步的依據。", "Find your target customer, take one clear step, and turn each conversation into evidence for the next.")}</p></div>
          <p className="items-center gap-4"><span>{w("今日任務 × 商機媒合", "Today's tasks × Matchmaking")}</span><Link href={signup} className="inline-flex min-h-11 items-center text-white!">{w("開始驗證", "Start validating")} ↗</Link></p>
        </div></article>
        <div className={s.steps}>{[["01", w("確認目標客戶", "Find your customer"), w("從假設開始，用對話找證據。", "Start with a hypothesis. Find evidence in conversations."), signup], ["02", w("知道下一步", "Know your next move"), w("5 個里程碑、16 步，一次專心做一件事。", "Five milestones. Sixteen steps. One priority at a time."), signup], ["03", w("找到對的人", "Meet the right people"), w("創辦人、導師、投資人與合作夥伴。", "Founders, mentors, investors and partners."), matching], ["04", w("把交流變成行動", "Make conversations count"), w("圓桌會議的承諾，接回今日任務。", "Bring your roundtable commitments back to today's tasks."), path("/dashboard/matchmaking?tab=roundtables")]].map(([n, title, description, href]) => <Link key={n} href={href} className={s.step}><span className={s.number}>{n}</span><h2>{title}</h2><p>{description}</p><span className={s.arrow} aria-hidden="true">↗</span></Link>)}</div>
      </div>
      <div className={s.quickLinks}><a href={clips[0]?.href || "https://www.youtube.com/@GOLDENTICKET-rollon"}>GOLDEN TICKET ↗</a><Link href={path("/insights")}>{w("創辦人指南", "Founder guides")} ↗</Link><a href="#community">{w("社群與活動", "Community & events")} ↗</a><a href={MEETING_URL} target="_blank" rel="noopener noreferrer">{meetingLabel(locale)} ↗</a></div>
    </section>
    {errors.length > 0 && <div role="alert" className={s.error}>{errors.map((error, i) => <p key={i}>{error}</p>)}<a href={path("/product")}>{w("重新載入", "Reload page")}</a></div>}
    <aside className={s.pilot} aria-label={w("NOVA AI 試行社群", "NOVA AI pilot community")}><p>{w("來自 5 個國家的使用者，正在試行使用 NOVA AI。", "Users across 5 countries are piloting NOVA AI.")}</p><div><strong>5</strong><span>{w("個國家 · 試行使用者", "countries · Pilot users")}</span></div></aside>
    <section id="cases" className={s.section} aria-labelledby="evidence-heading">
      <p className={s.eyebrow}>{w("為什麼先驗證", "WHY VALIDATE FIRST")}</p>
      <div className={s.sectionHeading}><h2 id="evidence-heading">{w("願景很昂貴。", "Vision is expensive.")}<br /><span>{w("證據，不必昂貴。", "Evidence is not.")}</span></h2></div>
      <div className={`${s.three} ${s.caseStats}`}>{[
        { name: "Quibi", image: "quibi", metric: "$1.75B", label: w("先建置", "BUILD FIRST"), summary: w("募資金額；上線約六個月後宣布關閉", "Raised, then announced closure about 6 months after launch"), link: w("為什麼資金買不到需求", "Why funding can't buy demand"), source: "https://www.spglobal.com/market-intelligence/en/news-insights/research/quibis-2-billion-bet-on-mobile-video-fizzles-out" },
        { name: "Dropbox", image: "dropbox", metric: "15×", label: w("先驗證", "VALIDATE FIRST"), summary: w("一支示範影片帶來的候補名單成長", "Waitlist growth from one demo video"), link: w("一支影片如何驗證需求", "How one video proved demand"), source: "https://www.inc.com/30under30/2011/profile-drew-houston-and-arash-ferdowsi-founders-dropbox.html" },
        { name: "Zappos", image: "zappos", metric: "0", label: w("先驗證", "VALIDATE FIRST"), summary: w("第一筆成交前的庫存", "Inventory before the first sale"), link: w("先成交，再建置", "Selling before building"), source: "https://openclassrooms.com/en/courses/4544561-learn-about-lean-startup/4544568-the-lean-startup-cycle" },
      ].map(c => <article key={c.name} aria-label={c.name}><Image className={s.casePhoto} src={`/nova/cases/${c.image}.webp`} alt={w(`${c.name} 案例照片`, `${c.name} case study photo`)} width={640} height={640} sizes="(max-width:767px) 100vw, 33vw"/><p className={s.eyebrow}>{c.label} · {c.name}</p><h3 className={s.caseNumber}>{c.metric}</h3><p className={s.caseSummary}>{c.summary}</p><a className={s.caseSource} href={c.source} target="_blank" rel="noopener noreferrer">{c.link}<span aria-hidden="true">↗</span></a></article>)}</div>
    </section>
    <section id="team" className={s.section}>
      <div className={s.team}><div><p className={s.eyebrow}>{w("團隊", "THE TEAM")}</p><h2>{w("認識 NOVA AI", "The Team.")}{locale === "zh-tw" && <><br />團隊。</>}</h2></div><div>
        {[{ key: "vivian-lee", name: "Vivian Lee", role: w("創辦人暨執行長，NOVA AI 與 Roll On", "Founder & CEO, NOVA AI & Roll On"), description: team("1.description") }, { key: null, name: "Eric", role: w("共同創辦人暨技術長，NOVA AI", "Co-founder & CTO, NOVA AI"), description: "" }, { key: "vincent", name: team("2.name"), role: team("2.role"), description: team("2.description") }, { key: "iris", name: team("3.name"), role: team("3.role"), description: team("3.description") }].map(person => <article key={person.name}>{person.key && <Image src={image(`/rollon-v10/${person.key}.jpg`)} alt={person.name} width={100} height={100}/>}<div className={person.key ? undefined : s.teamWithoutPhoto}><h3>{person.name}</h3><p>{person.role}</p></div><p>{person.description}</p></article>)}<Link className={s.outlineButton} href={path("/about")}>{w("認識團隊", "Meet the team")} ↗</Link></div></div>
    </section>
    <section className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>{w("商機媒合", "MATCHMAKING")}</p><h2>{w("讓對的人，找到你。", "Let the right people find you.")}</h2></div><Link className={s.outlineButton} href={matching}>{w("探索商機媒合", "Explore matchmaking")} ↗</Link></div><div className={s.roles}>{[[w("創辦人", "Founders"), w("交換經驗與客戶洞察", "Share experience and customer insight")], [w("認證導師", "Certified mentors"), w("一起討論眼前最重要的問題", "Work through the question that matters now")], [w("投資人", "Investors"), w("以可核對成果開始認識", "Start with evidence you can verify")], [w("合作夥伴", "Partners"), w("找到需求互補的合作機會", "Find complementary needs")], [w("買家", "Buyers"), w("從真實需求開始對話", "Start a conversation around real needs")]].map(([role, copy], i) => <Link href={matching} key={role}><span className={s.roleMark} aria-hidden="true">{["↗", "✳", "↔", "＋", "→"][i]}</span><h3>{role}</h3><p>{copy}</p><span>{w("登入探索", "Log in to explore")} ↗</span></Link>)}</div></section>
    <div className={s.pricing}>{pricing}</div>
    <section id="community" className={s.section}><div className={s.sectionHeading}><div><p className={s.eyebrow}>{w("創辦人社群", "FOUNDER COMMUNITY")}</p><h2>{w("來自社群的最新動態。", "Live from the community.")}</h2></div><a className={s.outlineButton} href={safeLink(info.linkedin) || "https://www.linkedin.com/company/rollon/"} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div>
      <div className={s.three}><article className={s.communityCard}><p className={s.eyebrow}>{w("圓桌會議", "ROUNDTABLE")}</p><time dateTime="2026-11-16">{w("2026 年 11 月 16 日", "NOV 16 · 2026")}</time><h3>{w("把想法帶進對話。", "Bring your idea to the table.")}</h3><p>{w("與 Taiwan Startup Hub、方舟計劃（Ark Project）合辦。", "Co-hosted with Taiwan Startup Hub and Ark Project.")}</p><p>{w("時間、地點與參加方式將另行公布。", "Time, location and participation details will be announced.")}</p></article>{[1,2].map(n => <article className={s.comingSoon} key={n}><NovaLogo variant="black" className="h-auto w-40"/><p className={s.eyebrow}>NOVA AI · {w("社群動態", "COMMUNITY")}</p><h3>{w("即將推出", "Coming soon")}</h3></article>)}</div>
      <h3 className={s.galleryHeading}>{w("NOVA AI 幕後", "Inside NOVA AI")}</h3><div className={s.insidePending}><NovaLogo variant="black" className="h-auto w-36"/><p>{w("現場分享、創辦人交流與 NOVA AI 的幕後故事。更多內容即將公開。", "On stage, in conversation and behind the scenes at NOVA AI. More stories coming soon.")}</p></div>
    </section>
    <section className={s.closing}><div><p className={s.eyebrow}>{w("敢於行動，先驗證。", "BE THE BOLD ONES")}</p><h2>{w("下一個決定，", "The bold ones")}<br />{w("讓證據帶路。", "validate first.")}</h2><p>{w("從你的階段、目標客戶與下一個優先行動開始。", "Start with your stage, your target customer and your next priority.")}</p></div><div><ul>{[w("釐清目前階段", "Review your current stage"), w("檢視目標客戶假設", "Pressure-test your target customer"), w("帶走一個清楚的下一步", "Leave with one clear next step")].map(item => <li key={item}>{item}</li>)}</ul><div className={s.actions}><a className={s.lightButton} href={MEETING_URL} target="_blank" rel="noopener noreferrer">{meetingLabel(locale)} ↗</a><Link className={s.outlineLight} href={signup}>{w("免費開始", "Start free trial")} ↗</Link></div></div></section>
    <Newsletter />
  </div>;
}
