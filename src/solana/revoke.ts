import { Buffer } from 'buffer';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';

// Revoke instruction for one token account (Token and Token-2022 share the same layout).
export function buildRevokeInstruction(tokenAccount: string, owner: PublicKey, programId: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(programId),
    keys: [
      { pubkey: new PublicKey(tokenAccount), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([5]),
  });
}
