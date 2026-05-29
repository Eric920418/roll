"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageUploader from "./ImageUploader";

export type SettingField = {
  name: string;
  label: string;
  type: "text" | "image";
  folder?: string;
};

export default function SettingsForm({
  settingKey,
  title,
  fields,
  initial,
}: {
  settingKey: string;
  title: string;
  fields: SettingField[];
  initial: Record<string, unknown>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.name] = (initial[f.name] as string) ?? "";
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: values }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `儲存失敗（HTTP ${res.status}）`);
      setStatus("已儲存");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-200 bg-white p-6 flex flex-col gap-4 max-w-2xl"
    >
      <h2 className="font-semibold">{title}</h2>
      {fields.map((f) =>
        f.type === "image" ? (
          <ImageUploader
            key={f.name}
            label={f.label}
            folder={f.folder ?? "cms"}
            value={values[f.name]}
            onChange={(url) => set(f.name, url)}
          />
        ) : (
          <label key={f.name} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">{f.label}</span>
            <input
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              className={inputClass}
            />
          </label>
        ),
      )}
      {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
        {status && <span className="text-sm text-green-600">{status}</span>}
      </div>
    </form>
  );
}
