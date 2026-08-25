"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type ContactRow = {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
};

const STATUSES = ["lead", "active", "closed"] as const;

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-xs font-semibold text-dark/70 font-[family-name:var(--font-heading)]";

const empty = {
  name: "",
  company: "",
  category: "",
  email: "",
  phone: "",
  status: "lead",
  notes: "",
};

// CRM 聯絡人管理：清單資料由 server 傳入（props），mutation 後 router.refresh() 重取。
// 一個表單兼新增/編輯（editingId 切換）。錯誤全文顯示於紅框。
export default function CrmManager({ contacts }: { contacts: ContactRow[] }) {
  const t = useTranslations("Dashboard.crm");
  const tA = useTranslations("Dashboard.actions");
  const router = useRouter();

  const [form, setForm] = useState({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function reset() {
    setForm({ ...empty });
    setEditingId(null);
    setError("");
  }

  function startEdit(c: ContactRow) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      company: c.company ?? "",
      category: c.category ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      status: c.status,
      notes: c.notes ?? "",
    });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = editingId ? `/api/crm/${editingId}` : "/api/crm";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(tA("deleteConfirm"))) return;
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/crm/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "delete failed");
      if (editingId === id) reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-[20rem_1fr]">
      {/* 表單 */}
      <form
        onSubmit={submit}
        className="h-fit rounded-2xl border border-dark/10 bg-white p-5"
      >
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {editingId ? tA("edit") : t("add")}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("name")}</span>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("company")}</span>
            <input
              className={fieldClass}
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("category")}</span>
            <input
              className={fieldClass}
              value={form.category}
              placeholder={t("categoryPlaceholder")}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t("email")}</span>
              <input
                className={fieldClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>{t("phone")}</span>
              <input
                className={fieldClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("status")}</span>
            <select
              className={fieldClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statusLabels.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("notes")}</span>
            <textarea
              className={`${fieldClass} resize-none`}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
          >
            {loading ? tA("saving") : tA("save")}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-dark/15 px-4 py-2.5 text-sm font-semibold text-dark/70 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
            >
              {tA("cancel")}
            </button>
          )}
        </div>
      </form>

      {/* 清單 */}
      <div>
        <p className="mb-3 text-sm text-dark/55">
          {t("count", { count: contacts.length })}
        </p>
        {contacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dark/15 p-8 text-center text-sm text-dark/55">
            {t("empty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-dark/10 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-dark font-[family-name:var(--font-heading)]">
                        {c.name}
                      </p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                        {t(`statusLabels.${c.status}`)}
                      </span>
                      {c.category ? (
                        <span className="rounded-full bg-dark/[0.06] px-2 py-0.5 text-[11px] font-semibold text-dark/65">
                          {c.category}
                        </span>
                      ) : null}
                    </div>
                    {c.company && (
                      <p className="text-sm text-dark/60">{c.company}</p>
                    )}
                    <p className="mt-1 text-xs text-dark/50">
                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                    </p>
                    {c.notes && (
                      <p className="mt-1 text-sm text-dark/65">{c.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded-lg border border-dark/15 px-3 py-1.5 text-xs font-semibold text-dark/70 hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
                    >
                      {tA("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      disabled={deletingId === c.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 font-[family-name:var(--font-heading)]"
                    >
                      {deletingId === c.id ? tA("deleting") : tA("delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
