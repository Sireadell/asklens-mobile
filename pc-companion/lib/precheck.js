'use strict';
// Local check that runs on this PC before anything is sent. It blocks a link
// that is on your own blocklist or is an obvious fake of a popular crypto
// site, and warns when a new address looks like one you copied a moment ago
// (the "address poisoning" trick).
const fs = require('fs');

const POPULAR = [
  'phantom.app', 'solflare.com', 'metamask.io', 'uniswap.org', 'raydium.io', 'jup.ag',
  'binance.com', 'coinbase.com', 'opensea.io', 'pump.fun', 'magiceden.io', 'solana.com',
  'ledger.com', 'trezor.io', 'kraken.com', 'etherscan.io', 'solscan.io', 'dexscreener.com',
];

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function registrable(host) {
  return host.split('.').slice(-2).join('.');
}

function loadBlocklist(file) {
  try {
    return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));
  } catch { return new Set(); }
}

// Returns null when fine, or { why } when the link must not be sent.
function checkLink(text, blocklist = new Set()) {
  let u;
  try { u = new URL(text); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (blocklist.has(host) || blocklist.has(registrable(host)) || blocklist.has(text.toLowerCase())) {
    return { why: 'it is on your blocklist' };
  }
  if (u.username || u.password) return { why: 'the web address hides its real site behind an @ sign' };
  const reg = registrable(host);
  for (const real of POPULAR) {
    if (reg !== real && distance(reg, real) === 1) return { why: 'it looks like a fake of ' + real };
  }
  return null;
}

// Warns when an address shares its first 4 and last 4 characters with a
// different address copied within the last few minutes.
function createAddressWatch(windowMs = 5 * 60 * 1000, now = Date.now) {
  const recent = [];
  return {
    check(text) {
      const t = now();
      while (recent.length && t - recent[0].at > windowMs) recent.shift();
      const lower = text.toLowerCase();
      const hit = recent.find((r) => r.text !== lower && r.text.slice(0, 4) === lower.slice(0, 4) && r.text.slice(-4) === lower.slice(-4));
      recent.push({ text: lower, at: t });
      return hit ? { why: 'it looks almost the same as an address you copied a moment ago, but it is different' } : null;
    },
  };
}

module.exports = { checkLink, createAddressWatch, loadBlocklist, distance };
