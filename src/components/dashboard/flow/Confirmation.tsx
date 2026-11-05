"use client";
import { useState } from "react";
import { memberFetch } from "@/lib/member-fetch";
import { button } from "./Templates";
export default function Confirmation({ id, token, statement, answered, locale }: { id: string; token: string; statement: string; answered: boolean; locale: string }) {
  const zh = locale === "zh-tw", [done, setDone] = useState(answered), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function respond(answer: "yes" | "no") {
    if (busy) return; setBusy(true); setError("");
    try { await memberFetch("/api/action-plans/confirm/" + id, { method: "POST", body: JSON.stringify({ token, answer }) }); setDone(true); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-xl space-y-6 px-5 py-14"><p className="text-xs font-semibold tracking-widest">NOVA AI</p><h1 className="text-3xl font-bold">{zh ? "這句話描述的是你的情況嗎？" : "Does this statement describe your situation?"}</h1><blockquote className="rounded-2xl border border-dark/20 p-6 text-xl leading-8">{statement}</blockquote>{done ? <p role="status">{zh ? "回覆已保存，謝謝你。" : "Your response is saved. Thank you."}</p> : <div className="flex flex-wrap gap-3"><button className={button + " bg-black text-white"} disabled={busy} onClick={() => void respond("yes")}>{zh ? "符合，這就是我的情況" : "Yes, this describes my situation"}</button><button className={button} disabled={busy} onClick={() => void respond("no")}>{zh ? "不符合" : "No, it does not"}</button></div>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p>}</main>;
}
