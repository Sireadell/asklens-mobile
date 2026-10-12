import { profileFor } from './solanaBridge';
import { getLinkEvidence } from './evidence';
import { classifyAddress, Classified } from './classify';
import { getTokenRisk } from './tokenRisk';
import type { CheckResult, Evidence, InputKind, Verdict } from '../types';

const BASE =
  process.env.EXPO_PUBLIC_ASKLENS_URL ?? 'https://asklens-zoox.onrender.com/api/clipguard';

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;

/** Pull the first link or address out of shared text (shares often carry extra words). */
export function extractInput(raw: string): string {
  const text = raw.trim();
  const pay = text.match(/^solana:([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (pay) return pay[1];
  const url = text.match(/https?:\/\/[^\s<>"]+/i);
  if (url) return url[0].replace(/[).,;!?]+$/, '');
  const evm = text.match(/0x[a-fA-F0-9]{40}/);
  if (evm) return evm[0];
  const words = text.split(/\s+/);
  const sol = words.find((w) => SOL_RE.test(w));
  if (sol) return sol;
  return words[0] ?? text;
}

export function detectKind(input: string): InputKind {
  if (URL_RE.test(input)) return 'link';
  if (EVM_RE.test(input)) return 'evm-address';
  if (SOL_RE.test(input)) return 'solana-address';
  if (DOMAIN_RE.test(input)) return 'link';
  return 'unknown';
}

async function postJson(path: string, body: object, timeoutMs = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function fail(input: string, kind: InputKind, reason: string): CheckResult {
  return { input, kind, verdict: 'unknown', reasons: [reason], source: 'AskLens', checkedAt: Date.now() };
}

async function checkLink(input: string): Promise<CheckResult> {
  const url = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  // The live checkers and the phone's own evidence run side by side.
  const [live, evidence] = await Promise.all([
    postJson('check-url', { url }).catch(() => null),
    getLinkEvidence(input).catch(() => [] as Evidence[]),
  ]);
  const flagged = evidence.some((e) => e.level === 'bad');
  const warned = evidence.some((e) => e.level === 'warn');

  if (!live || !live.ok) {
    // Checkers did not answer. Still show what the phone found.
    const verdict: Verdict = flagged ? 'danger' : warned ? 'caution' : 'unknown';
    return {
      input,
      kind: 'link',
      verdict,
      reasons: [live?.data?.message ?? 'The live checkers did not answer. Try again for a full answer.'],
      source: 'Evidence read on this phone',
      checkedAt: Date.now(),
      evidence,
    };
  }
  const data = live.data;
  const overall: string = data.overall;
  let verdict: Verdict =
    overall === 'malicious' ? 'danger' : overall === 'suspicious' ? 'caution' : overall === 'safe' ? 'safe' : 'unknown';
  // Evidence can only make the answer worse, never better.
  if (flagged) verdict = 'danger';
  else if (warned && (verdict === 'safe' || verdict === 'unknown')) verdict = 'caution';
  const results: any[] = (data.results ?? []).filter((r: any) => r.ok);
  const reasons = results.map((r) => `${r.miner}: ${r.reason ?? r.verdict}`);
  if (!reasons.length) reasons.push('No checker could give a clear answer.');
  return {
    input,
    kind: 'link',
    verdict,
    reasons,
    source: `${data.answeredCount ?? results.length} of ${data.totalCount ?? 3} live checkers${
      flagged ? ' + lists by ScamSniffer and MetaMask' : ''
    }`,
    checkedAt: Date.now(),
    evidence,
  };
}

async function checkEvm(input: string): Promise<CheckResult> {
  const { ok, data } = await postJson('check-wallet', { address: input });
  if (!ok) return fail(input, 'evm-address', data?.message ?? 'The check service did not answer. Try again.');
  const overall: string = data.overall;
  const verdict: Verdict =
    overall === 'dangerous' ? 'danger' : overall === 'caution' ? 'caution' : overall === 'safe' ? 'safe' : 'unknown';
  const inconclusive = /INCONCLUSIVE/i.test(data.reason ?? '');
  return {
    input,
    kind: 'evm-address',
    verdict: inconclusive && verdict === 'safe' ? 'unknown' : verdict,
    reasons: [data.reason ?? 'No reason given.'],
    source: data.miner ?? 'Telegraph Sentinel',
    checkedAt: Date.now(),
  };
}

// The live service only accepts 0x addresses and no scam list covers Solana,
// so a Solana address never gets a "safe" stamp. The app first learns what the
// address IS (wallet, token, program), then shows facts from the network and
// free public sources. Honest answer is "Not sure" plus evidence.
const NO_LIST = 'No scam list covers Solana yet, so this is facts from the network and public sources, not a safety stamp.';

async function checkSolana(input: string): Promise<CheckResult> {
  let c: Classified | null = null;
  try {
    c = await classifyAddress(input);
  } catch {
    c = null;
  }
  const base = { input, kind: 'solana-address' as const, checkedAt: Date.now() };

  if (c?.kind === 'program') {
    return {
      ...base,
      verdict: 'caution',
      label: 'Program',
      reasons: ['This is a program (code that runs on Solana), not a normal wallet. Never send money to a program address.'],
      source: 'Solana network',
    };
  }

  if (c?.kind === 'token-mint' || (c?.kind === 'token-account' && c.mint)) {
    const mint = c.kind === 'token-mint' ? input : (c.mint as string);
    const risk = await getTokenRisk(mint, c.kind === 'token-mint' ? c : undefined);
    const reasons: string[] = [NO_LIST];
    if (c.kind === 'token-account') {
      reasons.unshift(`This is a token account, not a wallet. It holds ${risk.symbol ?? 'a token'} for the wallet ${shortAddr(c.holder)}.`);
    } else if (risk.symbol) {
      reasons.unshift(`This is the token ${risk.symbol}${risk.name && risk.name !== risk.symbol ? ` (${risk.name})` : ''}.`);
    } else {
      reasons.unshift('This is a token, not a wallet.');
    }
    return {
      ...base,
      verdict: risk.verdict,
      label: c.kind === 'token-mint' ? 'Token' : 'Token account',
      reasons,
      evidence: risk.lines,
      source: 'Solana network + RugCheck + DexScreener',
    };
  }

  if (c?.kind === 'unknown') {
    return {
      ...base,
      verdict: 'unknown',
      label: 'Account',
      reasons: [NO_LIST, 'This is a data account owned by another program. It is not a normal wallet or token.'],
      source: 'Solana network',
    };
  }

  // A normal wallet: show age, activity and holdings.
  const p = await profileFor(input);
  const reasons: string[] = [NO_LIST];
  let verdict: Verdict = 'unknown';
  if (p) {
    if (p.txCount === 0) {
      verdict = 'caution';
      reasons.push('Nothing has ever happened on this address. Be careful if someone told you to send money here.');
    } else {
      if (p.ageDays !== undefined) reasons.push(`About ${p.ageDays} days old, ${p.txCount >= 1000 ? '1000+' : p.txCount} transactions.`);
      if (p.ageDays !== undefined && p.ageDays < 7) verdict = 'caution';
    }
    if (p.solBalance !== undefined) reasons.push(`Holds ${p.solBalance.toFixed(3)} SOL.`);
    if (p.tokenCount !== undefined) {
      const top = (p.topHoldings ?? []).slice(0, 3).map((h: any) => h.symbol).join(', ');
      reasons.push(`${p.tokenCount} tokens${top ? `, mostly ${top}` : ''}.`);
    }
    for (const f of p.flags ?? []) if (/new wallet/i.test(f)) reasons.push(f);
    return { ...base, verdict, label: 'Wallet', reasons, source: 'Solana network + Zerion' };
  }
  return fail(input, 'solana-address', 'Could not read the Solana network right now. Try again.');
}

function shortAddr(a?: string): string {
  return a ? `${a.slice(0, 4)}...${a.slice(-4)}` : 'unknown';
}

export async function checkInput(text: string): Promise<CheckResult> {
  const input = extractInput(text);
  const kind = detectKind(input);
  try {
    if (kind === 'link') return await checkLink(input);
    if (kind === 'evm-address') return await checkEvm(input);
    if (kind === 'solana-address') return await checkSolana(input);
    return fail(input, 'unknown', 'That does not look like a link or a wallet address.');
  } catch (e: any) {
    const msg =
      e?.name === 'AbortError'
        ? 'The check took too long. Try again.'
        : 'Could not reach the check service. Check your connection.';
    return fail(input, kind, msg);
  }
}

// A link that is on a public malware list right now, for the demo button.
// It is only ever checked, never opened. Falls back to a fixed entry.
export async function getDemoBadLink(): Promise<string> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch('https://urlhaus.abuse.ch/downloads/text_online/', { signal: ctl.signal });
    clearTimeout(t);
    const line = (await res.text()).split(/\r?\n/).find((l) => /^http:\/\/\d/.test(l.trim()));
    if (line) return line.trim();
  } catch {}
  return 'http://123.12.8.15:34927/bin.sh';
}
