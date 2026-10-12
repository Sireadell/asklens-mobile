'use strict';
// Decides whether copied text is worth sending. The whole copied text must BE
// a link or an address, so a paragraph that happens to contain one is ignored.
const LINK_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// A Solana address or token mint decodes to exactly 32 bytes. Checking that
// keeps ordinary long words and passwords from being mistaken for one.
function base58Length(text) {
  let n = 0n;
  for (const ch of text) {
    const v = BASE58.indexOf(ch);
    if (v < 0) return -1;
    n = n * 58n + BigInt(v);
  }
  let bytes = 0;
  while (n > 0n) { n >>= 8n; bytes++; }
  for (const ch of text) { if (ch === '1') bytes++; else break; }
  return bytes;
}

// Returns { kind, text } or null. Kinds match the relay: link, evm-address,
// solana-address (a token mint looks exactly like a Solana address).
function classify(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().replace(/^<(.+)>$/, '$1');
  if (!text || text.length > 2000) return null;
  if (LINK_RE.test(text)) {
    try { new URL(text); return { kind: 'link', text }; } catch { return null; }
  }
  if (EVM_RE.test(text)) return { kind: 'evm-address', text };
  if (text.length >= 32 && text.length <= 44 && base58Length(text) === 32) return { kind: 'solana-address', text };
  return null;
}

// Do not send the same thing twice within a short window.
function createDedupe(windowMs = 30000, now = Date.now) {
  const seen = new Map();
  return {
    isRepeat(key) {
      const t = now();
      for (const [k, at] of seen) if (t - at > windowMs) seen.delete(k);
      const hit = seen.has(key);
      seen.set(key, t);
      return hit;
    },
  };
}

module.exports = { classify, createDedupe, base58Length };
