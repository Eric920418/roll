"use client";
import { useState } from 'react';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { pathForLocale } from '@/lib/routes';
import ThisWeekCalendar from './ThisWeekCalendar';
export default function ReturnReminder({ date }: { date?: string }) {
  const locale = useLocale() === 'zh-tw' ? 'zh-tw' : 'en', zh = locale === 'zh-tw', [calendar,setCalendar] = useState(false);
  return <section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5"><h2 className="break-words text-lg font-semibold">{date ? (zh ? `下次行動：${date}` : `Next action: ${date}`) : (zh ? '安排下一次行動' : 'Plan your next action')}</h2><div className="mt-3 flex flex-wrap gap-2"><Link href={pathForLocale('/dashboard/notifications#notifications',locale)} className="inline-flex min-h-11 items-center rounded-full border border-dark/15 px-3 text-xs font-semibold">{zh ? '設定提醒' : 'Set reminders'}</Link><button type="button" aria-expanded={calendar} className="min-h-11 rounded-full border border-dark/15 px-3 text-xs font-semibold" onClick={()=>setCalendar(!calendar)}>{zh ? '加入行事曆' : 'Add to calendar'}</button></div>{calendar && <div className="mt-4"><ThisWeekCalendar /></div>}</section>;
}
