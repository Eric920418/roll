"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { pathForLocale } from "@/lib/routes";
import {
  HIDEABLE_FIELD_GROUPS,
  toHideableFields,
  type InvestorHideableField,
} from "@/lib/investor/fields";
import type { Locale } from "@/i18n/routing";

type KpiPoint = { id: string; period: string; value: number; order: number };

type Kpi = {
  id: string;
  label: string;
  value: string;
  period: string | null;
  unit: string | null;
  hidden: boolean;
  points: KpiPoint[];
};

type Portal = {
  id: string;
  shareProfile: boolean;
  shareStrategy: boolean;
  shareActionPlan: boolean;
  shareKpis: boolean;
  shareMilestones: boolean;
  shareUpdates: boolean;
  shareBusinessPlan: boolean;
  hiddenFields: string[];
  businessPlanAvailable: boolean;
  businessPlanFilename: string | null;
  businessPlanSize: number | null;
  kpis: Kpi[];
  milestones: Array<{ id: string; title: string; status: string; targetDate: string | null; notes: string | null; hidden: boolean }>;
  updates: Array<{ id: string; title: string; body: string; publishedAt: string; hidden: boolean }>;
  invitations: Array<{ id: string; invitedEmail: string; status: string; expiresAt: string; lastSentAt: string | null }>;
};

const shares = ["shareProfile", "shareStrategy", "shareActionPlan", "shareKpis", "shareMilestones", "shareUpdates", "shareBusinessPlan"] as const;

