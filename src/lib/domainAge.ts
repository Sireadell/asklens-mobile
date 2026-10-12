import { registrable } from './lookalike';
// Loaded lazily so the same file can be tested from a plain script on a computer.
let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

const KEY = 'asklens.domainage.v1';
const DAY = 86400000;

type Cache = Record<string, { at: number; days: number | null }>;

async function readCache(): Promise<Cache> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * How many days ago the site name was registered, from the public RDAP
 * registry. Returns null when it cannot be read (slow registry, hidden date).
 */
export async function getDomainAgeDays(host: string): Promise<number | null> {
  const name = registrable(host);
  const cache = await readCache();
  const hit = cache[name];
  if (hit && Date.now() - hit.at < DAY) return hit.days;

  let days: number | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`https://rdap.org/domain/${name}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AskLensGuard/1.0' },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const ev = (j.events ?? []).find((e: any) => e.eventAction === 'registration');
      if (ev?.eventDate) days = Math.max(0, Math.floor((Date.now() - new Date(ev.eventDate).getTime()) / DAY));
    }
  } catch {
    return null; // do not cache a failure
  }
  if (days !== null) {
    cache[name] = { at: Date.now(), days };
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(cache));
    } catch {}
  }
  return days;
}
