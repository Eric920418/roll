"use client";

import { useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
  /** 預覽容器的額外 class（控制尺寸） */
  className?: string;
};

export default function ImageUploader({
  value,
  onChange,
  folder = "cms",
  label,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      if (value) fd.append("oldUrl", value);

      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const raw = await res.text();
      let json: { data?: { url?: string }; error?: string } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = { error: `伺服器回應非 JSON（HTTP ${res.status}）：${raw.slice(0, 200)}` };
      }
      if (!res.ok) throw new Error(json.error || `上傳失敗（HTTP ${res.status}）`);
      if (!json.data?.url) throw new Error("伺服器未回傳圖片網址");
      onChange(json.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
      <div className="flex items-start gap-3">
        <div
          className={`relative rounded-lg border border-neutral-300 bg-neutral-50 overflow-hidden flex items-center justify-center ${
            className ?? "w-28 h-28"
          }`}
        >
          {value ? (
            // 使用原生 img：後台預覽不需 next/image 最佳化，且可顯示 /public 與 Blob 兩種來源
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="預覽" className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs text-neutral-400">無圖片</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFile}
            disabled={loading}
            className="text-sm"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-red-600 hover:underline text-left"
            >
              移除圖片
            </button>
          )}
          <p className="text-xs text-neutral-400">JPG/PNG/WebP，最大 4.5 MB</p>
        </div>
      </div>
      {loading && <p className="text-xs text-neutral-500">上傳中…</p>}
      {error && (
        <p className="text-xs text-red-600 whitespace-pre-wrap break-all">{error}</p>
      )}
    </div>
  );
}
