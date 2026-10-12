// Address poisoning check. Pure rules, no phone or network code, so they can be tested alone.
// An attacker sends a tiny payment from an address that starts and ends like one you
// trust, hoping you copy it from your history later. These rules catch that.

export interface Contact {
  id: string;
  name: string;
  address: string;
  addedAt: number;
}

export type AddressMatch =
  | { kind: 'exact'; name: string; address: string; from: 'contact' | 'recent' }
  | { kind: 'lookalike'; name: string; address: string; from: 'contact' | 'recent' }
  | { kind: 'none' };

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

/** EVM addresses ignore letter case, Solana addresses do not. */
export function normalizeAddress(a: string): string {
  const t = a.trim();
  return EVM_RE.test(t) ? t.toLowerCase() : t;
}

function body(a: string): string {
  return a.startsWith('0x') ? a.slice(2) : a;
}

/** Number of single character edits between two strings (small inputs only). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** True when two different addresses look alike: same first 4 and last 4, or only a few characters apart. */
export function looksAlike(a: string, b: string): boolean {
  const x = normalizeAddress(a);
  const y = normalizeAddress(b);
  if (!x || !y || x === y) return false;
  // Different kinds of address (Solana vs 0x) never look alike.
  if (x.startsWith('0x') !== y.startsWith('0x')) return false;
  const bx = body(x);
  const by = body(y);
  if (bx.length < 8 || by.length < 8) return false;
  if (bx.slice(0, 4) === by.slice(0, 4) && bx.slice(-4) === by.slice(-4)) return true;
  return Math.abs(bx.length - by.length) <= 2 && editDistance(bx, by) <= 3;
}

export interface Known {
  name: string;
  address: string;
  from: 'contact' | 'recent';
}

/** Compare one address against known ones. An exact match wins over a look-alike. */
export function matchKnown(address: string, known: Known[]): AddressMatch {
  const target = normalizeAddress(address);
  if (!target) return { kind: 'none' };
  let alike: Known | null = null;
  for (const k of known) {
    if (normalizeAddress(k.address) === target) return { kind: 'exact', name: k.name, address: k.address, from: k.from };
    if (!alike && looksAlike(target, k.address)) alike = k;
  }
  return alike ? { kind: 'lookalike', name: alike.name, address: alike.address, from: alike.from } : { kind: 'none' };
}

/** Contacts first, then addresses the connected wallet dealt with lately. */
export function matchContacts(address: string, contacts: Contact[], recent: string[] = []): AddressMatch {
  const known: Known[] = [
    ...contacts.map((c) => ({ name: c.name, address: c.address, from: 'contact' as const })),
    ...recent.map((a) => ({ name: 'a recent address', address: a, from: 'recent' as const })),
  ];
  return matchKnown(address, known);
}

/** A believable look-alike of an address, for the demo: same start and end, a few middle characters changed. */
export function makeLookalike(address: string): string {
  const a = address.trim();
  const pre = a.startsWith('0x') ? 2 : 0;
  const start = pre + 4;
  const end = a.length - 4;
  if (end - start < 8) return a;
  const alphabet = pre ? '0123456789abcdef' : '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const chars = a.split('');
  for (const i of [start + 2, start + 6, end - 3]) {
    const pool = alphabet.replace(chars[i], '');
    chars[i] = pool[(i * 7) % pool.length];
  }
  return chars.join('');
}

export const SAMPLE_CONTACT_NAME = 'Mum';
// A well known public address, only used as a sample contact for the demo.
export const SAMPLE_CONTACT_ADDRESS = 'So11111111111111111111111111111111111111112';
