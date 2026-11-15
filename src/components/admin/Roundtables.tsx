"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
import { adminRoundtableMutationSchema } from "@/lib/roundtables/schema";
import type { adminRoundtables } from "@/lib/roundtables/service";
import { SessionForm } from "@/components/dashboard/roundtables/Forms";
import { button, TextField } from "@/components/dashboard/flow/Templates";

type State = Awaited<ReturnType<typeof adminRoundtables>>;
const status = (value: string) => ({ scheduled: "已排定", completed: "已結案", cancelled: "已取消" })[value] || value;
export default function Roundtables({ operator }: { operator: string }) {
  const [data, setData] = useState<State | null>(null), [hostId, setHostId] = useState(""), [selected, setSelected] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Record<string, { value: string; revision: number }>>({}), [reasons, setReasons] = useState<Record<string, string>>({});
  const request = useRef(0), writing = useRef(false);
  const load = useCallback(async () => {
    const id = ++request.current; setLoading(true);
    try { const next = await memberFetch<State>("/api/admin/roundtables"); if (id === request.current) { setData(next); setError(""); } }
    catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function write(input: unknown) {
    if (writing.current || loading) return false;
    const parsed = adminRoundtableMutationSchema.safeParse(input);
    if (!parsed.success) { setError("HTTP 400\n" + parsed.error.issues.map(i => i.path.join(".") + ": " + i.message).join("\n")); return false; }
    writing.current = true; request.current++; setBusy(true); setError(""); setNotice("");
    try {
      const next = await memberFetch<State & { selectedId: string | null }>("/api/admin/roundtables", { method: "POST", body: JSON.stringify(parsed.data) });
      setData(next); if (next.selectedId) setSelected(next.selectedId);
      setNotice("已儲存，會員端會依場次狀態顯示最新資料。"); return true;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { writing.current = false; setBusy(false); }
  }
  const session = data?.sessions.find(s => s.id === selected), disabled = busy || loading;
  const now = Date.parse(data?.serverTime || ""), upcoming = Boolean(session && Date.parse(session.startsAt) > now), ongoing = Boolean(session && Date.parse(session.endsAt) > now);
  const link = session && (links[session.id] || { value: session.meetingUrl, revision: session.revision });
  const date = (value: string, timezone: string) => new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
  return <div className="min-w-0 space-y-6">
    <header className="space-y-3"><h1 className="text-3xl font-bold">圓桌場次管理</h1><p className="text-sm">建立後直接顯示於會員端。主持人須已通過導師認證；已有報名的場次保留原時間與名額，可更新連結或取消後另建。</p><div className="flex flex-wrap gap-3"><button className={button} disabled={disabled} onClick={() => void load()}>載入最新資料並保留草稿</button><Link className={button} href="/dashboard/matchmaking?tab=roundtables" target="_blank" rel="noopener noreferrer">查看會員圓桌頁 ↗</Link></div></header>
    {error && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">{notice}</p>}
    {!data ? <p role="status">載入圓桌資料…</p> : <>
      <section className="space-y-4 rounded-2xl border bg-white p-4 sm:p-6"><h2 className="text-xl font-semibold">新增圓桌場次</h2>{!data.mentors.length ? <p>目前沒有已認證導師，請先至 <Link className="underline" href="/admin/mentors">導師認證審核</Link> 通過一位主持人。</p> : <><label className="block text-sm">主持人<select aria-label="主持人" className="mt-1 min-h-11 w-full rounded-xl border bg-white p-3" disabled={disabled} value={hostId} onChange={e => setHostId(e.target.value)}><option value="">選擇已認證導師</option>{data.mentors.map(m => <option key={m.id} value={m.id}>{m.name} · {m.email}</option>)}</select></label>{hostId && <SessionForm key={hostId} userId={`admin:${operator}:${hostId}`} disabled={disabled} write={input => write({ ...(input as object), hostId })} />}</>}</section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">場次紀錄</h2><p className="text-xs text-neutral-500">最近 100 場，名額包含主持人；取消與結案紀錄保留。</p><div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr>{["主題", "主持人", "時間／時區", "名額／報名", "狀態", "操作"].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{data.sessions.map(s => <tr key={s.id} className="border-t"><td className="max-w-64 break-words p-3">{s.topic}</td><td className="p-3">{s.hostName}</td><td className="p-3">{date(s.startsAt, s.timezone)}<span className="block text-xs text-neutral-500">{s.timezone}</span></td><td className="p-3">{s.confirmed}/{s.capacity}<span className="block text-xs text-neutral-500">待審 {s.pending} · 候補 {s.waiting}</span></td><td className="p-3">{status(s.status)}</td><td className="p-3"><button className={button} disabled={disabled} onClick={() => setSelected(s.id)}>管理場次</button></td></tr>)}</tbody></table>{!data.sessions.length && <p className="p-5 text-sm">尚未建立圓桌場次。從上方選擇主持人並新增，會員端才會出現會議時間。</p>}</div></section>
      {session && <section aria-label="管理已選場次" className="min-w-0 space-y-5 rounded-2xl border bg-white p-4 sm:p-6"><h2 className="break-words text-xl font-semibold">{session.topic}</h2><p className="text-sm">{session.hostName} · {session.hostEmail} · {status(session.status)}</p><Link className={button} target="_blank" rel="noopener noreferrer" href={`/dashboard/matchmaking?tab=roundtables&roundtable=${encodeURIComponent(session.id)}`}>查看本場前台 ↗</Link>{session.cancelReason && <p className="whitespace-pre-wrap break-words text-sm">取消原因：{session.cancelReason}</p>}
        {session.status === "scheduled" && session.certified ? <>
          {!session.registrations && upcoming ? <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">編輯場次資料</summary><SessionForm key={session.id} userId={`admin:${operator}`} initial={session} disabled={disabled} write={write} /></details> : <p className="rounded-xl bg-neutral-50 p-4 text-sm">已有報名紀錄或場次已開始，不能直接改時間或名額；可取消後另建。</p>}
          {link && ongoing && <div className="space-y-3 border-t pt-4"><TextField type="url" label="新會議連結" value={link.value} onChange={value => setLinks(old => ({ ...old, [session.id]: { value, revision: link.revision } }))} />{link.revision !== session.revision && <div className="space-y-2 text-sm"><p className="break-all">最新已存連結：{session.meetingUrl}</p><button className={button} disabled={disabled} onClick={() => setLinks(old => ({ ...old, [session.id]: { ...link, revision: session.revision } }))}>已比較連結，使用最新版本重試</button></div>}<button className={button} disabled={disabled || link.revision !== session.revision} onClick={() => void write({ action: "meetingLink", id: session.id, revision: link.revision, meetingUrl: link.value }).then(ok => { if (ok) setLinks(old => { const next = { ...old }; delete next[session.id]; return next; }); })}>儲存會議連結</button></div>}
          <div className="space-y-3 border-t pt-4"><TextField multiline label="取消原因" value={reasons[session.id] || ""} onChange={value => setReasons(old => ({ ...old, [session.id]: value }))} /><button className={button + " text-red-800"} disabled={disabled || (reasons[session.id]?.trim().length || 0) < 3} onClick={() => { if (window.confirm(`取消「${session.topic}」？報名、原因與歷史紀錄會保留。`)) void write({ action: "cancel", id: session.id, revision: session.revision, reason: reasons[session.id] }); }}>取消場次並保留紀錄</button></div>
        </> : <p className="text-sm">此場次已結束、取消或主持認證已停用，保留唯讀紀錄。</p>}
      </section>}
    </>}
  </div>;
}
