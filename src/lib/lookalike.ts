// Spots sites that copy the name of a real wallet or exchange.

const BRANDS = [
  'phantom.app',
  'solflare.com',
  'jup.ag',
  'raydium.io',
  'magiceden.io',
  'backpack.app',
  'solanamobile.com',
  'solana.com',
  'binance.com',
  'metamask.io',
  'coinbase.com',
  'telegram.org',
];

// Brand words long enough to be safe to look for inside another name.
const WORDS = ['phantom', 'solflare', 'raydium', 'magiceden', 'metamask', 'coinbase', 'binance', 'solanamobile', 'telegram'];

const TWO_PART_TLDS = new Set(['co.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'com.ng', 'co.za']);

/** The name you would buy: "claim.phantom-app.xyz" gives "phantom-app.xyz". */
export function registrable(host: string): string {
  const parts = host.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return TWO_PART_TLDS.has(last2) ? parts.slice(-3).join('.') : last2;
}

function distance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Returns the real brand this host is copying, or null. */
export function lookalikeOf(host: string): string | null {
  const reg = registrable(host);
  // The real site, or one of its own subdomains, is fine.
  if (BRANDS.some((b) => reg === b)) return null;
  for (const b of BRANDS) {
    const d = distance(reg, b);
    if (d >= 1 && d <= 2 && b.length >= 8) return b;
  }
  const label = reg.split('.').slice(0, -1).join('.');
  const squashed = label.replace(/[-_.]/g, '');
  for (const w of WORDS) {
    if (squashed.includes(w)) return BRANDS.find((b) => b.startsWith(w)) ?? w;
  }
  return null;
}

export function isPunycode(host: string): boolean {
  return host.toLowerCase().split('.').some((p) => p.startsWith('xn--'));
}
