"use client";
import { useLocale } from "next-intl";

export default function RoundtablesPanel() {
  const zh = useLocale() === "zh-tw";
  return <section aria-labelledby="roundtables-title" className="min-w-0 rounded-2xl border border-dark/15 bg-white p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold tracking-widest text-dark/55">{zh ? "一起推進下一步" : "MOVE FORWARD TOGETHER"}</p>
      <span className="rounded-full border border-dark/15 px-3 py-1 text-xs font-semibold">{zh ? "籌備中" : "In preparation"}</span>
    </div>
    <h2 id="roundtables-title" className="mt-6 text-2xl font-semibold tracking-tight">{zh ? "圓桌會議" : "Roundtables"}</h2>
    <p className="mt-3 max-w-2xl text-base leading-7 text-dark/70">{zh ? "帶著真實客戶證據，與創辦人、導師及投資人交流，找出能推進事業的下一步。" : "Bring real customer evidence. Exchange perspectives with founders, mentors and investors, and leave with a clear next step."}</p>
    <div className="mt-7 grid gap-4 border-t border-dark/10 pt-5 sm:grid-cols-2">
      <div><p className="text-xs text-dark/55">{zh ? "小組規模" : "Group size"}</p><p className="mt-1 font-semibold">{zh ? "每場 4–6 人" : "4–6 participants per session"}</p></div>
      <div><p className="text-xs text-dark/55">{zh ? "開放時間" : "Availability"}</p><p className="mt-1 font-semibold">{zh ? "場次與報名方式確認後公布" : "Dates and registration to be announced"}</p></div>
    </div>
  </section>;
}
