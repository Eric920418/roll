import { addCalendarDays, type CalendarEntry } from "./schema";

const utc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dates = (entry: CalendarEntry) => entry.startsAt && entry.endsAt
  ? [utc(entry.startsAt), utc(entry.endsAt)]
  : [entry.date.replaceAll("-", ""), addCalendarDays(entry.date, 1).replaceAll("-", "")];
export function googleCalendarUrl(entry: CalendarEntry) {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: entry.title, dates: dates(entry).join("/"), details: entry.note, ctz: "Asia/Taipei" })}`;
}
const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
export function calendarIcs(entries: CalendarEntry[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ROLL ON//NOVA//EN", "CALSCALE:GREGORIAN", ...entries.filter(entry => entry.available).flatMap(entry => {
    const [start, end] = dates(entry), type = entry.startsAt ? "" : ";VALUE=DATE";
    return ["BEGIN:VEVENT", `UID:${entry.id}@rollgrp.com`, `DTSTAMP:${utc(now.toISOString())}`, `DTSTART${type}:${start}`, `DTEND${type}:${end}`, `SUMMARY:${escape(entry.title)}`, `DESCRIPTION:${escape(entry.note)}`, "END:VEVENT"];
  }), "END:VCALENDAR"];
  // iCalendar folds lines at 75 UTF-8 octets, including the continuation space.
  return lines.map(line => {
    let folded = "", width = 0;
    for (const character of line) { const size = new TextEncoder().encode(character).length; if (width + size > 75) { folded += "\r\n "; width = 1; } folded += character; width += size; }
    return folded;
  }).join("\r\n") + "\r\n";
}
