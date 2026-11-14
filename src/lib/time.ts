// Scenario hours are relative to T0 and rendered as clock times from a fixed base date, so the demo is stable.
import type { Locale } from '../model/text';

/** T0: cancellations announced. A fixed date keeps the demo stable. */
const T0 = new Date('2026-11-14T06:00:00');

export function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return '—';
  const r = Math.round(h * 2) / 2;
  return Number.isInteger(r) ? `${r}` : r.toFixed(1);
}
const DAYS: Record<Locale, string[]> = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], zh: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] };
const pad = (n: number) => String(n).padStart(2, '0');

export function toDate(hours: number): Date {
  return new Date(T0.getTime() + hours * 3_600_000);
}

/** "Tue 09:00" */
export function fmtClock(hours: number | null | undefined, locale: Locale = 'en'): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  const d = toDate(hours);
  return `${DAYS[locale][d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "T+72h" */
export function fmtT(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  return `T${hours < 0 ? '−' : '+'}${fmtHours(Math.abs(hours))}h`;
}

/** "Tue 09:00 (T+75h)" */
export function fmtBoth(hours: number | null | undefined, locale: Locale = 'en'): string {
  return hours === null || hours === undefined ? '—' : `${fmtClock(hours, locale)} (${fmtT(hours)})`;
}

export function fmtKgNum(kg: number): string {
  return Math.round(kg).toLocaleString('en-US');
}

export function fmtLocal(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

