import { useMemo, useState } from 'react';

export const RANGE_PRESETS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Inclusive UTC range ending today, matching how the Insights Service interprets `from`/`to`. */
export function rangeForDays(days: number, now = new Date()) {
  const to = ymd(now);
  const from = ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * DAY_MS));
  return { from, to };
}

export function useDateRange(initialDays = 30) {
  const [days, setDays] = useState<number>(initialDays);
  const range = useMemo(() => rangeForDays(days), [days]);
  return { days, setDays, ...range };
}
