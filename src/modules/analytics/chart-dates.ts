/** UTC buckets include zero-usage intervals; irregular observations must not compress time. */
export function chartDates(
  observed: string[],
  period: {
    from: string | null;
    to: string | null;
    bucket: "day" | "week" | "month";
  },
) {
  const unique = [...new Set(observed)].sort();
  if (!unique.length) return [];
  const floor = (value: string) => {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    if (period.bucket === "month") date.setUTCDate(1);
    if (period.bucket === "week")
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date;
  };
  const current = floor(period.from ?? unique[0]);
  const end = floor(period.to ?? unique[unique.length - 1]);
  const result: string[] = [];
  while (current <= end) {
    if (result.length >= 10000) return unique; // Extremely long ranges retain a true time axis.
    result.push(current.toISOString().slice(0, 10));
    if (period.bucket === "month")
      current.setUTCMonth(current.getUTCMonth() + 1);
    else
      current.setUTCDate(
        current.getUTCDate() + (period.bucket === "week" ? 7 : 1),
      );
  }
  return result;
}
