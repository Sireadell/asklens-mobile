import { getDomainAgeDays } from './domainAge';
import { isPunycode, lookalikeOf, registrable } from './lookalike';

export type { Evidence } from '../types';
import type { Evidence } from '../types';

let blocked: Set<string> | null = null;
function blocklist(): Set<string> {
  if (!blocked) {
    try {
      blocked = new Set<string>(require('../data/blocklist.json').domains);
    } catch {
      blocked = new Set();
    }
  }
  return blocked;
}

const SHORTENERS = new Set(['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'is.gd', 'cutt.ly', 'ow.ly', 'rb.gy', 'shorturl.at']);
const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function hostOf(input: string): string {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** The site itself and every parent name, so "claim.evil.xyz" also tests "evil.xyz". */
function hostAndParents(host: string): string[] {
  const parts = host.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'));
  return out;
}

export function onScamList(host: string): boolean {
  const list = blocklist();
  return hostAndParents(host).some((h) => list.has(h));
}

/**
 * Facts the phone gathers by itself about a link: scam lists, how new the
 * site is, name copying. Never says "safe". Each line is plain words.
 */
export async function getLinkEvidence(input: string): Promise<Evidence[]> {
  const host = hostOf(input);
  const out: Evidence[] = [];
  if (!host) return out;

  if (IP_RE.test(host)) {
    out.push({ level: 'warn', text: 'This link goes to a number, not a normal site name. Real wallet sites do not do this.' });
    return out;
  }

  if (onScamList(host)) {
    out.push({ level: 'bad', text: 'This site is on public lists of crypto scam sites.' });
  }

  const copy = lookalikeOf(host);
  if (copy) out.push({ level: 'warn', text: `The name copies ${copy}, but it is a different site.` });

  if (isPunycode(host)) out.push({ level: 'warn', text: 'The address uses hidden look-alike letters.' });

  if (SHORTENERS.has(registrable(host))) {
    out.push({ level: 'info', text: 'This is a shortened link, so the real destination is hidden.' });
    return out;
  }

  const age = await getDomainAgeDays(host);
  if (age === null) {
    out.push({ level: 'info', text: 'Could not read how old this site is.' });
  } else if (age < 14) {
    out.push({
      level: 'warn',
      text: `Registered ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}. Real wallet sites are usually years old.`,
    });
  } else if (age >= 365) {
    out.push({ level: 'info', text: `Registered ${Math.floor(age / 365)} year${age >= 730 ? 's' : ''} ago.` });
  } else if (age < 30) {
    out.push({ level: 'info', text: `Registered ${age} days ago.` });
  } else {
    const m = Math.floor(age / 30);
    out.push({ level: 'info', text: `Registered ${m} month${m === 1 ? '' : 's'} ago.` });
  }
  return out;
}
