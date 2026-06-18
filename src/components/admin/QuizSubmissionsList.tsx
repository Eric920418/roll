"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SubmissionRow = {
  id: string;
  email: string;
  name: string;
  founder: string;
  answers: string[];
  scores: string;
  createdAt: string;
};

export default function QuizSubmissionsList({
  submissions,
}: {
  submissions: SubmissionRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("確定刪除這筆紀錄？")) return;
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/quiz-submissions/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "刪除失敗");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setBusy(null);
    }
  }

  if (submissions.length === 0) {
    return <p className="text-sm text-neutral-400">尚無提交紀錄</p>;
  }

  return (
    <div>
      {error && (
        <p className="mb-4 whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">用戶</th>
              <th className="px-4 py-2.5 text-left font-medium">作答</th>
              <th className="px-4 py-2.5 text-left font-medium">配對創辦人</th>
              <th className="px-4 py-2.5 text-left font-medium">決策分數</th>
              <th className="px-4 py-2.5 text-left font-medium">時間</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr
                key={s.id}
                className="border-t border-neutral-100 align-top hover:bg-neutral-50"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium">{s.name || "—"}</div>
                  <div className="text-xs text-neutral-500">{s.email}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {s.answers.map((a, i) => (
                      <span
                        key={i}
                        className="rounded bg-neutral-100 px-2 py-0.5 text-xs"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">{s.founder}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-600">
                  {s.scores}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-neutral-500">
                  {new Date(s.createdAt).toLocaleString("zh-TW")}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => remove(s.id)}
                    disabled={busy === s.id}
                    className="text-sm text-red-600 hover:underline disabled:opacity-40"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
