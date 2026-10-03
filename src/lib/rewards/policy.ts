export const REWARD_RULES = { visit: 5, action: 30, quiz: 50, profile: 50, redemptionPoints: 100, redemptionCredits: 5, monthlyCredits: 20, dailyActions: 2 } as const;
export const REWARD_TIME_ZONE = "Asia/Taipei";
export function rewardKeys(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: REWARD_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return { day, month: day.slice(0, 7) };
}
export const PROFILE_REWARD_FIELDS = ["companyName", "industry", "country", "oneLinePitch", "companyStage", "primaryNeed"] as const;
export function completeRewardProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== "object") return false;
  return PROFILE_REWARD_FIELDS.every(key => typeof (profile as Record<string, unknown>)[key] === "string" && Boolean(((profile as Record<string, string>)[key]).trim()));
}
export function validReminderTime(value: string) { return /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value); }
export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
// Pick the next local calendar day occurrence. Spring gaps use the first available
// local minute after the selected time; fall overlaps send once, at the first occurrence.
export function nextReminderAt(time: string, timeZone: string, now = new Date()): Date {
  if (!validReminderTime(time) || !validTimeZone(timeZone)) throw new Error("無效提醒時間或時區 / Invalid reminder time or time zone");
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const local = (date: Date) => {
    const parts = format.formatToParts(date), p = (t: string) => parts.find(v => v.type === t)!.value;
    return { day: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
  };
  const current = local(now);
  const targetDay = current.time < time ? current.day : new Date(Date.parse(`${current.day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const start = Math.floor(now.getTime() / 60000) * 60000 + 60000;
  for (let minute = 0; minute < 60 * 50; minute++) {
    const candidate = new Date(start + minute * 60000), wall = local(candidate);
    if (wall.day === targetDay && wall.time >= time) return candidate;
  }
  throw new Error("無法計算下一次提醒 / Could not schedule the next reminder");
}
export function validQuizAnswers(selected: { id: string; options: unknown[] }[], answers: { questionId: string; choice: number }[]): boolean {
  return selected.length > 0 && answers.length === selected.length && new Set(answers.map(a => a.questionId)).size === selected.length && selected.every(q => answers.some(a => a.questionId === q.id && Number.isInteger(a.choice) && a.choice >= 0 && a.choice < q.options.length));
}
