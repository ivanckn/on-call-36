// Disruption trigger sources. The demo runs on a simulated event; these two read real data so judges can see where
// a trigger would come from. HKO open data is called from the browser (it allows any origin, no key).
// OAG flight status goes through the local model service so the key never reaches the browser.
import { SERVICE } from './live';

export type Impact = 'severe' | 'high' | 'watch' | 'info';
export type Lang = 'en' | 'tc';

export interface HkoWarning { group: string; code: string; name: string; issued: string | null; impact: Impact; effect: string }
export interface HkoDay { date: string; week: string; weather: string; max: number | null; min: number | null; psr: string; watch: boolean }
export interface HkoReading { fetchedAt: string; warnings: HkoWarning[]; forecast: HkoDay[]; cached: boolean }

const HKO = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';

/** What an HKO warning means for cargo handling at the airport. A rule of thumb for the demo; the airport's own procedures decide. */
export function impactOf(group: string, code: string): { impact: Impact; effect: string } {
  if (group === 'WTCSGNL') {
    if (/^TC(8|9|10)/.test(code)) return { impact: 'severe', effect: 'hko.eff.tc8' };
    if (code === 'TC3') return { impact: 'high', effect: 'hko.eff.tc3' };
    return { impact: 'watch', effect: 'hko.eff.tc1' };
  }
  if (group === 'WRAIN') return code === 'WRAINA' ? { impact: 'watch', effect: 'hko.eff.rainAmber' } : { impact: 'high', effect: 'hko.eff.rainRed' };
  if (group === 'WTS') return { impact: 'high', effect: 'hko.eff.ts' };
  if (group === 'WHOT' || group === 'WCOLD') return { impact: 'watch', effect: 'hko.eff.temp' };
  if (group === 'WMSGNL') return { impact: 'watch', effect: 'hko.eff.wind' };
  return { impact: 'info', effect: 'hko.eff.other' };
}

/** HKO warnsum: {group: {name, code, actionCode, issueTime}}. Cancelled warnings are dropped. */
export function parseWarnings(raw: unknown): HkoWarning[] {
  if (!raw || typeof raw !== 'object') return [];
  const rank: Record<Impact, number> = { severe: 0, high: 1, watch: 2, info: 3 };
  return Object.entries(raw as Record<string, Record<string, string>>)
    .filter(([, w]) => w && typeof w === 'object' && w.actionCode !== 'CANCEL')
    .map(([group, w]) => ({ group, code: w.code ?? group, name: w.name ?? group, issued: w.issueTime ?? null, ...impactOf(group, w.code ?? group) }))
    .sort((a, b) => rank[a.impact] - rank[b.impact]);
}

const WATCH_WORDS = /thunderstorm|squall|tropical cyclone|typhoon|heavy rain|雷暴|颮|熱帶氣旋|颱風|大雨/i;

export function parseForecast(raw: unknown): HkoDay[] {
  const list = (raw as { weatherForecast?: Record<string, unknown>[] })?.weatherForecast ?? [];
  return list.map((d) => {
    const weather = String(d.forecastWeather ?? '');
    const psr = String(d.PSR ?? '');
    return {
      date: String(d.forecastDate ?? ''), week: String(d.week ?? ''), weather, psr,
      max: (d.forecastMaxtemp as { value?: number })?.value ?? null, min: (d.forecastMintemp as { value?: number })?.value ?? null,
      watch: WATCH_WORDS.test(weather) || psr === 'High' || psr === '高',
    };
  });
}

/** Would this reading open an incident on its own? */
export const hkoTriggers = (r: HkoReading | null) => !!r && r.warnings.some((w) => w.impact === 'severe' || w.impact === 'high');

const cacheKey = (lang: Lang) => `oncall36:hko:${lang}`;

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Live HKO reading; falls back to the last one saved in this browser, or null. */
export async function readHko(lang: Lang): Promise<HkoReading | null> {
  try {
    const [warn, fnd] = await Promise.all([getJson(`${HKO}?dataType=warnsum&lang=${lang}`, 6000), getJson(`${HKO}?dataType=fnd&lang=${lang}`, 6000)]);
    const reading: HkoReading = { fetchedAt: new Date().toISOString(), warnings: parseWarnings(warn), forecast: parseForecast(fnd), cached: false };
    try { localStorage.setItem(cacheKey(lang), JSON.stringify(reading)); } catch { /* storage unavailable */ }
    return reading;
  } catch {
    try {
      const raw = localStorage.getItem(cacheKey(lang));
      return raw ? { ...(JSON.parse(raw) as HkoReading), cached: true } : null;
    } catch {
      return null;
    }
  }
}

export interface OagStatusFlight {
  flight: string; origin: string; dest: string; schedLocal: string; aircraft: string | null; freighter: boolean;
  hasStatus: boolean; state: string | null; latestKind: 'actual' | 'estimated' | null; delayMinutes: number | null;
}
export type OagStatus =
  | { ok: true; date: string; fetchedAt: string; incidentMinutes: number; flights: OagStatusFlight[]; withStatus: number; incidents: string[] }
  | { ok: false; date?: string; reason: 'missingKey' | 'rateLimited' | 'unreachable' | 'serviceDown' | string };

export async function readOagStatus(): Promise<OagStatus> {
  try {
    return (await getJson(`${SERVICE}/status/oag`, 30000)) as OagStatus;
  } catch {
    return { ok: false, reason: 'serviceDown' };
  }
}
