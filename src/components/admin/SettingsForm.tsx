"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readAdminResponse } from "@/lib/cms/admin-response";
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
  const pending = useRef(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const hasUploads = Object.values(uploading).some(Boolean);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current || hasUploads) return;
    pending.current = true;
    setSaving(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: values }),
      });
      await readAdminResponse(res);
      setStatus("已儲存");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      pending.current = false;
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
            preservePrevious
            disabled={saving || hasUploads}
            onUploadingChange={(active) => setUploading(prev => ({ ...prev, [f.name]: active }))}
          />
        ) : (
          <label key={f.name} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">{f.label}</span>
            <input
              disabled={saving || hasUploads}
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
              className={inputClass}
            />
          </label>
        ),
      )}
      {error && <p role="alert" className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || hasUploads}
          className="rounded-lg bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
        >
          {saving ? "儲存中…" : hasUploads ? "圖片上傳中…" : "儲存"}
        </button>
        {status && <span className="text-sm text-green-600">{status}</span>}
      </div>
    </form>
  );
}
