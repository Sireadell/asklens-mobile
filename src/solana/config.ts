export type Cluster = 'devnet' | 'mainnet-beta';

let cluster: Cluster = 'devnet';

export function getCluster(): Cluster {
  return cluster;
}

export function setCluster(c: Cluster): void {
  cluster = c;
}

export function rpcUrl(c: Cluster = cluster): string {
  return c === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com';
}

export function explorerTxUrl(signature: string, c: Cluster = cluster): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  return c === 'devnet' ? `${base}?cluster=devnet` : base;
}

// Wallet profile data comes from Zerion (mainnet). The key is read from .env at build time.
export const ZERION_KEY: string = process.env.EXPO_PUBLIC_ZERION_API_KEY ?? '';
