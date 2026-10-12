// Builds src/data/blocklist.json: public lists of crypto scam sites, cut down
// to the ones that copy wallet and Solana names so the file stays small.
// Run once on a computer:  node scripts/make-blocklist.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const SOURCES = [
  {
    name: 'ScamSniffer scam-database',
    url: 'https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json',
    pick: (j) => (Array.isArray(j) ? j : j.domains ?? []),
  },
  {
    name: 'MetaMask eth-phishing-detect',
    url: 'https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json',
    pick: (j) => j.blacklist ?? [],
  },
];

const KEYWORDS =
  /phantom|solflare|solana|jup|bonk|raydium|seeker|backpack|moonshot|skr|marinade|kamino|magiceden|pumpfun|pump-fun|airdrop|sol-|-sol|solscan|saga/i;

async function get(url) {
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (res.ok) return await res.json();
      console.log(`  ${url} -> HTTP ${res.status}, try ${i}`);
    } catch (e) {
      console.log(`  ${url} -> ${e.message}, try ${i}`);
    }
  }
  throw new Error(`could not download ${url}`);
}

const all = new Set();
const used = [];
for (const s of SOURCES) {
  console.log(`Downloading ${s.name}...`);
  const list = s.pick(await get(s.url));
  let kept = 0;
  for (const raw of list) {
    const d = String(raw).trim().toLowerCase();
    if (d && KEYWORDS.test(d)) {
      all.add(d);
      kept++;
    }
  }
  console.log(`  ${list.length} domains, kept ${kept}`);
  used.push(s.name);
}

const domains = [...all].sort();
mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/blocklist.json', JSON.stringify({ builtAt: new Date().toISOString(), source: used, total: domains.length, domains }));
console.log(`Wrote src/data/blocklist.json with ${domains.length} domains`);
