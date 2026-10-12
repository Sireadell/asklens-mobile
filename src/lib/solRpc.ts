// Small shared helpers for reading the Solana network and free public sources.
// Every read has a time limit and is remembered for 10 minutes, so a demo on
// weak Wi-Fi still works and public servers are not hammered.

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {}

const RPC = process.env.EXPO_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const TTL = 10 * 60 * 1000;
const memory: Record<string, { at: number; value: any }> = {};

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', 'User-Agent': 'AskLensGuard/1.0', ...(init.headers as object) },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Run `load` unless a fresh answer for `key` is already remembered. Failures are not remembered. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memory[key];
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    const raw = await AsyncStorage?.getItem(`asklens.c.${key}`);
    if (raw) {
      const j = JSON.parse(raw);
      if (Date.now() - j.at < TTL) {
        memory[key] = j;
        return j.value;
      }
    }
  } catch {}
  const value = await load();
  const entry = { at: Date.now(), value };
  memory[key] = entry;
  try {
    await AsyncStorage?.setItem(`asklens.c.${key}`, JSON.stringify(entry));
  } catch {}
  return value;
}

export async function rpc(method: string, params: unknown[]): Promise<any> {
  const j = await fetchJson(
    RPC,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) },
    8000
  );
  if (j.error) throw new Error(j.error.message ?? 'RPC error');
  return j.result;
}

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
