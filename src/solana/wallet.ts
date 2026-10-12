import './polyfills';
import { Buffer } from 'buffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { createMemoInstruction } from '@solana/spl-memo';
import { Connection, LAMPORTS_PER_SOL, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { CheckResult } from '../types';
import { explorerTxUrl, getCluster, rpcUrl } from './config';
import { buildReceiptMemo } from './receipt';
import { friendlyError } from './errors';
import { fetchRetry } from './net';
import { buildRevokeInstruction } from './revoke';
import { streakFrom } from './streak';

const APP_IDENTITY = { name: 'AskLens Guard', uri: 'https://asklens-zoox.onrender.com', icon: 'favicon.ico' };
const AUTH_KEY = 'asklens.wallet.auth';
const RECEIPTS_KEY = 'asklens.receipts';

export interface Receipt {
  signature: string;
  explorerUrl: string;
  input: string;
  verdict: string;
  cluster: string;
  savedAt: number;
  checkedAt?: number;
  streak?: number;
}

interface Session {
  address: string;
  authToken: string;
  cluster: string;
}

let session: Session | null = null;

const chainId = () => (getCluster() === 'devnet' ? 'solana:devnet' : 'solana:mainnet');
const connection = () => new Connection(rpcUrl(), { commitment: 'confirmed', fetch: ((u: any, i: any) => fetchRetry(String(u), i)) as any });
const toAddress = (b64: string) => new PublicKey(Buffer.from(b64, 'base64'));

async function loadSession(): Promise<Session | null> {
  if (session) return session;
  try {
    const raw = await AsyncStorage.getItem(AUTH_KEY);
    if (raw) session = JSON.parse(raw);
  } catch {}
  return session;
}

async function persistSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } catch {}
}

async function connectWalletInner(): Promise<{ address: string }> {
  const cluster = getCluster();
  const old = await loadSession();
  const result = await transact(async (wallet) => {
    return wallet.authorize({
      chain: chainId(),
      identity: APP_IDENTITY,
      auth_token: old && old.cluster === cluster ? old.authToken : undefined,
    });
  });
  const address = toAddress(result.accounts[0].address).toBase58();
  session = { address, authToken: result.auth_token, cluster };
  await persistSession();
  return { address };
}

export async function getConnectedAddress(): Promise<string | null> {
  const s = await loadSession();
  return s && s.cluster === getCluster() ? s.address : null;
}

export async function disconnectWallet(): Promise<void> {
  const s = await loadSession();
  session = null;
  try {
    await AsyncStorage.removeItem(AUTH_KEY);
  } catch {}
  if (s) {
    try {
      await transact(async (wallet) => {
        await wallet.deauthorize({ auth_token: s.authToken });
      });
    } catch {}
  }
}

export async function getSolBalance(address: string): Promise<number> {
  try {
    const lamports = await connection().getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export async function requestAirdrop(address: string, sol = 1): Promise<string> {
  if (getCluster() !== 'devnet') throw new Error('Free test coins only work on devnet');
  const conn = connection();
  let sig = '';
  for (const amt of [sol, 0.5, 0.1]) {
    try {
      sig = await conn.requestAirdrop(new PublicKey(address), amt * LAMPORTS_PER_SOL);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!sig) {
    throw new Error('The free test coin tap is busy or empty. Get test SOL at faucet.solana.com, paste your address, and pick devnet.');
  }
  const latest = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}

export async function getProofStreak(): Promise<number> {
  return streakFrom(await getReceipts(), Date.now());
}

export async function getReceipts(): Promise<Receipt[]> {
  try {
    const raw = await AsyncStorage.getItem(RECEIPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveReceiptInner(result: CheckResult): Promise<{ signature: string; explorerUrl: string }> {
  const cluster = getCluster();
  const conn = connection();
  const streak = streakFrom(await getReceipts(), Date.now(), true);
  const memo = buildReceiptMemo({ input: result.input, verdict: result.verdict, checkedAt: result.checkedAt, streak });
  const old = await loadSession();

  const {
    context: { slot: minContextSlot },
    value: latest,
  } = await conn.getLatestBlockhashAndContext();

  const signature = await transact(async (wallet) => {
    const auth = await wallet.authorize({
      chain: chainId(),
      identity: APP_IDENTITY,
      auth_token: old && old.cluster === cluster ? old.authToken : undefined,
    });
    const payer = toAddress(auth.accounts[0].address);
    session = { address: payer.toBase58(), authToken: auth.auth_token, cluster };
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: latest.blockhash,
      instructions: [createMemoInstruction(memo, [payer])],
    }).compileToLegacyMessage();
    const [sig] = await wallet.signAndSendTransactions({
      transactions: [new VersionedTransaction(message)],
      minContextSlot,
    });
    return sig;
  });

  await persistSession();
  const explorerUrl = explorerTxUrl(signature, cluster);
  const receipt: Receipt = { signature, explorerUrl, input: result.input, verdict: result.verdict, cluster, savedAt: Date.now(), checkedAt: result.checkedAt, streak };
  try {
    const all = await getReceipts();
    await AsyncStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt, ...all].slice(0, 50)));
  } catch {}
  return { signature, explorerUrl };
}

export async function connectWallet(): Promise<{ address: string }> {
  try {
    return await connectWalletInner();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

export async function saveReceipt(result: CheckResult): Promise<{ signature: string; explorerUrl: string }> {
  try {
    return await saveReceiptInner(result);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

// Used by History: find the saved proof for a past check, if there is one.
export async function getReceiptFor(input: string, checkedAt: number): Promise<Receipt | null> {
  const all = await getReceipts();
  return all.find((r) => r.input === input && r.checkedAt === checkedAt) ?? null;
}

// Sends a REAL transaction on mainnet (costs about 0.000005 SOL). The screen must ask the user first.
// Always uses mainnet, whatever the receipt network is set to.
async function revokeApprovalInner(tokenAccount: string, programId: string, expectedOwner: string): Promise<{ signature: string; explorerUrl: string }> {
  const conn = new Connection(rpcUrl('mainnet-beta'), { commitment: 'confirmed', fetch: ((u: any, i: any) => fetchRetry(String(u), i)) as any });
  const {
    context: { slot: minContextSlot },
    value: latest,
  } = await conn.getLatestBlockhashAndContext();
  const old = await loadSession();
  const signature = await transact(async (wallet) => {
    const auth = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: APP_IDENTITY,
      auth_token: old && old.cluster === 'mainnet-beta' ? old.authToken : undefined,
    });
    const owner = toAddress(auth.accounts[0].address);
    if (owner.toBase58() !== expectedOwner) throw new Error('Open the wallet that holds this token and try again.');
    const message = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: latest.blockhash,
      instructions: [buildRevokeInstruction(tokenAccount, owner, programId)],
    }).compileToLegacyMessage();
    const [sig] = await wallet.signAndSendTransactions({ transactions: [new VersionedTransaction(message)], minContextSlot });
    return sig;
  });
  return { signature, explorerUrl: explorerTxUrl(signature, 'mainnet-beta') };
}

export async function revokeApproval(tokenAccount: string, programId: string, expectedOwner: string) {
  try {
    return await revokeApprovalInner(tokenAccount, programId, expectedOwner);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}
