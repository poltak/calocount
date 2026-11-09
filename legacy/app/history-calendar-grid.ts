export type CalendarCell = {
  date: string;
  dayOfMonth: number;
};

/** The weeks of a YYYY-MM month, Monday first. A slot outside the month is null. */
export function calendarWeeks(month: string): (CalendarCell | null)[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(0);
  first.setUTCFullYear(year, monthNumber - 1, 1);
  const last = new Date(0);
  last.setUTCFullYear(year, monthNumber, 0);
  const leadingSlots = (first.getUTCDay() + 6) % 7;
  const slots: (CalendarCell | null)[] = Array.from({ length: leadingSlots }, () => null);
  for (let dayOfMonth = 1; dayOfMonth <= last.getUTCDate(); dayOfMonth++) {
    slots.push({ date: `${month}-${String(dayOfMonth).padStart(2, "0")}`, dayOfMonth });
  }
  while (slots.length % 7 !== 0) slots.push(null);
  return Array.from({ length: slots.length / 7 }, (_, week) => slots.slice(week * 7, week * 7 + 7));
}
