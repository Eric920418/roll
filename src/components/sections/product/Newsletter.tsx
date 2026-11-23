"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import s from "./landing.module.css";

export default function Newsletter({ embedded = false }: { embedded?: boolean }) {
  const zh = useLocale() === "zh-tw";
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return <section className={embedded ? s.newsletter : s.newsletterStandalone} aria-labelledby="newsletter-heading">
    <h2 id="newsletter-heading">{zh ? "每週，為下一個決定多一份證據。" : "More evidence for your next decision, every week."}</h2>
    <p>{zh ? "訂閱 NOVA 創辦人指南，每週一封，隨時可退訂。" : "Subscribe to NOVA founder guides. One email each week. Unsubscribe anytime."}</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const company = String(new FormData(event.currentTarget).get("company") || "");
      setBusy(true);
      setError("");
      try {
        await memberFetch("/api/newsletter", { method: "POST", body: JSON.stringify({
          email: email.trim(), consent, locale: zh ? "zh-tw" : "en",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, company,
        }) });
        setDone(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    }}>
      <label htmlFor="nova-newsletter-email">{zh ? "Email 地址" : "Email address"}</label>
      <div className={s.newsletterInput}>
        <input id="nova-newsletter-email" type="email" autoComplete="email" maxLength={254} required disabled={busy}
          value={email} onChange={event => { setEmail(event.target.value); setDone(false); }} />
        <button type="submit" disabled={!consent || busy}>{busy ? (zh ? "處理中…" : "Sending…") : (zh ? "訂閱" : "Subscribe")}</button>
      </div>
      <div className="hidden" aria-hidden="true"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
      <label className={s.newsletterConsent}><input type="checkbox" checked={consent} required disabled={busy}
        onChange={event => setConsent(event.target.checked)} />
        <span>{zh ? "我同意收到確認信，確認 Email 後訂閱每週電子報。" : "I agree to a confirmation email and, after verifying my email, weekly newsletters."}</span>
      </label>
    </form>
    {done && <p role="status">{zh ? "若此信箱需要確認，確認信已排入寄送。請開啟信件確認；已訂閱者不會重複加入。" : "If verification is needed, a confirmation email is queued. Open it to confirm. Existing subscriptions are not duplicated."}</p>}
    {error && <p role="alert" className="whitespace-pre-wrap break-words text-red-200">{error}</p>}
  </section>;
}
export function NewsletterAction({ action, token }: {
    action: 'confirm' | 'unsubscribe';
    token: string;
}) { const zh = useLocale() === 'zh-tw', [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState(''); return <main className="mx-auto max-w-xl space-y-5 px-6 py-16"><p>NOVA AI</p><h1 className="text-3xl font-bold">{action === 'confirm' ? (zh ? '確認訂閱創辦人電子報' : 'Confirm your founder newsletter subscription') : (zh ? '退訂創辦人電子報' : 'Unsubscribe from the founder newsletter')}</h1>{done ? <p role="status">{zh ? '已完成，你的會員方案與其他通知不受影響。' : 'Done. Your plan and other notifications are unchanged.'}</p> : <button type="button" className="min-h-11 rounded-lg bg-black px-5 py-3 text-white disabled:opacity-50" disabled={busy} onClick={() => { setBusy(true); void memberFetch('/api/newsletter/' + action, { method: 'POST', body: JSON.stringify({ token }) }).then(() => setDone(true)).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>{zh ? '確認' : 'Confirm'}</button>}{error && <p role="alert" className="whitespace-pre-wrap text-red-800">{error}</p>}</main>; }