export default function InvestorPortalManager({
  locale,
  initialPortal,
  canHideFields,
}: {
  locale: Locale;
  initialPortal: Portal;
  /** Enterprise 才能「修改」隱藏設定；已存在的隱藏對所有方案持續生效。 */
  canHideFields: boolean;
}) {
  const t = useTranslations("InvestorPortal");
  const [portal, setPortal] = useState(initialPortal);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newKpi, setNewKpi] = useState({ label: "", value: "", period: "", unit: "" });
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

  function report(cause: unknown) {
    setError(cause instanceof Error ? cause.message : "Error");
  }

  async function saveSettings() {
    setBusy("settings");
    try {
      const data: Record<string, unknown> = Object.fromEntries(shares.map((key) => [key, portal[key]]));
      // 非 Enterprise 一律不送 hiddenFields —— 送了會被 API 以 403 擋下，
      // 連帶讓 Business 用戶連 section 開關都存不了。不送＝伺服器端原值不動。
      if (canHideFields) data.hiddenFields = portal.hiddenFields;
      setPortal(await jsonRequest("/api/investor-portal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }));
    } catch (cause) {
      report(cause);
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
      if (kind === "kpi") setNewKpi({ label: "", value: "", period: "", unit: "" });
      if (kind === "milestone") setNewMilestone({ title: "", status: "planned", targetDate: "", notes: "" });
      if (kind === "update") setNewUpdate({ title: "", body: "" });
      await refresh();
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  }

  // payload 逐欄位明確組出來，不要 spread 整個 item：
  // 多送一個 hidden 會讓非 Enterprise 的一般編輯被權限檢查擋下（403）。
  async function saveItem(kind: string, id: string, data: object) {
    setBusy(id);
    try {
      await jsonRequest(`/api/investor-portal/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  }

  /**
   * 單筆隱藏：只送 hidden 一個欄位，成功後只改這一筆的本地狀態。
   *
   * 刻意不呼叫 refresh() —— 那會用伺服器資料蓋掉整個 portal，
   * 把使用者在其他列尚未存檔的編輯默默清掉。
   */
  async function toggleItemHidden(kind: "kpi" | "milestone" | "update", id: string, hidden: boolean) {
    setBusy(id);
    try {
      await jsonRequest(`/api/investor-portal/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const mark = <Item extends { id: string; hidden: boolean }>(rows: Item[]) =>
        rows.map((row) => (row.id === id ? { ...row, hidden } : row));
      setPortal((current) => ({
        ...current,
        kpis: kind === "kpi" ? mark(current.kpis) : current.kpis,
        milestones: kind === "milestone" ? mark(current.milestones) : current.milestones,
        updates: kind === "update" ? mark(current.updates) : current.updates,
      }));
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  }

  /** KPI 數值點異動同樣只改該筆，理由同上。 */
  function patchKpiPoints(kpiId: string, next: (points: KpiPoint[]) => KpiPoint[]) {
    setPortal((current) => ({
      ...current,
      kpis: current.kpis.map((row) => (row.id === kpiId ? { ...row, points: next(row.points) } : row)),
    }));
  }

  async function remove(kind: string, id: string) {
    setBusy(id);
    try {
      await jsonRequest(`/api/investor-portal/${kind}/${id}`, { method: "DELETE" });
      await refresh();
    } catch (cause) {
      report(cause);
    } finally {
      setBusy("");
    }
  }

  function toggleField(key: InvestorHideableField, hide: boolean) {
    setPortal({
      ...portal,
      hiddenFields: hide
        ? [...new Set([...portal.hiddenFields, key])]
        : portal.hiddenFields.filter((item) => item !== key),
    });
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

        {/* 進階：逐欄位隱藏（Enterprise 可編輯，其餘方案唯讀） */}
        <div className="mt-6 border-t border-dark/[0.08] pt-5">
          <h3 className="text-sm font-bold text-dark">{t("fieldVisibilityTitle")}</h3>
          <p className="mt-1 text-sm text-dark/55">
            {canHideFields ? t("fieldVisibilityBody") : t("fieldVisibilityLocked")}
          </p>

          {!canHideFields && (
            <Link
              href={pathForLocale("/dashboard/billing", locale)}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-dark/15 px-4 text-sm font-bold text-dark"
            >
              {t("fieldVisibilityLockedCta")}
            </Link>
          )}

          {!canHideFields && portal.hiddenFields.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">{t("fieldVisibilityActive")}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {/* 過白名單：DB 可能留著舊版本寫入、本版已移除的 key，
                    直接丟給 t() 會找不到翻譯而讓整頁報錯。 */}
                {toHideableFields(portal.hiddenFields).map((key) => (
                  <li key={key} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    {t(`fields.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canHideFields && (
            <div className="mt-4 space-y-4">
              {HIDEABLE_FIELD_GROUPS.map((group) => {
                const sectionOn = portal[group.shareKey as (typeof shares)[number]];
                return (
                  <fieldset key={group.shareKey} disabled={!sectionOn} className="disabled:opacity-45">
                    <legend className="text-xs font-bold uppercase tracking-[0.14em] text-dark/45">
                      {t(`shares.${group.shareKey}`)}
                      {!sectionOn && ` · ${t("sectionOff")}`}
                    </legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {group.fields.map((key) => (
                        <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-dark/10 px-4 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={portal.hiddenFields.includes(key)}
                            onChange={(event) => toggleField(key, event.target.checked)}
                          />
                          {t(`fields.${key}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
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
          } catch (cause) { report(cause); } finally { setBusy(""); }
        }}>
          <input name="file" type="file" accept="application/pdf,.pdf" required className="min-h-11 max-w-full text-sm" />
          <button disabled={busy !== ""} className={buttonClass}>{busy === "pdf" ? t("uploading") : t("uploadPdf")}</button>
          {portal.businessPlanAvailable && <>
            <a href="/api/investor-portal/business-plan" target="_blank" className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 px-4 text-sm font-bold">{t("viewPdf")}</a>
            <button type="button" onClick={async () => { setBusy("delete-pdf"); try { await jsonRequest("/api/investor-portal/business-plan", { method: "DELETE" }); await refresh(); } catch (cause) { report(cause); } finally { setBusy(""); } }} className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600">{t("delete")}</button>
          </>}
        </form>
        <p className="mt-2 text-xs text-dark/45">{t("pdfHint")}</p>
      </section>

      <PortalItems title={t("kpis")}>
        <form className="grid gap-3 sm:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void create("kpi", { ...newKpi, unit: newKpi.unit || null }); }}>
          <input aria-label={t("label")} required value={newKpi.label} onChange={(e) => setNewKpi({ ...newKpi, label: e.target.value })} placeholder={t("label")} className={inputClass} />
          <input aria-label={t("value")} required value={newKpi.value} onChange={(e) => setNewKpi({ ...newKpi, value: e.target.value })} placeholder={t("value")} className={inputClass} />
          <input aria-label={t("period")} value={newKpi.period} onChange={(e) => setNewKpi({ ...newKpi, period: e.target.value })} placeholder={t("period")} className={inputClass} />
          <input aria-label={t("unit")} value={newKpi.unit} onChange={(e) => setNewKpi({ ...newKpi, unit: e.target.value })} placeholder={t("unitPlaceholder")} className={inputClass} />
          <button disabled={busy !== ""} className={buttonClass}>{t("add")}</button>
        </form>
        {portal.kpis.map((item, index) => (
          <div key={item.id} className="mt-3 rounded-xl bg-dark/[0.03] p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
              <input aria-label={t("label")} value={item.label} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, label: e.target.value } : row) })} className={inputClass} />
              <input aria-label={t("value")} value={item.value} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, value: e.target.value } : row) })} className={inputClass} />
              <input aria-label={t("period")} value={item.period ?? ""} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, period: e.target.value } : row) })} className={inputClass} />
              <input aria-label={t("unit")} value={item.unit ?? ""} placeholder={t("unitPlaceholder")} onChange={(e) => setPortal({ ...portal, kpis: portal.kpis.map((row, i) => i === index ? { ...row, unit: e.target.value } : row) })} className={inputClass} />
              <button onClick={() => saveItem("kpi", item.id, { label: item.label, value: item.value, period: item.period, unit: item.unit || null })} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
              <button onClick={() => remove("kpi", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
            </div>
            <HideToggle
              t={t}
              hidden={item.hidden}
              disabled={!canHideFields || busy !== ""}
              canHideFields={canHideFields}
              onChange={(next) => void toggleItemHidden("kpi", item.id, next)}
            />
            <KpiPointsEditor
              t={t}
              kpi={item}
              busy={busy}
              inputClass={inputClass}
              buttonClass={buttonClass}
              onError={report}
              onBusy={setBusy}
              onAdded={(point) =>
                patchKpiPoints(item.id, (points) =>
                  // 與伺服器的 orderBy([order, period]) 對齊，新增後順序不會跳動
                  [...points, point].sort(
                    (a, b) => a.order - b.order || a.period.localeCompare(b.period),
                  ),
                )
              }
              onRemoved={(pointId) =>
                patchKpiPoints(item.id, (points) => points.filter((point) => point.id !== pointId))
              }
            />
          </div>
        ))}
      </PortalItems>

      <PortalItems title={t("milestones")}>
        <form className="grid gap-3 sm:grid-cols-5" onSubmit={(event) => { event.preventDefault(); void create("milestone", { ...newMilestone, targetDate: newMilestone.targetDate ? new Date(`${newMilestone.targetDate}T00:00:00Z`).toISOString() : null }); }}>
          <input aria-label={t("titleField")} required value={newMilestone.title} onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })} placeholder={t("titleField")} className={inputClass} />
          <select aria-label={t("status")} value={newMilestone.status} onChange={(e) => setNewMilestone({ ...newMilestone, status: e.target.value })} className={inputClass}><option value="planned">{t("planned")}</option><option value="in_progress">{t("inProgress")}</option><option value="done">{t("done")}</option></select>
          <input aria-label={t("targetDate")} type="date" value={newMilestone.targetDate} onChange={(e) => setNewMilestone({ ...newMilestone, targetDate: e.target.value })} className={inputClass} />
          <input aria-label={t("notes")} value={newMilestone.notes} onChange={(e) => setNewMilestone({ ...newMilestone, notes: e.target.value })} placeholder={t("notes")} className={inputClass} />
          <button disabled={busy !== ""} className={buttonClass}>{t("add")}</button>
        </form>
        {portal.milestones.map((item, index) => (
          <div key={item.id} className="mt-3 rounded-xl bg-dark/[0.03] p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_1fr_auto_auto]">
              <input aria-label={t("titleField")} value={item.title} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, title: e.target.value } : row) })} className={inputClass} />
              <select aria-label={t("status")} value={item.status} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, status: e.target.value } : row) })} className={inputClass}><option value="planned">{t("planned")}</option><option value="in_progress">{t("inProgress")}</option><option value="done">{t("done")}</option></select>
              <input aria-label={t("targetDate")} type="date" value={item.targetDate?.slice(0, 10) ?? ""} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, targetDate: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : null } : row) })} className={inputClass} />
              <input aria-label={t("notes")} value={item.notes ?? ""} onChange={(e) => setPortal({ ...portal, milestones: portal.milestones.map((row, i) => i === index ? { ...row, notes: e.target.value } : row) })} className={inputClass} />
              <button onClick={() => saveItem("milestone", item.id, { title: item.title, status: item.status, targetDate: item.targetDate, notes: item.notes })} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
              <button onClick={() => remove("milestone", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
            </div>
            <HideToggle
              t={t}
              hidden={item.hidden}
              disabled={!canHideFields || busy !== ""}
              canHideFields={canHideFields}
              onChange={(next) => void toggleItemHidden("milestone", item.id, next)}
            />
          </div>
        ))}
      </PortalItems>

      <PortalItems title={t("updates")}>
        <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(event) => { event.preventDefault(); void create("update", newUpdate); }}>
          <input aria-label={t("titleField")} required value={newUpdate.title} onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })} placeholder={t("titleField")} className={inputClass} />
          <textarea aria-label={t("content")} required value={newUpdate.body} onChange={(e) => setNewUpdate({ ...newUpdate, body: e.target.value })} placeholder={t("content")} className={`${inputClass} min-h-24`} />
          <button disabled={busy !== ""} className={buttonClass}>{t("publish")}</button>
        </form>
        {portal.updates.map((item, index) => (
          <div key={item.id} className="mt-3 rounded-xl bg-dark/[0.03] p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
              <input aria-label={t("titleField")} value={item.title} onChange={(e) => setPortal({ ...portal, updates: portal.updates.map((row, i) => i === index ? { ...row, title: e.target.value } : row) })} className={inputClass} />
              <textarea aria-label={t("content")} value={item.body} onChange={(e) => setPortal({ ...portal, updates: portal.updates.map((row, i) => i === index ? { ...row, body: e.target.value } : row) })} className={`${inputClass} min-h-24`} />
              <button onClick={() => saveItem("update", item.id, { title: item.title, body: item.body })} disabled={busy !== ""} className={buttonClass}>{t("save")}</button>
              <button onClick={() => remove("update", item.id)} disabled={busy !== ""} className="min-h-11 px-3 text-sm font-bold text-red-600">{t("delete")}</button>
            </div>
            <HideToggle
              t={t}
              hidden={item.hidden}
              disabled={!canHideFields || busy !== ""}
              canHideFields={canHideFields}
              onChange={(next) => void toggleItemHidden("update", item.id, next)}
            />
          </div>
        ))}
      </PortalItems>

      <PortalItems title={t("invitations")}>
        <form className="flex flex-wrap gap-3" onSubmit={async (event) => { event.preventDefault(); setBusy("invite"); try { await jsonRequest("/api/investor-portal/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, locale }) }); setInviteEmail(""); await refresh(); } catch (cause) { report(cause); } finally { setBusy(""); } }}>
          <input type="email" required aria-label={t("email")} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder={t("email")} className={`${inputClass} min-w-64 flex-1`} />
          <button disabled={busy !== ""} className={buttonClass}>{busy === "invite" ? t("sending") : t("sendInvite")}</button>
        </form>
        <div className="mt-4 space-y-2">{portal.invitations.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-dark/[0.03] p-3 text-sm"><span>{item.invitedEmail} · {t(`inviteStatus.${item.status}`)}</span><div className="flex gap-2">{item.status === "pending" && <button onClick={() => { setInviteEmail(item.invitedEmail); }} className="min-h-11 px-3 font-bold text-primary">{t("prepareResend")}</button>}<button onClick={async () => { setBusy(item.id); try { await jsonRequest(`/api/investor-portal/invitations/${item.id}`, { method: "DELETE" }); await refresh(); } catch (cause) { report(cause); } finally { setBusy(""); } }} disabled={busy !== "" || item.status === "revoked"} className="min-h-11 px-3 font-bold text-red-600 disabled:opacity-40">{t("revoke")}</button></div></div>)}</div>
      </PortalItems>
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"InvestorPortal">>;

/** 單筆隱藏開關。非 Enterprise 為唯讀 —— 已隱藏的項目仍顯示標記，讓人知道它還在生效。 */
function HideToggle({
  t,
  hidden,
  disabled,
  canHideFields,
  onChange,
}: {
  t: T;
  hidden: boolean;
  disabled: boolean;
  canHideFields: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`mt-2 flex min-h-11 items-center gap-2 text-xs font-semibold ${disabled ? "text-dark/35" : "text-dark/70"}`}
      title={canHideFields ? undefined : t("fieldVisibilityLocked")}
    >
      <input type="checkbox" checked={hidden} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {t("hideFromInvestors")}
      {hidden && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
          {t("hiddenBadge")}
        </span>
      )}
    </label>
  );
}

/** KPI 時間序列。沒有任何數值點時投資人端維持原本的數字卡，不畫圖。 */
function KpiPointsEditor({
  t,
  kpi,
  busy,
  inputClass,
  buttonClass,
  onError,
  onBusy,
  onAdded,
  onRemoved,
}: {
  t: T;
  kpi: Kpi;
  busy: string;
  inputClass: string;
  buttonClass: string;
  onError: (cause: unknown) => void;
  onBusy: (value: string) => void;
  onAdded: (point: KpiPoint) => void;
  onRemoved: (pointId: string) => void;
}) {
  const [draft, setDraft] = useState({ period: "", value: "" });

  async function send(url: string, init: RequestInit) {
    const res = await fetch(url, init);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error");
    return json.data;
  }

  async function addPoint() {
    onBusy(`point-${kpi.id}`);
    try {
      // 用 API 回傳的資料（含 server 產生的 id）更新本地，不整份重抓
      const created: KpiPoint = await send("/api/investor-portal/kpi-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpiId: kpi.id, period: draft.period, value: Number(draft.value) }),
      });
      setDraft({ period: "", value: "" });
      onAdded(created);
    } catch (cause) {
      onError(cause);
    } finally {
      onBusy("");
    }
  }

  async function deletePoint(id: string) {
    onBusy(id);
    try {
      await send(`/api/investor-portal/kpi-points/${id}`, { method: "DELETE" });
      onRemoved(id);
    } catch (cause) {
      onError(cause);
    } finally {
      onBusy("");
    }
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-bold text-dark/60">
        {t("kpiPoints")} ({kpi.points.length})
      </summary>
      <div className="mt-3">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void addPoint();
          }}
        >
          <input
            aria-label={t("period")}
            required
            value={draft.period}
            onChange={(e) => setDraft({ ...draft, period: e.target.value })}
            placeholder={t("periodPlaceholder")}
            className={inputClass}
          />
          <input
            aria-label={t("numericValue")}
            required
            type="number"
            step="any"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            placeholder={t("numericValue")}
            className={inputClass}
          />
          <button disabled={busy !== ""} className={buttonClass}>{t("addPoint")}</button>
        </form>
        {kpi.points.length === 0 ? (
          <p className="mt-2 text-xs text-dark/45">{t("noPoints")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {kpi.points.map((point) => (
              <li key={point.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs">
                <span className="font-mono">{point.period}</span>
                <span className="font-bold">{point.value}</span>
                <button
                  type="button"
                  onClick={() => void deletePoint(point.id)}
                  disabled={busy !== ""}
                  aria-label={`${t("delete")} ${point.period}`}
                  className="font-bold text-red-600 disabled:opacity-40"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function PortalItems({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-6 rounded-2xl border border-dark/10 bg-white p-6"><h2 className="mb-4 text-xl font-bold text-dark">{title}</h2>{children}</section>;
}
