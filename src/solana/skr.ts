import { rpcUrl } from './config';
import { fetchRetry } from './net';

// SKR token on mainnet-beta (6 decimals, classic SPL token). Verified on-chain.
export const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
// Holding at least this much SKR makes you a Holder.
export const HOLDER_THRESHOLD = 1;

export interface GuardTier {
  skr: number;
  tier: 'free' | 'holder';
  perks: string[];
}

export const HOLDER_PERKS = ['Holder badge on your share card', 'More daily checks'];

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

// Read only. Always reads mainnet, even when the app is on devnet for receipts.
export async function getSkrBalance(address: string): Promise<number> {
  const r = await rpc('getTokenAccountsByOwner', [address, { mint: SKR_MINT }, { encoding: 'jsonParsed' }]);
  let total = 0;
  for (const a of r?.value ?? []) total += Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0);
  return total;
}

export async function getGuardTier(address: string): Promise<GuardTier> {
  let skr = 0;
  try {
    skr = await getSkrBalance(address);
  } catch {
    // Could not read: treat as free rather than block the app.
  }
  const holder = skr >= HOLDER_THRESHOLD;
  return { skr, tier: holder ? 'holder' : 'free', perks: holder ? HOLDER_PERKS : [] };
}
