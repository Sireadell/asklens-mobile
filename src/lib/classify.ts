import { cached, rpc, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './solRpc';

export type AddressKind = 'wallet' | 'token-mint' | 'token-account' | 'program' | 'unknown';

export interface Classified {
  kind: AddressKind;
  owner?: string; // the program that owns this account
  mint?: string; // for a token account: which token it holds
  holder?: string; // for a token account: the wallet that owns it
  token2022?: boolean;
  /** The parsed mint details, when kind is token-mint. Reused by tokenRisk so the network is read once. */
  mintInfo?: any;
}

/** Learns what a Solana address IS: a person's wallet, a token, a token account or a program. */
export async function classifyAddress(address: string): Promise<Classified> {
  const info = await cached(`acct.${address}`, async () => {
    const r = await rpc('getAccountInfo', [address, { encoding: 'jsonParsed' }]);
    return r?.value ?? null;
  });

  // Never used or empty: a normal wallet address that has not received anything yet.
  if (!info) return { kind: 'wallet' };
  if (info.executable) return { kind: 'program', owner: info.owner };
  if (info.owner === SYSTEM_PROGRAM) return { kind: 'wallet', owner: info.owner };

  const isToken = info.owner === TOKEN_PROGRAM || info.owner === TOKEN_2022_PROGRAM;
  const parsed = info.data?.parsed;
  if (isToken && parsed?.type === 'mint') {
    return { kind: 'token-mint', owner: info.owner, token2022: info.owner === TOKEN_2022_PROGRAM, mintInfo: parsed.info };
  }
  if (isToken && parsed?.type === 'account') {
    return {
      kind: 'token-account',
      owner: info.owner,
      mint: parsed.info?.mint,
      holder: parsed.info?.owner,
      token2022: info.owner === TOKEN_2022_PROGRAM,
    };
  }
  return { kind: 'unknown', owner: info.owner };
}
