// 投資人唯讀頁的版面基本件。
// 此頁不在 dashboard shell 底下，走的是 ROLL ON 官網主題（cream / 深酒紅），
// 不是 NOVA 的黑白主題 —— 改樣式時請沿用 text-primary / text-dark。

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dark/10 bg-white p-6">
      <h2 className="mb-4 text-xl font-bold text-dark">{title}</h2>
      {children}
    </section>
  );
}

export function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-dark/40">{label}</dt>
      <dd className="mt-1 font-semibold text-dark">{value || "—"}</dd>
    </div>
  );
}
