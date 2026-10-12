import { ZERION_KEY, rpcUrl } from './config';
import { fetchRetry } from './net';

export interface WalletProfile {
  ageDays?: number;
  solBalance?: number;
  tokenCount?: number;
  txCount?: number;
  topHoldings?: { symbol: string; usd?: number }[];
  flags: string[];
}

async function rpc(method: string, params: unknown[]) {
  const res = await fetchRetry(rpcUrl('mainnet-beta'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'RPC error');
  return json.result;
}

async function zerionPositions(address: string) {
  const url =
    `https://api.zerion.io/v1/wallets/${encodeURIComponent(address)}/positions/` +
    `?currency=usd&filter[positions]=only_simple&filter[trash]=only_non_trash&sort=-value&page[size]=100`;
  const res = await fetchRetry(url, { headers: { Authorization: 'Basic ' + btoa(ZERION_KEY + ':') } });
  if (!res.ok) throw new Error(`Zerion ${res.status}`);
  const json = await res.json();
  const rows: any[] = (json.data ?? []).filter((p: any) => p.relationships?.chain?.data?.id === 'solana');
  const holdings = rows
    .map((p) => ({ symbol: String(p.attributes?.fungible_info?.symbol ?? '?').trim() || '?', usd: p.attributes?.value ?? undefined }))
    .sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  return { holdings, more: Boolean(json.links?.next) };
}

// Wallet profile always reads MAINNET, because that is where real wallets have history.
export async function getWalletProfile(address: string): Promise<WalletProfile> {
  const profile: WalletProfile = { flags: [] };
  const [bal, sigs, zer] = await Promise.allSettled([
    rpc('getBalance', [address]),
    rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
    ZERION_KEY ? zerionPositions(address) : Promise.reject(new Error('no key')),
  ]);

  if (bal.status === 'fulfilled') profile.solBalance = bal.value.value / 1e9;
  else profile.flags.push('Could not read the SOL balance right now');

  if (sigs.status === 'fulfilled') {
    const list: any[] = sigs.value;
    profile.txCount = list.length;
    if (list.length === 0) profile.flags.push('No activity found on this address');
    else {
      const oldest = list[list.length - 1].blockTime;
      if (oldest) {
        profile.ageDays = Math.max(0, Math.floor((Date.now() / 1000 - oldest) / 86400));
        if (list.length < 1000 && profile.ageDays < 7) profile.flags.push('Brand new wallet (under a week old)');
        if (list.length === 1000) profile.flags.push('Very active wallet, age counted from its last 1000 transactions');
      }
    }
  } else profile.flags.push('Could not read the history right now');

  if (zer.status === 'fulfilled') {
    profile.tokenCount = zer.value.holdings.length;
    profile.topHoldings = zer.value.holdings.slice(0, 5);
    if (zer.value.more) profile.flags.push('Holds more than 100 tokens');
    if (zer.value.holdings.length === 0 && (profile.solBalance ?? 0) === 0) profile.flags.push('Empty wallet');
  } else profile.flags.push('Token list is not available right now');

  return profile;
}
