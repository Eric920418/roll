"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { upload } from "@vercel/blob/client";
import type { Locale } from "@/i18n/routing";

type Portal = {
  id: string;
  shareProfile: boolean;
  shareStrategy: boolean;
  shareActionPlan: boolean;
  shareKpis: boolean;
  shareMilestones: boolean;
  shareUpdates: boolean;
  shareBusinessPlan: boolean;
  businessPlanAvailable: boolean;
  businessPlanFilename: string | null;
  businessPlanSize: number | null;
  kpis: Array<{ id: string; label: string; value: string; period: string | null }>;
  milestones: Array<{ id: string; title: string; status: string; targetDate: string | null; notes: string | null }>;
  updates: Array<{ id: string; title: string; body: string; publishedAt: string }>;
  invitations: Array<{ id: string; invitedEmail: string; status: string; expiresAt: string; lastSentAt: string | null }>;
};

const shares = ["shareProfile", "shareStrategy", "shareActionPlan", "shareKpis", "shareMilestones", "shareUpdates", "shareBusinessPlan"] as const;

export default function InvestorPortalManager({ locale, initialPortal }: { locale: Locale; initialPortal: Portal }) {
  const t = useTranslations("InvestorPortal");
  const [portal, setPortal] = useState(initialPortal);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newKpi, setNewKpi] = useState({ label: "", value: "", period: "" });
  const [newMilestone, setNewMilestone] = useState({ title: "", status: "planned", targetDate: "", notes: "" });
  const [newUpdate, setNewUpdate] = useState({ title: "", body: "" });

  async function jsonRequest(url: string, init?: RequestInit) {
    setError("");
    const res = await fetch(url, init);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error");
    return json.data;
  }

  async function refresh() {
    setPortal(await jsonRequest("/api/investor-portal"));
  }

  async function saveSettings() {
    setBusy("settings");
    try {
      const data = Object.fromEntries(shares.map((key) => [key, portal[key]]));
      setPortal(await jsonRequest("/api/investor-portal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function create(kind: "kpi" | "milestone" | "update", data: object) {
    setBusy(`create-${kind}`);
    try {
      await jsonRequest("/api/investor-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, data }),
      });
      if (kind === "kpi") setNewKpi({ label: "", value: "", period: "" });
      if (kind === "milestone") setNewMilestone({ title: "", status: "planned", targetDate: "", notes: "" });
      if (kind === "update") setNewUpdate({ title: "", body: "" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function saveItem(kind: string, id: string, data: object) {
    setBusy(id);
    try {
      await jsonRequest(`/api/investor-portal/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error");
    } finally {
      setBusy("");
    }
  }

  async function remove(kind: string, id: string) {
    setBusy(id);
    try {
      await jsonRequest(`/api/investor-portal/${kind}/${id}`, { method: "DELETE" });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error");
    } finally {
      setBusy("");
    }
  }

  const inputClass = "min-h-11 rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm text-dark";
  const buttonClass = "min-h-11 rounded-xl bg-dark px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("title")}</h1>
      <p className="mt-2 text-sm text-dark/60">{t("subtitle")}</p>
      {error && <p role="alert" className="mt-5 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      <section className="mt-7 rounded-2xl border border-dark/10 bg-white p-6">
        <h2 className="text-xl font-bold text-dark">{t("sharingTitle")}</h2>
        <p className="mt-1 text-sm text-dark/55">{t("sharingBody")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {shares.map((key) => (
            <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-dark/10 px-4 py-3 text-sm font-semibold">
              <input type="checkbox" checked={portal[key]} onChange={(event) => setPortal({ ...portal, [key]: event.target.checked })} />
              {t(`shares.${key}`)}
            </label>
          ))}
        </div>
        <button type="button" onClick={saveSettings} disabled={busy !== ""} className={`${buttonClass} mt-5`}>{busy === "settings" ? t("saving") : t("saveSharing")}</button>
      </section>

      <section className="mt-6 rounded-2xl border border-dark/10 bg-white p-6">
        <h2 className="text-xl font-bold text-dark">{t("businessPlan")}</h2>
        {portal.businessPlanAvailable && <p className="mt-2 text-sm text-dark/60">{portal.businessPlanFilename} · {Math.ceil((portal.businessPlanSize ?? 0) / 1024)} KB</p>}
        <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={async (event) => {
          event.preventDefault();
          setBusy("pdf");
          try {
            const formElement = event.currentTarget;
            const file = new FormData(formElement).get("file");
            if (!(file instanceof File)) throw new Error(t("selectPdf"));
            const header = await file.slice(0, 5).text();
            if (file.size <= 0 || file.size > 10 * 1024 * 1024 || file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf") || header !== "%PDF-") {
              throw new Error(t("invalidPdf"));
            }
            const blob = await upload(`investor-business-plans/${portal.id}/${crypto.randomUUID()}.pdf`, file, {
              access: "private",
              handleUploadUrl: "/api/investor-portal/business-plan/upload",
            });
            await jsonRequest("/api/investor-portal/business-plan", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pathname: blob.pathname, filename: file.name }),
            });
            formElement.reset();
            await refresh();
          } catch (cause) { setError(cause instanceof Error ? cause.message : "Error"); } finally { setBusy(""); }
        }}>
          <input name="file" type="file" accept="application/pdf,.pdf" required className="min-h-11 max-w-full text-sm" />
          <button disabled={busy !== ""} className={buttonClass}>{busy === "pdf" ? t("uploading") : t("uploadPdf")}</button>
          {portal.businessPlanAvailable && <>
            <a href="/api/investor-portal/business-plan" target="_blank" className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 px-4 text-sm font-bold">{t("viewPdf")}</a>
            <button type="button" onClick={async () => { setBusy("delete-pdf"); try { await jsonRequest("/api/investor-portal/business-plan", { method: "DELETE" }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Error"); } finally { setBusy(""); } }} className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600">{t("delete")}</button>
          </>}
        </form>
        <p className="mt-2 text-xs text-dark/45">{t("pdfHint")}</p>
      </section>

      <PortalItems title={t("kpis")}>
        <form className="grid gap-3 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void create("kpi", newKpi); }}>
          <input aria-label={t("label")} required value={newKpi.label} onChange={(e) => setNewKpi({ ...newKpi, label: e.target.value })} placeholder={t("label")} className={inputClass} />
          <input aria-label={t("value")} required value={newKpi.value} onChange={(e) => setNewKpi({ ...newKpi, value: e.target.value })} placeholder={t("value")} className={inputClass} />
          <input aria-label={t("period")} value={newKpi.period} onChange={(e) => setNewKpi({ ...newKpi, period: e.target.value })} placeholder={t("period")} className={inputClass} />
          <button disabled={busy !== ""} className={buttonClass}>{t("add")}</button>
        </form>
        {portal.kpis.map((item, index) => <div key={item.id} className="mt-3 grid gap-3 rounded-xl bg-dark/[0.03] p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <input aria-label={t("label")} value={item.label} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, label: e.target.value } : row) })} className={inputClass} />
          <input aria-label={t("value")} value={item.value} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, value: e.target.value } : row) })} className={inputClass} />
          <input aria-label={t("period")} value={item.period ?? ""} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, period: e.target.value } : row) })} className={inputClass} />
          <button onClick={() => saveItem("kpi", item.id, item)} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
          <button onClick={() => remove("kpi", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
        </div>)}
      </PortalItems>

      <PortalItems title={t("milestones")}>
        <form className="grid gap-3 sm:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void create("milestone", { ...newMilestone, targetDate: newMilestone.targetDate ? new Date(`${newMilestone.targetDate}T00:00:00Z`).toISOString() : null }); }}>
          <input aria-label={t("titleField")} required value={newMilestone.title} onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })} placeholder={t("titleField")} className={inputClass} />
          <select aria-label={t("status")} value={newMilestone.status} onChange={(e) => setNewMilestone({ ...newMilestone, status: e.target.value })} className={inputClass}><option value="planned">{t("planned")}</option><option value="in_progress">{t("inProgress")}</option><option value="done">{t("done")}</option></select>
          <input aria-label={t("targetDate")} type="date" value={newMilestone.targetDate} onChange={(e) => setNewMilestone({ ...newMilestone, targetDate: e.target.value })} className={inputClass} />
          <input aria-label={t("notes")} value={newMilestone.notes} onChange={(e) => setNewMilestone({ ...newMilestone, notes: e.target.value })} placeholder={t("notes")} className={inputClass} />
          <button disabled={busy !== ""} className={buttonClass}>{t("add")}</button>
        </form>
        {portal.milestones.map((item, index) => <div key={item.id} className="mt-3 grid gap-3 rounded-xl bg-dark/[0.03] p-3 sm:grid-cols-[1fr_10rem_10rem_1fr_auto_auto]">
          <input aria-label={t("titleField")} value={item.title} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, title: e.target.value } : row) })} className={inputClass} />
          <select aria-label={t("status")} value={item.status} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, status: e.target.value } : row) })} className={inputClass}><option value="planned">{t("planned")}</option><option value="in_progress">{t("inProgress")}</option><option value="done">{t("done")}</option></select>
          <input aria-label={t("targetDate")} type="date" value={item.targetDate?.slice(0, 10) ?? ""} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, targetDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null } : row) })} className={inputClass} />
          <input aria-label={t("notes")} value={item.notes ?? ""} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, notes: e.target.value } : row) })} className={inputClass} />
          <button onClick={() => saveItem("milestone", item.id, item)} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
          <button onClick={() => remove("milestone", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
        </div>)}
      </PortalItems>

      <PortalItems title={t("updates")}>
        <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(event) => { event.preventDefault(); void create("update", newUpdate); }}>
          <input aria-label={t("titleField")} required value={newUpdate.title} onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })} placeholder={t("titleField")} className={inputClass} />
          <textarea aria-label={t("content")} required value={newUpdate.body} onChange={(e) => setNewUpdate({ ...newUpdate, body: e.target.value })} placeholder={t("content")} className={`${inputClass} min-h-24`} />
          <button disabled={busy !== ""} className={buttonClass}>{t("publish")}</button>
        </form>
        {portal.updates.map((item, index) => <div key={item.id} className="mt-3 grid gap-3 rounded-xl bg-dark/[0.03] p-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <input aria-label={t("titleField")} value={item.title} onChange={(e) => setPortal({ ...portal, updates: portal.updates.map((row, i) => i === index ? { ...row, title: e.target.value } : row) })} className={inputClass} />
          <textarea aria-label={t("content")} value={item.body} onChange={(e) => setPortal({ ...portal, updates: portal.updates.map((row, i) => i === index ? { ...row, body: e.target.value } : row) })} className={`${inputClass} min-h-24`} />
          <button onClick={() => saveItem("update", item.id, { title: item.title, body: item.body })} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
          <button onClick={() => remove("update", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
        </div>)}
      </PortalItems>

      <PortalItems title={t("invitations")}>
        <form className="flex flex-wrap gap-3" onSubmit={async (event) => { event.preventDefault(); setBusy("invite"); try { await jsonRequest("/api/investor-portal/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, locale }) }); setInviteEmail(""); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Error"); } finally { setBusy(""); } }}>
          <input type="email" required aria-label={t("email")} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={t("email")} className={`${inputClass} min-w-64 flex-1`} />
          <button disabled={busy !== ""} className={buttonClass}>{busy === "invite" ? t("sending") : t("sendInvite")}</button>
        </form>
        <div className="mt-4 space-y-2">{portal.invitations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-dark/[0.03] p-3 text-sm"><span>{item.invitedEmail} · {t(`inviteStatus.${item.status}`)}</span><div className="flex gap-2">{item.status === "pending" && <button onClick={() => { setInviteEmail(item.invitedEmail); }} className="min-h-11 px-3 font-bold text-primary">{t("prepareResend")}</button>}<button onClick={async () => { setBusy(item.id); try { await jsonRequest(`/api/investor-portal/invitations/${item.id}`, { method: "DELETE" }); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Error"); } finally { setBusy(""); } }} disabled={busy !== "" || item.status === "revoked"} className="min-h-11 px-3 font-bold text-red-600 disabled:opacity-40">{t("revoke")}</button></div></div>)}</div>
      </PortalItems>
    </div>
  );
}

function PortalItems({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6 rounded-2xl border border-dark/10 bg-white p-6"><h2 className="mb-4 text-xl font-bold text-dark">{title}</h2>{children}</section>;
}
