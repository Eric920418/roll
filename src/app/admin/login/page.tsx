"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        // 完整顯示後端錯誤訊息
        throw new Error(json.error || `登入失敗（HTTP ${res.status}）`);
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-neutral-200 p-8 flex flex-col gap-5"
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight">ROLL ON. CMS</h1>
          <p className="text-sm text-neutral-500 mt-1">後台管理登入</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">帳號 Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
          />
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-neutral-900 text-white py-2.5 font-medium hover:bg-neutral-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "登入中…" : "登入"}
        </button>
      </form>
    </div>
  );
}
