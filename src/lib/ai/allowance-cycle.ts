function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addUtcMonthsClamped(date: Date, months: number): Date {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), daysInUtcMonth(year, month)),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export function monthlyCycle(anchor: Date, now = new Date()): { start: Date; end: Date } {
  if (anchor > now) return { start: anchor, end: addUtcMonthsClamped(anchor, 1) };
  let months =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  let start = addUtcMonthsClamped(anchor, months);
  if (start > now) start = addUtcMonthsClamped(anchor, --months);
  let end = addUtcMonthsClamped(anchor, months + 1);
  while (end <= now) {
    months += 1;
    start = end;
    end = addUtcMonthsClamped(anchor, months + 1);
  }
  return { start, end };
}
