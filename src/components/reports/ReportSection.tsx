"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import CountrySelect from "@/components/ui/CountrySelect";
import { INDUSTRY_LABELS } from "@/lib/member-options";
import { readAdminResponse } from "@/lib/cms/admin-response";
import { REPORT_ID, reportFile } from "@/lib/reports/catalog";
import s from "./report.module.css";

type Receipt = { received: boolean; delivery: string; deliveryError?: string | null; newsletterStatus: string; newsletterError?: string | null };
export default function ReportSection({ locale, standalone = false }: { locale: Locale; standalone?: boolean }) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const [country, setCountry] = useState(""), [language, setLanguage] = useState<Locale>(locale), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState<Receipt | null>(null);
  const attempt = useRef<{ key: string; id: string } | null>(null), sending = useRef(false);
  const Heading = standalone ? "h1" : "h2";
  async function subscribe() {
    if (!attempt.current || sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try { const response = await fetch("/api/reports/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(attempt.current.key), requestId: attempt.current.id }) }); const saved = await readAdminResponse(response) as Receipt; setReceipt(saved); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section id="report" className={s.section} aria-labelledby="report-title"><div className={s.layout}>
    <div className={s.cover}><Image src="/reports/taiwan-market-entry-q4-2026-cover.jpg" alt={w("台灣市場進入報告 2026 第四季封面", "Taiwan Market Entry Report Q4 2026 cover")} width={742} height={1050} sizes="(max-width:767px) 70vw, 34vw" /></div>
    <div className={s.content}><p className={s.eyebrow}>FREE REPORT · Q4 2026</p><Heading id="report-title">{w("外國企業在台灣的致勝機會", "Where foreign companies can win in Taiwan")}</Heading><p className={s.intro}>{w("進入台灣市場前，你需要知道的數據、產業與買家洞察。共 10 頁，提供英文與繁體中文版。", "The numbers, industries and buyer insights you need before entering Taiwan. 10 pages, in English or Traditional Chinese.")}</p>
    <dl className={s.stats}>{[["11.05%", w("2026 年 GDP 成長率預測", "GDP growth forecast, 2026")], ["US$19.2B", w("2026 年 1–9 月核准僑外投資", "Approved foreign investment, Jan–Sep 2026")], ["1.03M+", w("在台外國居民，歷年新高", "Foreign residents, a record")]].map(([value,label]) => <div key={value}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className={s.date}>{w("依提供報告，資料截至 2026 年 11 月 7 日。", "Source: the supplied report, dated 7 November 2026.")}</p>
    {receipt ? <div className={s.form} role="status"><h3>{w("報告申請已收到", "Your report request is received")}</h3><p>{receipt.delivery === "failed" ? w("寄送未能完成，補寄已停止。你仍可使用下方連結取得報告，或聯絡 Roll On。", "Email delivery could not be completed and retries have stopped. Download your report below or contact Roll On.") : receipt.delivery === "accepted" ? w("寄信服務已接受報告信；實際送達仍依郵件服務，請留意收件匣與垃圾郵件。", "The email service accepted your report email. Delivery depends on your mail provider; check your inbox and spam folder.") : w("報告已排入寄送；若服務暫時失敗，系統會自動重試。", "Your report is queued. Temporary delivery failures are retried automatically.")}</p>{receipt.deliveryError && <p role="alert">{receipt.deliveryError}</p>}<a className={s.download} href={reportFile(language)} target="_blank" rel="noopener noreferrer">{w("直接下載所選 PDF", "Download your selected PDF")} ↗</a>{receipt.newsletterStatus === "active" && <p>{w("你已訂閱電子報，既有訂閱設定保留。", "You already subscribe to the newsletter; your existing settings are retained.")}</p>}{receipt.newsletterStatus === "queued" && <p>{w("電子報需另外開啟確認信並按確認，才會開始訂閱。", "Newsletter delivery starts only after you open and confirm the separate confirmation email.")}</p>}{receipt.newsletterStatus === "failed" && <div><p role="alert">{receipt.newsletterError}</p><button type="button" disabled={busy} onClick={() => void subscribe()}>{w("只重試電子報訂閱", "Retry newsletter subscription only")}</button></div>}</div> : <form className={s.form} onSubmit={async event => {
      event.preventDefault(); if (sending.current) return;
      const form = new FormData(event.currentTarget); let timeZone = "Asia/Taipei"; try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone; } catch { /* Fall back when the browser cannot resolve its time zone. */ }
      const data = { reportId: REPORT_ID, name: String(form.get("name") || "").trim(), email: String(form.get("email") || "").trim(), company: String(form.get("company") || "").trim(), country, industry: String(form.get("industry") || ""), reportLanguage: language, locale, subscribe: form.get("subscribe") === "on", timeZone, website: String(form.get("website") || "") };
      const key = JSON.stringify(data); if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
      sending.current = true; setBusy(true); setError("");
      try { const response = await fetch("/api/reports/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, requestId: attempt.current.id }) }); const saved = await readAdminResponse(response) as Receipt; if (saved.received !== true) throw new Error(w("未收到有效申請回應，請重試", "Invalid request response; retry")); setReceipt(saved); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { sending.current = false; setBusy(false); }
    }}><fieldset disabled={busy} className={s.fields}>
      <label>{w("姓名 *", "Full name *")}<input name="name" required autoComplete="name" maxLength={200} /></label>
      <label>{w("Email *", "Work email *")}<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
      <label>{w("公司 *", "Company *")}<input name="company" required autoComplete="organization" maxLength={200} /></label>
      <CountrySelect value={country} onChange={setCountry} locale={locale} label={w("國家 *", "Country *")} disabled={busy} />
      <label>{w("產業（選填）", "Industry (optional)")}<select name="industry" defaultValue=""><option value="">{w("選擇產業", "Select industry")}</option>{Object.entries(INDUSTRY_LABELS).map(([code, names]) => <option key={code} value={code}>{names[zh ? 1 : 0]}</option>)}</select></label>
      <fieldset className={s.languages}><legend>{w("報告語言 *", "Report language *")}</legend>{(["en", "zh-tw"] as const).map(value => <label key={value}><input type="radio" name="reportLanguage" checked={language === value} onChange={() => setLanguage(value)} />{value === "en" ? "English" : "繁體中文"}</label>)}</fieldset>
      <div className={s.trap} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className={s.optin}><input type="checkbox" name="subscribe" />{w("另外訂閱 NOVA 每週創辦人電子報（選填，需 Email 確認，可隨時退訂）", "Also subscribe to NOVA's weekly founder newsletter (optional; email confirmation required; unsubscribe any time)")}</label>
      <div className={s.actions}><p>{w("我們會將所選 PDF 寄給你，申請資訊由 Roll On 團隊處理。不勾選訂閱，也能取得報告。", "We'll email your selected PDF. The Roll On team processes your request. Newsletter subscription is optional.")}</p><button type="submit">{busy ? w("送出中…", "Sending…") : w("寄給我報告", "Send me the report")}</button></div>
    </fieldset></form>}
    {error && <p role="alert" className={s.error}>{error}</p>}</div>
  </div></section>;
}
