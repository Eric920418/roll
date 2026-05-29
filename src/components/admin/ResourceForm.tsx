"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldDef, ResourceConfig } from "@/lib/cms/resource-fields";
import type { Localized } from "@/lib/cms/i18n";
import LocalizedField from "./LocalizedField";
import ImageUploader from "./ImageUploader";

type Values = Record<string, unknown>;

function defaultValue(f: FieldDef): unknown {
  switch (f.type) {
    case "localized":
      return { en: "", "zh-tw": "" };
    case "number":
      return 0;
    case "bool":
      return true;
    default:
      return "";
  }
}

export default function ResourceForm({
  resource,
  config,
  initial,
}: {
  resource: string;
  config: ResourceConfig;
  initial: Values | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = {};
    for (const f of config.fields) {
      v[f.name] = initial?.[f.name] ?? defaultValue(f);
    }
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const id = initial?.id as string | undefined;
  const isEdit = Boolean(id);

  function set(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        isEdit ? `/api/admin/${resource}/${id}` : `/api/admin/${resource}`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `儲存失敗（HTTP ${res.status}）`);
      router.push(`/admin/${resource}`);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-3xl">
      {config.fields.map((f) => {
        if (f.type === "localized") {
          return (
            <LocalizedField
              key={f.name}
              label={f.label}
              multiline={f.multiline}
              value={values[f.name] as Localized}
              onChange={(next) => set(f.name, next)}
            />
          );
        }
        if (f.type === "image") {
          return (
            <ImageUploader
              key={f.name}
              label={f.label}
              folder={f.folder}
              value={(values[f.name] as string) ?? ""}
              onChange={(url) => set(f.name, url)}
            />
          );
        }
        if (f.type === "bool") {
          return (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
                className="w-4 h-4"
              />
              <span className="font-medium text-neutral-700">{f.label}</span>
            </label>
          );
        }
        return (
          <label key={f.name} className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">{f.label}</span>
            {f.help && <span className="text-xs text-neutral-400">{f.help}</span>}
            <input
              type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
              value={String(values[f.name] ?? "")}
              onChange={(e) =>
                set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)
              }
              className={inputClass}
            />
          </label>
        );
      })}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
        >
          {saving ? "儲存中…" : isEdit ? "更新" : "新增"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/admin/${resource}`)}
          className="rounded-lg border border-neutral-300 px-5 py-2 text-sm hover:bg-neutral-100"
        >
          取消
        </button>
      </div>
    </form>
  );
}
