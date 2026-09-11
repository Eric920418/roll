"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type {
  MilestoneConfig,
  MilestoneGroupKey,
  MilestoneGroupView,
  MilestoneItemView,
  MilestoneMutation,
} from "@/lib/tools/checklist";

export default function ChecklistTool({ groups: initialGroups }: { groups: MilestoneGroupView[] }) {
  const t = useTranslations("Dashboard.tools");
  const [groups, setGroups] = useState(initialGroups);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState({
    groupKey: initialGroups[0]?.key ?? ("weekly" as MilestoneGroupKey),
    title: "",
  });
  const [editingGroup, setEditingGroup] = useState<{ key: MilestoneGroupKey; title: string } | null>(null);
  const [editingItem, setEditingItem] = useState<
    { id: string; title: string; source: MilestoneItemView["source"] } | null
  >(null);

  // 軟刪除的系統項目仍留在 groups（供「還原預設」就地復原），但不計入畫面與進度
  const visibleItems = (group: MilestoneGroupView) => group.items.filter((item) => !item.hidden);
  const items = groups.flatMap(visibleItems);
  const total = items.length;
  const completed = items.filter((item) => item.done).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  async function mutate(mutation: MilestoneMutation, busyKey: string): Promise<MilestoneConfig | null> {
    setError("");
    setBusy(busyKey);
    try {
      const res = await fetch("/api/tools/milestones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t("saveFailed"));
      return json.data as MilestoneConfig;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("saveFailed"));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function toggle(groupKey: MilestoneGroupKey, item: MilestoneGroupView["items"][number]) {
    const nextDone = !item.done;
    const busyKey = `toggle:${item.key}`;

    if (item.source === "custom") {
      const saved = await mutate({ type: "updateItem", itemId: item.key, done: nextDone }, busyKey);
      if (!saved) return;
    } else {
      setError("");
      setBusy(busyKey);
      try {
        const res = await fetch("/api/tools/checklist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: { [item.key]: nextDone } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t("saveFailed"));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("saveFailed"));
        setBusy("");
        return;
      }
      setBusy("");
    }

    setGroups((current) => current.map((group) => group.key === groupKey
      ? {
          ...group,
          items: group.items.map((row) => row.key === item.key ? { ...row, done: nextDone } : row),
        }
      : group));
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(
      { type: "addItem", groupKey: draft.groupKey, title: draft.title },
      "add",
    );
    if (!saved) return;

    const created = saved.items.at(-1);
    if (!created) return;
    setGroups((current) => current.map((group) => group.key === created.groupKey
      ? {
          ...group,
          items: [
            ...group.items,
            { key: created.id, text: created.title, done: created.done, source: "custom" },
          ],
        }
      : group));
    setDraft((current) => ({ ...current, title: "" }));
    setComposerOpen(false);
  }

  async function renameGroup(event: FormEvent) {
    event.preventDefault();
    if (!editingGroup) return;
    const saved = await mutate(
      { type: "renameGroup", groupKey: editingGroup.key, title: editingGroup.title },
      `group:${editingGroup.key}`,
    );
    if (!saved) return;
    setGroups((current) => current.map((group) => group.key === editingGroup.key
      ? { ...group, title: editingGroup.title.trim() }
      : group));
    setEditingGroup(null);
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!editingItem) return;
    const saved = await mutate(
      editingItem.source === "system"
        ? { type: "updateSystemItem", itemKey: editingItem.id, title: editingItem.title }
        : { type: "updateItem", itemId: editingItem.id, title: editingItem.title },
      `item:${editingItem.id}`,
    );
    if (!saved) return;
    setGroups((current) => current.map((group) => ({
      ...group,
      items: group.items.map((item) => item.key === editingItem.id
        ? { ...item, text: editingItem.title.trim(), hidden: false }
        : item),
    })));
    setEditingItem(null);
  }

  async function deleteItem(item: MilestoneItemView) {
    if (!window.confirm(t("deleteConfirm", { title: item.text }))) return;
    const isSystem = item.source === "system";
    const saved = await mutate(
      isSystem ? { type: "deleteSystemItem", itemKey: item.key } : { type: "deleteItem", itemId: item.key },
      `item:${item.key}`,
    );
    if (!saved) return;
    setGroups((current) => current.map((group) => ({
      ...group,
      // 系統項目軟刪：留著才有辦法「還原預設」，自訂項目則真的移除
      items: isSystem
        ? group.items.map((row) => row.key === item.key ? { ...row, hidden: true } : row)
        : group.items.filter((row) => row.key !== item.key),
    })));
    if (editingItem?.id === item.key) setEditingItem(null);
  }

  async function restoreDefaults(group: MilestoneGroupView) {
    if (!window.confirm(t("restoreConfirm", { group: group.title }))) return;
    const saved = await mutate({ type: "restoreSystemItems", groupKey: group.key }, `restore:${group.key}`);
    if (!saved) return;
    setGroups((current) => current.map((row) => row.key === group.key
      ? {
          ...row,
          items: row.items.map((item) => item.source === "system"
            ? { ...item, hidden: false, text: item.defaultText ?? item.text }
            : item),
        }
      : row));
    setEditingItem(null);
  }

  return (
    <div className="mt-7">
      <div className="rounded-2xl border border-dark/10 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-dark font-[family-name:var(--font-heading)]">
                {t("progress")}
              </span>
              <span className="font-bold text-primary">
                {completed}/{total}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10"
              role="progressbar"
              aria-label={t("progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${completed}/${total}`}
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setComposerOpen((open) => !open);
              setError("");
            }}
            aria-expanded={composerOpen}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            <PlusIcon />
            {t("addMilestone")}
          </button>
        </div>

        {composerOpen && (
          <form onSubmit={addItem} className="mt-5 grid gap-3 border-t border-dark/10 pt-5 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs font-bold text-dark/55">
              {t("group")}
              <select
                value={draft.groupKey}
                onChange={(event) => setDraft({ ...draft, groupKey: event.target.value as MilestoneGroupKey })}
                className="min-h-11 rounded-xl border border-dark/15 bg-white px-3 text-sm font-medium text-dark outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              >
                {groups.map((group) => <option key={group.key} value={group.key}>{group.title}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-dark/55">
              {t("milestone")}
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                maxLength={200}
                required
                placeholder={t("newMilestonePlaceholder")}
                className="min-h-11 rounded-xl border border-dark/15 bg-white px-4 text-sm text-dark outline-none placeholder:text-dark/35 focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy !== ""} className="min-h-11 flex-1 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none">
                {busy === "add" ? t("saving") : t("add")}
              </button>
              <button type="button" onClick={() => setComposerOpen(false)} className="min-h-11 rounded-xl border border-dark/15 px-4 text-sm font-semibold text-dark/65">
                {t("cancel")}
              </button>
            </div>
          </form>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.key} className="rounded-2xl border border-dark/10 bg-white p-5 sm:p-6">
            <div className="flex min-h-11 items-center justify-between gap-3">
              {editingGroup?.key === group.key ? (
                <form onSubmit={renameGroup} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <label className="sr-only" htmlFor={`group-${group.key}`}>{t("groupName")}</label>
                  <input
                    id={`group-${group.key}`}
                    autoFocus
                    value={editingGroup.title}
                    onChange={(event) => setEditingGroup({ ...editingGroup, title: event.target.value })}
                    maxLength={80}
                    required
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-primary bg-white px-3 text-sm font-bold tracking-[0.08em] text-dark outline-none ring-1 ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={busy !== ""} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{t("save")}</button>
                    <button type="button" onClick={() => setEditingGroup(null)} className="min-h-11 rounded-xl border border-dark/15 px-4 text-sm font-semibold text-dark/65">{t("cancel")}</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <h3 className="truncate text-sm font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
                      {group.title}
                    </h3>
                    {group.cadence !== "project" && (
                      <span className="shrink-0 rounded-full bg-dark/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-dark/45">
                        {t(`cadence.${group.cadence}`)}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {group.items.some((item) => item.source === "system" && (item.hidden || item.text !== item.defaultText)) && (
                      <button
                        type="button"
                        onClick={() => void restoreDefaults(group)}
                        disabled={busy === `restore:${group.key}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-dark/50 transition hover:bg-dark/[0.04] hover:text-primary disabled:opacity-50"
                        aria-label={t("restoreDefaults")}
                      >
                        <RestoreIcon />
                        <span className="hidden sm:inline">{t("restoreDefaults")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingGroup({ key: group.key, title: group.title })}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-dark/50 transition hover:bg-dark/[0.04] hover:text-primary"
                      aria-label={t("renameGroup")}
                    >
                      <PencilIcon />
                      <span className="hidden sm:inline">{t("renameGroup")}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {visibleItems(group).length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setDraft({ groupKey: group.key, title: "" });
                  setComposerOpen(true);
                  setError("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-dark/15 text-sm font-semibold text-dark/45 transition hover:border-primary hover:text-primary"
              >
                <PlusIcon />
                {t("addToGroup", { group: group.title })}
              </button>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {visibleItems(group).map((item) => (
                  <li key={item.key} className="group/item rounded-xl transition hover:bg-dark/[0.025]">
                    {editingItem?.id === item.key ? (
                      <form onSubmit={saveItem} className="flex flex-col gap-2 p-2 sm:flex-row">
                        <label className="sr-only" htmlFor={`item-${item.key}`}>{t("milestone")}</label>
                        <input
                          id={`item-${item.key}`}
                          autoFocus
                          value={editingItem.title}
                          onChange={(event) => setEditingItem({ ...editingItem, title: event.target.value })}
                          maxLength={200}
                          required
                          className="min-h-11 min-w-0 flex-1 rounded-xl border border-primary bg-white px-3 text-sm text-dark outline-none ring-1 ring-primary/20"
                        />
                        <div className="flex gap-2">
                          <button type="submit" disabled={busy !== ""} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{t("save")}</button>
                          <button type="button" onClick={() => setEditingItem(null)} className="min-h-11 rounded-xl border border-dark/15 px-4 text-sm font-semibold text-dark/65">{t("cancel")}</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex min-h-11 items-start gap-3 px-1 py-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => void toggle(group.key, item)}
                            disabled={busy === `toggle:${item.key}`}
                            className="mt-0.5 h-5 w-5 shrink-0 accent-primary disabled:opacity-50"
                          />
                          <span className={`text-sm leading-snug font-[family-name:var(--font-body)] ${item.done ? "text-dark/40 line-through" : "text-dark/80"}`}>
                            {item.text}
                          </span>
                        </label>
                        <div className="flex shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditingItem({ id: item.key, title: item.text, source: item.source })}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-dark/40 hover:bg-white hover:text-primary"
                            aria-label={t("editMilestone")}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteItem(item)}
                            disabled={busy === `item:${item.key}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-dark/35 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            aria-label={t("deleteMilestone")}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /></svg>;
}

function PencilIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><path d="m4 20 4.2-1 10.7-10.7a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function RestoreIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 5v5h5M4.6 14a8 8 0 1 0 1.4-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function TrashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
