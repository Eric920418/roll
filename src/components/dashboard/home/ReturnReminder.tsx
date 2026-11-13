"use client";
import { useState } from 'react';
import { useLocale } from 'next-intl';
import EvidencePreferences from '../evidence/Preferences';
import ThisWeekCalendar from './ThisWeekCalendar';
export default function ReturnReminder({ date }: { date?: string }) {
  const zh = useLocale() === 'zh-tw', [preferences,setPreferences] = useState(false), [calendar,setCalendar] = useState(false);
  return <section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5"><p className="text-xs text-dark/45">{zh ? '下次回來' : 'YOUR NEXT VISIT'}</p><h2 className="mt-2 break-words text-lg font-semibold">{date || (zh ? '安排下一次行動' : 'Plan your next action')}</h2>{date && <p className="mt-1 text-[10px] text-dark">{zh ? '目前里程碑期限' : 'Current milestone due'}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" aria-expanded={preferences} className="min-h-11 rounded-full border border-dark/15 px-3 text-xs font-semibold" onClick={()=>setPreferences(!preferences)}>{zh ? '設定提醒' : 'Set reminders'}</button><button type="button" aria-expanded={calendar} className="min-h-11 rounded-full border border-dark/15 px-3 text-xs font-semibold" onClick={()=>setCalendar(!calendar)}>{zh ? '加入行事曆' : 'Add to calendar'}</button></div>{preferences && <div className="mt-4"><EvidencePreferences /></div>}{calendar && <div className="mt-4"><ThisWeekCalendar /></div>}</section>;
}
