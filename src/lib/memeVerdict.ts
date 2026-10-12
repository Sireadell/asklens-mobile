import { readMemeSources } from './tokenRisk';
import type { MemeSources } from './tokenRisk';

// Plain-word verdict for a pasted Solana coin address ("contract address").
// Facts come from Jupiter, the Solana network, DexScreener and RugCheck.
// Same facts in, same words out. Age always caps the answer: nothing under a day old is ever green.

export interface MemeReport {
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  ageText: string;
  priceText: string;
  change5mText: string;
  liquidityText: string;
  holders?: number;
  topHoldersPct?: number;
  devPct?: number;
  realBuyingPct?: number;
  verdict: 'safe' | 'caution' | 'danger' | 'unknown';
  sentence: string;
  reasons: string[];
  dexScreenerUrl: string;
  /** True while some source has not answered yet, or one failed or ran out of time. */
  partial: boolean;
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
const num = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const pct = (n: number) => (n >= 10 ? `${Math.round(n)}` : `${Math.round(n * 10) / 10}`);

export function formatAge(ms?: number): string {
  if (ms === undefined || ms < 0) return 'unknown age';
  if (ms < HOUR) {
    const m = Math.max(1, Math.round(ms / 60000));
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (ms < 2 * DAY) {
    const h = Math.round(ms / HOUR);
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  if (ms < 60 * DAY) return `${Math.floor(ms / DAY)} days`;
  if (ms < 730 * DAY) return `${Math.floor(ms / (30 * DAY))} months`;
  return `${Math.floor(ms / (365 * DAY))} years`;
}

export function formatMoney(n?: number): string {
  if (n === undefined) return 'unknown';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

export function formatPrice(p?: number): string {
  if (p === undefined) return 'unknown';
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p <= 0) return '$0';
  const digits = Math.min(12, Math.max(2, 1 - Math.floor(Math.log10(p))));
  return `$${p.toFixed(digits)}`;
}

export function formatChange(c?: number): string {
  if (c === undefined) return 'unknown';
  return `${c >= 0 ? '+' : ''}${(Math.round(c * 10) / 10).toFixed(1)}%`;
}

interface Reason {
  sev: 'red' | 'amber' | 'info';
  text: string;
  why?: string; // used in the headline sentence
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Builds the report from whatever sources have landed. Pure: same input, same output. */
export function buildMemeReport(mint: string, s: MemeSources, partial: boolean, now = Date.now(), checking = false): MemeReport {
  const jup = s.jupiter && !s.jupiter.none ? s.jupiter : null;
  const pairs: any[] = (s.dex?.pairs ?? []).filter((p: any) => !p.chainId || p.chainId === 'solana');
  const best = pairs.slice().sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))[0];
  const base = pairs.find((p) => p.baseToken?.address === mint)?.baseToken ?? best?.baseToken;
  const dexLoaded = !!s.dex;

  const name: string = String(jup?.name ?? base?.name ?? '').trim();
  const symbol: string = String(jup?.symbol ?? base?.symbol ?? '').trim();
  const label = name || symbol || 'This coin';

  // Age: the earliest start we can see.
  const starts: number[] = [];
  const jp = Date.parse(jup?.firstPool?.createdAt ?? '');
  if (Number.isFinite(jp)) starts.push(jp);
  for (const p of pairs) if (Number(p.pairCreatedAt) > 0) starts.push(Number(p.pairCreatedAt));
  const jc = Date.parse(jup?.createdAt ?? '');
  if (Number.isFinite(jc)) starts.push(jc);
  const ageMs = starts.length ? Math.max(0, now - Math.min(...starts)) : undefined;

  const liquidity = num(jup?.liquidity) ?? (pairs.length ? pairs.reduce((t, p) => t + Number(p.liquidity?.usd ?? 0), 0) : undefined);
  const holders = num(jup?.holderCount) ?? num(s.rug?.totalHolders);
  const topHoldersPct = num(jup?.audit?.topHoldersPercentage);
  const devPct = num(jup?.audit?.devBalancePercentage);
  const devMints = num(jup?.audit?.devMints);

  // How much of the buying looks like real people (Jupiter's own estimate).
  let realBuyingPct: number | undefined;
  for (const st of [jup?.stats5m, jup?.stats1h]) {
    const bv = num(st?.buyVolume);
    const bo = num(st?.buyOrganicVolume);
    if (bv && bv > 0 && bo !== undefined) {
      realBuyingPct = Math.min(100, Math.round((bo / bv) * 100));
      break;
    }
  }

  // Can it be sold? Buys but zero sells over the last hour is the honeypot sign.
  let buys: number | undefined;
  let sells: number | undefined;
  if (num(jup?.stats1h?.numBuys) !== undefined) {
    buys = jup.stats1h.numBuys;
    sells = num(jup.stats1h.numSells);
  } else if (best?.txns?.h1) {
    buys = num(best.txns.h1.buys);
    sells = num(best.txns.h1.sells);
  }
  const noSells = buys !== undefined && sells === 0 && buys >= 5;

  // Who controls the coin: the network itself first, Jupiter as a backup.
  const info = s.chain?.info;
  const mintOn: boolean | undefined = info ? !!info.mintAuthority : jup?.audit ? jup.audit.mintAuthorityDisabled === false : undefined;
  const freezeOn: boolean | undefined = info ? !!info.freezeAuthority : jup?.audit ? jup.audit.freezeAuthorityDisabled === false : undefined;
  const exts: any[] = info?.extensions ?? [];
  const ext = (n: string) => exts.find((e) => e.extension === n);

  const onCurve = pairs.some((p) => p.dexId === 'pumpfun' && p.baseToken?.address === mint);
  const pumpToken = mint.endsWith('pump');
  const established = (ageMs ?? 0) >= 30 * DAY && (liquidity ?? 0) >= 100000 && (holders ?? 0) >= 10000;

  const rs: Reason[] = [];
  const noData = !jup && !dexLoaded && !info && !s.rug;

  if (dexLoaded && pairs.length === 0 && !jup && s.jupiter !== undefined) rs.push({ sev: 'red', text: 'Nobody can trade this coin right now.' });
  if (noSells) rs.push({ sev: 'red', text: 'People are buying but nobody has sold. You may not be able to sell.' });
  if (ext('permanentDelegate')) rs.push({ sev: 'red', text: 'Someone can take coins out of any wallet that holds this one.' });
  if (ext('transferFeeConfig')) rs.push({ sev: 'red', text: 'Every transfer of this coin pays a fee to its creator.' });
  if (ext('transferHook')) rs.push({ sev: 'red', text: 'A hidden program runs on every transfer and can block selling.' });
  if (ext('defaultAccountState')?.state?.accountState === 'frozen') rs.push({ sev: 'red', text: 'New holders start with a frozen account and cannot move their coins.' });
  if (freezeOn) {
    rs.push({
      sev: established ? 'amber' : 'red',
      text: established ? 'The issuer can freeze coins in a wallet.' : 'The creator can freeze your coins, so you may not be able to sell.',
    });
  }
  if (mintOn) {
    rs.push({ sev: established ? 'amber' : 'red', text: established ? 'The issuer can still create more of this coin.' : 'The creator can still print more of this coin.' });
  }

  if (ageMs !== undefined && ageMs < DAY) {
    rs.push({ sev: 'amber', text: `Only ${formatAge(ageMs)} old.`, why: 'very new coins are the riskiest' });
  } else if (ageMs !== undefined && ageMs < 7 * DAY) {
    rs.push({ sev: 'amber', text: `Only ${formatAge(ageMs)} old.`, why: 'it is less than a week old' });
  }
  if (!established) {
    if (topHoldersPct !== undefined && topHoldersPct > 30) {
      rs.push({
        sev: 'amber',
        text:
          onCurve || pumpToken
            ? `Top holders own ${pct(topHoldersPct)}%. On pump.fun part of that is the launch pool, not a person.`
            : `Top wallets hold ${pct(topHoldersPct)}% of all coins.`,
      });
    }
    if (devPct !== undefined && devPct > 10) rs.push({ sev: 'amber', text: `The creator still holds ${pct(devPct)}% of all coins.` });
    if (devMints !== undefined && devMints > 3) rs.push({ sev: 'amber', text: `The creator has launched ${devMints} other coins.` });
    if (jup?.organicScoreLabel === 'low') {
      rs.push({
        sev: 'amber',
        text: realBuyingPct !== undefined ? `Only about ${realBuyingPct}% of recent buying looks real.` : 'Much of the trading looks fake.',
      });
    }
  }
  if (liquidity !== undefined && liquidity < 10000 && pairs.length + (jup ? 1 : 0) > 0) {
    rs.push({ sev: 'amber', text: `Only ${formatMoney(liquidity)} backs trading. A big sale may not go through.` });
  }
  // RugCheck: one serious finding in its own words, skipping what we already say.
  const rugRisk = (established ? [] : s.rug?.risks ?? []).find((r: any) => r.level === 'danger' && !/mint authority|freeze authority|low liquidity|mutable metadata/i.test(r.name ?? ''));
  if (rugRisk) rs.push({ sev: 'amber', text: String(rugRisk.description || rugRisk.name) });
  if ((s.rug?.risks ?? []).some((r: any) => /mutable metadata/i.test(r.name ?? ''))) {
    rs.push({ sev: 'info', text: 'The creator can still change the name and picture.' });
  }

  const order = { red: 0, amber: 1, info: 2 } as const;
  rs.sort((a, b) => order[a.sev] - order[b.sev]);
  const top = rs[0];

  let verdict: MemeReport['verdict'];
  if (noData) verdict = 'unknown';
  else if (rs.some((r) => r.sev === 'red')) verdict = 'danger';
  else if (rs.some((r) => r.sev === 'amber')) verdict = 'caution';
  else if (ageMs !== undefined && ageMs >= 7 * DAY && (jup || dexLoaded)) verdict = 'safe';
  else verdict = 'unknown';

  const ageWord = formatAge(ageMs);
  const prefix = ageMs !== undefined ? `${label} is ${ageWord} old${onCurve ? ' and still on pump.fun' : ''}` : label;
  const because = top ? top.why ?? lower(top.text) : '';
  // While sources are still answering, a green result could flip once the rest lands. Hold it back.
  if (checking && verdict === 'safe') verdict = 'unknown';
  let sentence: string;
  if (verdict === 'danger') sentence = `${prefix} and looks very high risk because ${because}`;
  else if (verdict === 'caution') sentence = `${prefix} and needs care because ${because}`;
  else if (verdict === 'safe') sentence = `${label} has traded for ${ageWord} and no warning signs were found (not a guarantee).`;
  else if (checking) sentence = 'Checking...';
  else sentence = noData ? 'Could not read this coin right now. Try again in a moment.' : `${label} is not clearly safe or unsafe: not enough was found to judge it.`;
  if (verdict === 'danger' || verdict === 'caution') {
    if (!sentence.endsWith('.')) sentence += '.';
  }

  const change = num(jup?.stats5m?.priceChange) ?? num(best?.priceChange?.m5);
  const price = num(jup?.usdPrice) ?? (best?.priceUsd !== undefined ? Number(best.priceUsd) : undefined);

  return {
    mint,
    name,
    symbol,
    imageUrl: jup?.icon ?? best?.info?.imageUrl,
    ageText: ageMs === undefined ? 'unknown' : ageWord,
    priceText: formatPrice(Number.isFinite(price as number) ? price : undefined),
    change5mText: formatChange(change),
    liquidityText: formatMoney(liquidity),
    holders,
    topHoldersPct,
    devPct,
    realBuyingPct,
    verdict,
    sentence,
    reasons: rs.slice(0, 4).map((r) => r.text),
    dexScreenerUrl: `https://dexscreener.com/solana/${mint}`,
    partial,
  };
}

/**
 * Reads the four sources at once and calls onUpdate with a better report as each lands.
 * Each source has a 2.5 second cut-off. Resolves with the final report.
 */
export async function checkMeme(mint: string, onUpdate?: (r: MemeReport) => void): Promise<MemeReport> {
  const { sources, missing } = await readMemeSources(mint, (_name, _v, all) => {
    if (!onUpdate) return;
    const landed = (['jupiter', 'chain', 'dex', 'rug'] as const).filter((k) => all[k] !== undefined).length;
    onUpdate(buildMemeReport(mint, all, landed < 4 || Object.values(all).some((v) => v === null), Date.now(), landed < 4));
  });
  return buildMemeReport(mint, sources, missing.length > 0);
}
