import type { Evidence } from '../types';

// GoPlus Security gives a free second opinion on Ethereum style addresses.
// It can only make an answer worse, never better, same as the other evidence.
const BAD: Record<string, string> = {
  sanctioned: 'is on a sanctions list',
  phishing_activities: 'has been used in phishing',
  stealing_attack: 'has been used to steal funds',
  cybercrime: 'is linked to cybercrime',
  money_laundering: 'is linked to money laundering',
  financial_crime: 'is linked to financial crime',
  darkweb_transactions: 'has dark web transactions',
  blackmail_activities: 'is linked to blackmail',
  malicious_mining_activities: 'is linked to malicious mining',
  fake_token: 'is linked to fake tokens',
  honeypot_related_address: 'is linked to honeypot tokens, where you can buy but not sell',
  fake_kyc: 'is linked to fake identity checks',
};

const WARN: Record<string, string> = {
  mixer: 'has used a mixer, which hides where money came from',
  blacklist_doubt: 'is doubted by blacklist sources',
  gas_abuse: 'shows fee abuse',
  reinit: 'is a contract that can be re-initialised',
  fake_standard_interface: 'is a contract with a fake standard interface',
};

/** Turns GoPlus's answer into plain evidence lines. Returns null if the answer is unreadable. */
export function readGoPlusAddress(json: any): Evidence[] | null {
  if (!json || json.code !== 1 || !json.result || typeof json.result !== 'object') return null;
  const r = json.result;
  const out: Evidence[] = [];
  for (const [key, text] of Object.entries(BAD)) {
    if (String(r[key]) === '1') out.push({ level: 'bad', text: `GoPlus: this address ${text}.` });
  }
  const mal = Number(r.number_of_malicious_contracts_created);
  if (Number.isFinite(mal) && mal > 0) {
    out.push({ level: 'bad', text: `GoPlus: this address created ${mal} malicious contract${mal === 1 ? '' : 's'}.` });
  }
  for (const [key, text] of Object.entries(WARN)) {
    if (String(r[key]) === '1') out.push({ level: 'warn', text: `GoPlus: this address ${text}.` });
  }
  if (!out.length) out.push({ level: 'info', text: 'GoPlus: no warning flags on this address.' });
  return out;
}

/** Asks GoPlus about an Ethereum style address. Never throws, returns null if it did not answer. */
export async function fetchGoPlusAddress(address: string, timeoutMs = 10000): Promise<Evidence[] | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.gopluslabs.io/api/v1/address_security/${encodeURIComponent(address)}?chain_id=1`,
      { signal: ctl.signal },
    );
    if (!res.ok) return null;
    return readGoPlusAddress(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
