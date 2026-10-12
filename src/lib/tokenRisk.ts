import type { Evidence } from '../types';
import { cached, fetchJson, rpc, TOKEN_2022_PROGRAM } from './solRpc';

// Reads a Solana token from three free places at the same time: the Solana
// network itself (who controls the token), RugCheck (a public risk report)
// and DexScreener (does it trade, and how much money is behind it).
// Any one of them can fail. Whatever is missing is said out loud.

export interface TokenRisk {
  lines: Evidence[];
  /** 'danger' only when nobody can trade it. 'caution' for warnings. Otherwise 'unknown'. Never 'safe'. */
  verdict: 'danger' | 'caution' | 'unknown';
  liquidityUsd?: number;
  pairAgeDays?: number;
  rugScore?: number; // RugCheck normalised score, higher is riskier
  symbol?: string;
  name?: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

// Plain words for the RugCheck findings we know. Anything else is shown as RugCheck wrote it.
function rugLine(r: any): Evidence | null {
  const name: string = r.name ?? '';
  // These two repeat what we read straight from the network.
  if (/mint authority|freeze authority/i.test(name)) return null;
  const level = r.level === 'danger' ? 'bad' : 'warn';
  if (/single holder/i.test(name)) return { level, text: `One wallet holds ${r.value || 'a large part'} of all the tokens.` };
  if (/holder concentration/i.test(name)) return { level, text: 'A few wallets hold most of the tokens.' };
  if (/mutable metadata/i.test(name)) return { level: 'info', text: 'The creator can still change the token name and picture.' };
  if (/low liquidity/i.test(name)) return null; // already covered by the trading data
  return { level, text: r.description || name };
}

export async function getTokenRisk(mint: string, known?: { mintInfo?: any; token2022?: boolean }): Promise<TokenRisk> {
  const [net, rug, dex] = await Promise.all([
    known?.mintInfo
      ? Promise.resolve({ info: known.mintInfo, token2022: !!known.token2022 })
      : cached(`mint.${mint}`, async () => {
          const r = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
          return { info: r?.value?.data?.parsed?.info, token2022: r?.value?.owner === TOKEN_2022_PROGRAM };
        }).catch(() => null),
    cached(`rug.${mint}`, async () => {
      const url = `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;
      try {
        return await fetchJson(url);
      } catch {
        // This free service sometimes refuses back-to-back calls. One calm retry.
        await new Promise((r) => setTimeout(r, 800));
        return await fetchJson(url);
      }
    }).catch(() => null),
    cached(`dex.${mint}`, () => fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)).catch(() => null),
  ]);

  const lines: Evidence[] = [];
  let verdict: TokenRisk['verdict'] = 'unknown';
  const raise = (v: 'caution' | 'danger') => {
    if (v === 'danger' || verdict === 'unknown') verdict = v;
  };

  // Trading data first: it decides the headline.
  const pairs: any[] = dex?.pairs ?? [];
  const liquidityUsd = pairs.reduce((sum, p) => sum + Number(p.liquidity?.usd ?? 0), 0);
  const first = pairs.map((p) => Number(p.pairCreatedAt)).filter(Boolean).sort((a, b) => a - b)[0];
  const pairAgeDays = first ? Math.floor((Date.now() - first) / 86400000) : undefined;
  const base = pairs.find((p) => p.baseToken?.address === mint)?.baseToken ?? pairs[0]?.baseToken;

  // Big, established tokens (stablecoins, SKR) keep these powers on purpose, so the lines show but do not turn the answer amber alone.
  const deep = liquidityUsd >= 100000;
  const supply = net?.info?.supply !== undefined ? Number(net.info.supply) : undefined;
  const looksLikeNft = net?.info?.decimals === 0 && supply === 1;

  if (looksLikeNft) {
    lines.push({ level: 'info', text: 'This is a single collectible (an NFT), not a coin you can trade by the unit.' });
  } else if (!dex) {
    lines.push({ level: 'info', text: 'Could not read trading data right now.' });
  } else if (pairs.length === 0) {
    lines.push({ level: 'bad', text: 'Nobody can trade this token right now.' });
    raise('danger');
  } else if (liquidityUsd < 5000) {
    lines.push({ level: 'bad', text: `Very little money backs this token (${money(liquidityUsd)}). You may not be able to sell.` });
    raise('caution');
  } else {
    lines.push({ level: 'info', text: `About ${money(liquidityUsd)} of money backs trading of this token.` });
  }
  if (!looksLikeNft && pairAgeDays !== undefined && pairAgeDays < 2) {
    const hours = Math.max(1, Math.round((Date.now() - first!) / 3600000));
    lines.push({ level: 'warn', text: `Started trading ${hours} hour${hours === 1 ? '' : 's'} ago.` });
    raise('caution');
  }

  // Who controls the token, straight from the network.
  if (net?.info) {
    if (net.info.mintAuthority) {
      lines.push({
        level: !looksLikeNft && liquidityUsd < 10000 ? 'bad' : 'warn',
        text: 'The creator can still print more of this token at any time.',
      });
      if (!deep) raise('caution');
    }
    if (net.info.freezeAuthority) {
      lines.push({ level: 'warn', text: 'The creator can freeze your tokens.' });
      if (!deep) raise('caution');
    }
  } else {
    lines.push({ level: 'info', text: 'Could not read who controls this token.' });
  }

  // Newer-style tokens can hide extra rules inside them.
  const ext: string[] = (net?.info?.extensions ?? []).map((e: any) => e.extension);
  if (ext.includes('permanentDelegate')) {
    lines.push({ level: 'bad', text: 'Someone can take tokens out of any wallet holding this token.' });
    raise('caution');
  }
  if (ext.includes('transferFeeConfig')) {
    lines.push({ level: 'warn', text: 'Every transfer of this token pays a fee to its creator.' });
    raise('caution');
  }
  if (ext.includes('nonTransferable')) lines.push({ level: 'warn', text: 'This token cannot be sent to anyone else.' });

  // RugCheck's own findings, in plain words.
  let rugScore: number | undefined;
  if (rug) {
    rugScore = typeof rug.score_normalised === 'number' ? rug.score_normalised : undefined;
    const risks: any[] = (rug.risks ?? []).slice().sort((a: any, b: any) => (a.level === 'danger' ? -1 : 0) - (b.level === 'danger' ? -1 : 0));
    let shown = 0;
    for (const r of risks) {
      if (shown >= 2) break;
      const l = rugLine(r);
      if (l && !lines.some((x) => x.text === l.text)) {
        lines.push(l);
        shown++;
        if (l.level !== 'info') raise('caution');
      }
    }
  } else {
    lines.push({ level: 'info', text: 'No public risk report could be read for this token.' });
  }

  if (verdict === 'unknown' && !lines.some((l) => l.level !== 'info')) {
    lines.push({ level: 'info', text: 'No warning signs found. This is not a guarantee.' });
  }

  return { lines, verdict, liquidityUsd: pairs.length ? liquidityUsd : undefined, pairAgeDays, rugScore, symbol: base?.symbol, name: base?.name };
}
