"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type DealRow = {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  contactId: string | null;
  notes: string | null;
};
export type ContactOption = { id: string; name: string };

const STAGES = ["lead", "contacted", "proposal", "won", "lost"] as const;

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-xs font-semibold text-dark/70 font-[family-name:var(--font-heading)]";

const empty = { title: "", stage: "lead", value: "", contactId: "", notes: "" };

// 銷售管道：依 stage 分欄看板（MVP 用表單下拉改 stage，不做拖拉）。清單由 server 傳入。
export default function PipelineBoard({
  deals,
  contacts,
}: {
  deals: DealRow[];
  contacts: ContactOption[];
}) {
  const t = useTranslations("Dashboard.pipeline");
  const tA = useTranslations("Dashboard.actions");
  const router = useRouter();

  const [form, setForm] = useState({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const contactName = (id: string | null) =>
    id ? (contacts.find((c) => c.id === id)?.name ?? null) : null;

  function reset() {
    setForm({ ...empty });
    setEditingId(null);
    setError("");
  }

  function startEdit(d: DealRow) {
    setEditingId(d.id);
    setForm({
      title: d.title,
      stage: d.stage,
      value: d.value != null ? String(d.value) : "",
      contactId: d.contactId ?? "",
      notes: d.notes ?? "",
    });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = editingId ? `/api/pipeline/${editingId}` : "/api/pipeline";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          stage: form.stage,
          value: form.value === "" ? undefined : form.value,
          contactId: form.contactId,
          notes: form.notes,
        }),
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
      const res = await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
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
    <div className="mt-7">
      {/* 表單 */}
      <form
        onSubmit={submit}
        className="rounded-2xl border border-dark/10 bg-white p-5"
      >
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {editingId ? tA("edit") : t("add")}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className={labelClass}>{t("dealTitle")}</span>
            <input
              className={fieldClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("stage")}</span>
            <select
              className={fieldClass}
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value })}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(`stageLabels.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("value")}</span>
            <input
              type="number"
              min="0"
              className={fieldClass}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelClass}>{t("contact")}</span>
            <select
              className={fieldClass}
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            >
              <option value="">{t("noContact")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelClass}>{t("notes")}</span>
            <input
              className={fieldClass}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

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

      {/* 看板 */}
      <p className="mt-5 mb-3 text-sm text-dark/55">
        {t("count", { count: deals.length })}
      </p>
      {deals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-dark/15 p-8 text-center text-sm text-dark/55">
          {t("empty")}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const col = deals.filter((d) => d.stage === stage);
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-dark/50 font-[family-name:var(--font-heading)]">
                    {t(`stageLabels.${stage}`)}
                  </span>
                  <span className="rounded-full bg-dark/[0.05] px-2 py-0.5 text-[11px] font-semibold text-dark/50">
                    {col.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 rounded-2xl bg-dark/[0.02] p-2">
                  {col.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-dark/10 bg-white p-3"
                    >
                      <p className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
                        {d.title}
                      </p>
                      {d.value != null && (
                        <p className="mt-0.5 text-xs font-semibold text-primary">
                          NT${d.value.toLocaleString()}
                        </p>
                      )}
                      {contactName(d.contactId) && (
                        <p className="text-xs text-dark/50">
                          {contactName(d.contactId)}
                        </p>
                      )}
                      {d.notes && (
                        <p className="mt-1 text-xs text-dark/60">{d.notes}</p>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="rounded-md border border-dark/15 px-2 py-1 text-[11px] font-semibold text-dark/70 hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
                        >
                          {tA("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(d.id)}
                          disabled={deletingId === d.id}
                          className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 font-[family-name:var(--font-heading)]"
                        >
                          {deletingId === d.id ? tA("deleting") : tA("delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
