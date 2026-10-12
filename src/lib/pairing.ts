import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import { checkInput } from './asklens';
import { recordCheck } from './store';
import { allowanceNow } from './guard';
import type { CheckResult } from '../types';

// Where the relay lives. Set EXPO_PUBLIC_RELAY_URL at build time to change it.
export const RELAY_URL: string = (process.env.EXPO_PUBLIC_RELAY_URL ?? 'https://asklens-relay.onrender.com').replace(/\/+$/, '');

const PAIR_KEY = 'asklens.pair.v1';
const SINCE_KEY = 'asklens.pair.since.v1';
const POLL_TIMEOUT_MS = 32000; // the relay holds a request for up to 25 seconds

export interface Pairing {
  relay: string;
  pairId: string;
  secret: string;
}

export interface PcItem {
  id: string;
  ts: number;
  kind: 'link' | 'evm-address' | 'solana-address';
  text: string;
  /** null while the check is running */
  result: CheckResult | null;
}

export type FeedStatus = 'off' | 'connecting' | 'live' | 'offline' | 'paused' | 'expired';

export const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Read the QR text the PC shows: {relay, pairId, secret, code}. */
export function parsePairQr(data: string): { relay: string; pairId: string; secret: string; code?: string } | null {
  try {
    const j = JSON.parse(data);
    if (j && typeof j.relay === 'string' && typeof j.pairId === 'string' && typeof j.secret === 'string') {
      if (!/^https?:\/\//i.test(j.relay)) return null;
      return { relay: j.relay.replace(/\/+$/, ''), pairId: j.pairId, secret: j.secret, code: j.code };
    }
  } catch {}
  return null;
}

// ---------- storage ----------

export async function loadPairing(): Promise<Pairing | null> {
  try {
    const raw = await AsyncStorage.getItem(PAIR_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p?.relay && p?.pairId && p?.secret ? (p as Pairing) : null;
  } catch {
    return null;
  }
}

async function savePairing(p: Pairing): Promise<void> {
  await AsyncStorage.setItem(PAIR_KEY, JSON.stringify(p));
  await AsyncStorage.removeItem(SINCE_KEY).catch(() => {});
}

// ---------- calls to the relay ----------

async function relayFetch(
  relay: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: object },
  timeoutMs = 15000,
  outer?: AbortSignal
): Promise<{ ok: boolean; status: number; data: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onOuter = () => ctl.abort();
  outer?.addEventListener('abort', onOuter);
  try {
    const res = await fetch(`${relay}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

const GONE = [401, 403, 404, 410];

/** Link by typing the 8 character code. */
export async function claimCode(code: string, relay = RELAY_URL): Promise<Pairing> {
  const c = cleanCode(code);
  if (!CODE_RE.test(c)) throw new Error('The code is 8 characters, letters and numbers. Check it and try again.');
  let r;
  try {
    r = await relayFetch(relay, '/v1/claim', { method: 'POST', body: { code: c } });
  } catch {
    throw new Error('Could not reach the link service. Check your connection and try again.');
  }
  if (!r.ok || !r.data?.pairId || !r.data?.secret) {
    if (GONE.includes(r.status)) throw new Error('That code is wrong or has run out. Start again on your PC to get a new one.');
    throw new Error('The link service said no. Start again on your PC to get a new code.');
  }
  const p = { relay, pairId: String(r.data.pairId), secret: String(r.data.secret) };
  await savePairing(p);
  return p;
}

/** Link by QR: the QR already holds the keys, so there is nothing to claim. */
export async function adoptQr(data: string): Promise<Pairing> {
  const q = parsePairQr(data);
  if (!q) throw new Error('That QR code is not from the AskLens PC helper.');
  const p = { relay: q.relay, pairId: q.pairId, secret: q.secret };
  await savePairing(p);
  return p;
}

export async function unlink(): Promise<void> {
  feed.stop();
  const p = await loadPairing();
  try {
    await AsyncStorage.multiRemove([PAIR_KEY, SINCE_KEY]);
  } catch {}
  feed.reset();
  if (p) {
    relayFetch(p.relay, '/v1/unpair', { method: 'POST', headers: { 'x-pair-secret': p.secret }, body: { pairId: p.pairId } }, 6000).catch(() => {});
  }
}

// ---------- notifications ----------

export type PushState = 'on' | 'denied' | 'unavailable';

/** Ask for permission and tell the relay the phone's push address. Never throws. */
export async function enablePush(p: Pairing): Promise<PushState> {
  try {
    const Notifications = require('expo-notifications');
    const cur = await Notifications.getPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain !== false) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return 'denied';
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const tok = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const r = await relayFetch(p.relay, '/v1/push-token', {
      method: 'POST',
      headers: { 'x-pair-secret': p.secret },
      body: { pairId: p.pairId, pushToken: tok.data },
    });
    return r.ok ? 'on' : 'unavailable';
  } catch {
    // Most often: this build has no Firebase file yet. The live feed still works.
    return 'unavailable';
  }
}

// ---------- the live feed ----------

type Listener = () => void;
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

class Feed {
  items: PcItem[] = [];
  status: FeedStatus = 'off';
  private listeners = new Set<Listener>();
  private running = false;
  private runId = 0;
  private ctl: AbortController | null = null;
  private seen = new Set<string>();
  private since = 0;
  private appSub: { remove(): void } | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }
  private setStatus(s: FeedStatus) {
    if (this.status !== s) {
      this.status = s;
      this.emit();
    }
  }

  reset() {
    this.items = [];
    this.seen.clear();
    this.since = 0;
    this.status = 'off';
    this.emit();
  }

  /** Start listening. Safe to call again; it only starts once. */
  async start() {
    if (this.running) return;
    const p = await loadPairing();
    if (!p) {
      this.setStatus('off');
      return;
    }
    if (this.running) return;
    this.running = true;
    const id = ++this.runId;
    try {
      this.since = Number(await AsyncStorage.getItem(SINCE_KEY)) || 0;
    } catch {}
    this.setStatus(AppState.currentState === 'active' ? 'connecting' : 'paused');
    this.appSub?.remove();
    this.appSub = AppState.addEventListener('change', (s) => {
      if (!this.running) return;
      if (s === 'active') {
        if (this.status === 'paused') this.setStatus('connecting');
      } else {
        this.setStatus('paused');
        this.ctl?.abort(); // stop polling in the background
      }
    });
    this.loop(id, p).catch(() => {});
  }

  stop() {
    this.running = false;
    this.runId++;
    this.ctl?.abort();
    this.appSub?.remove();
    this.appSub = null;
    if (this.status !== 'expired') this.setStatus('off');
  }

  private async loop(id: number, p: Pairing) {
    let failures = 0;
    while (this.running && id === this.runId) {
      if (AppState.currentState !== 'active') {
        await sleep(500);
        continue;
      }
      this.ctl = new AbortController();
      try {
        const r = await relayFetch(
          p.relay,
          `/v1/events?pairId=${encodeURIComponent(p.pairId)}&since=${this.since}`,
          { headers: { 'x-pair-secret': p.secret } },
          POLL_TIMEOUT_MS,
          this.ctl.signal
        );
        if (id !== this.runId) return;
        if (GONE.includes(r.status)) {
          this.running = false;
          this.appSub?.remove();
          this.appSub = null;
          this.setStatus('expired');
          return;
        }
        if (!r.ok) throw new Error('relay ' + r.status);
        failures = 0;
        this.setStatus('live');
        const list: any[] = Array.isArray(r.data?.items) ? r.data.items : [];
        for (const it of list) this.take(it);
      } catch {
        if (id !== this.runId) return;
        if (AppState.currentState !== 'active') continue; // stopped on purpose
        failures += 1;
        this.setStatus('offline');
        await sleep(Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5)));
      }
    }
  }

  private take(raw: any) {
    const id = String(raw?.id ?? '');
    const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
    const ts = Number(raw?.ts) || Date.now();
    if (ts > this.since) {
      this.since = ts;
      AsyncStorage.setItem(SINCE_KEY, String(ts)).catch(() => {});
    }
    if (!id || !text || this.seen.has(id)) return;
    this.seen.add(id);
    const item: PcItem = { id, ts, kind: raw.kind, text, result: null };
    this.items = [item, ...this.items].slice(0, 50);
    this.emit();
    this.runCheck(item);
  }

  private async runCheck(item: PcItem) {
    let r: CheckResult;
    try {
      const a = await allowanceNow();
      if (a.used >= a.limit) {
        r = {
          input: item.text,
          kind: 'unknown',
          verdict: 'unknown',
          reasons: [`You have used all ${a.limit} checks for today. They come back tomorrow.`],
          source: 'AskLens Guard',
          checkedAt: Date.now(),
        };
      } else {
        r = { ...(await checkInput(item.text)), fromPc: true };
        await recordCheck(r);
      }
    } catch {
      r = {
        input: item.text,
        kind: 'unknown',
        verdict: 'unknown',
        reasons: ['The check did not finish. Tap to try again.'],
        source: 'AskLens Guard',
        checkedAt: Date.now(),
      };
    }
    this.items = this.items.map((i) => (i.id === item.id ? { ...i, result: r } : i));
    this.emit();
  }
}

export const feed = new Feed();
