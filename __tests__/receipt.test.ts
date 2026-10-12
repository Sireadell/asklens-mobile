/// <reference types="jest" />
/// <reference types="node" />
import { buildReceiptMemo } from '../src/solana/receipt';
import { parseMemo, proofFromTransaction } from '../src/solana/verify';
import { sha256 } from '../src/solana/sha256';

describe('buildReceiptMemo', () => {
  const link = 'https://phantom-app.xyz';
  it('follows AskLens|v1|verdict|16hex|seconds', () => {
    const memo = buildReceiptMemo({ input: link, verdict: 'danger', checkedAt: 1760000000000 });
    expect(memo).toMatch(/^AskLens\|v1\|danger\|[0-9a-f]{16}\|1760000000$/);
  });
  it('uses the first 16 hex of the input hash', () => {
    const memo = buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1760000000000 });
    expect(memo.split('|')[3]).toBe(sha256(link).slice(0, 16));
  });
  it('trims the input before hashing', () => {
    const a = buildReceiptMemo({ input: `  ${link}\n`, verdict: 'safe', checkedAt: 1 });
    const b = buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1 });
    expect(a).toBe(b);
  });
  it('accepts seconds as well as milliseconds', () => {
    const ms = buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1760000000123 });
    const s = buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1760000000 });
    expect(ms).toBe(s);
  });
  it('appends the streak only when it is above zero', () => {
    expect(buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1, streak: 3 })).toMatch(/\|s3$/);
    expect(buildReceiptMemo({ input: link, verdict: 'safe', checkedAt: 1, streak: 0 })).not.toMatch(/\|s\d+$/);
  });
  it('stays far below the 566 byte memo limit', () => {
    const memo = buildReceiptMemo({ input: 'x'.repeat(5000), verdict: 'caution', checkedAt: Date.now(), streak: 9999 });
    expect(Buffer.byteLength(memo)).toBeLessThan(100);
  });
  it('is read back correctly by parseMemo', () => {
    const memo = buildReceiptMemo({ input: link, verdict: 'caution', checkedAt: 1760000000000, streak: 4 });
    expect(parseMemo(memo)).toEqual({
      verdict: 'caution',
      inputHash: sha256(link).slice(0, 16),
      checkedAt: 1760000000,
      streak: 4,
    });
  });
});

describe('parseMemo', () => {
  const hash = '0123456789abcdef';
  it('rejects other memos', () => {
    expect(parseMemo('hello world')).toBeNull();
    expect(parseMemo(`Other|v1|safe|${hash}|1`)).toBeNull();
  });
  it('rejects a wrong version', () => {
    expect(parseMemo(`AskLens|v2|safe|${hash}|1`)).toBeNull();
  });
  it('rejects a bad hash', () => {
    expect(parseMemo('AskLens|v1|safe|XYZ|1')).toBeNull();
    expect(parseMemo('AskLens|v1|safe|0123456789ABCDEF|1')).toBeNull();
  });
  it('rejects a bad time or streak', () => {
    expect(parseMemo(`AskLens|v1|safe|${hash}|abc`)).toBeNull();
    expect(parseMemo(`AskLens|v1|safe|${hash}|0`)).toBeNull();
    expect(parseMemo(`AskLens|v1|safe|${hash}|5|sx`)).toBeNull();
  });
  it('accepts a memo without a streak', () => {
    expect(parseMemo(`AskLens|v1|safe|${hash}|1760000000`)).toEqual({ verdict: 'safe', inputHash: hash, checkedAt: 1760000000 });
  });
});

describe('proofFromTransaction', () => {
  const memoProgram = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const memo = 'AskLens|v1|danger|0123456789abcdef|1760000000';
  const tx = (ixs: any[], err: any = null) => ({
    meta: { err },
    transaction: { message: { accountKeys: [{ pubkey: 'SignerKey', signer: true }], instructions: ixs } },
  });
  it('finds the proof in a good transaction', () => {
    const r = proofFromTransaction(tx([{ programId: memoProgram, parsed: memo }]), 'sig', 'devnet');
    expect(r).toMatchObject({ ok: true, verdict: 'danger', signer: 'SignerKey', cluster: 'devnet', signature: 'sig' });
  });
  it('finds the proof when a wallet reruns the memo under its own program id', () => {
    const r = proofFromTransaction(tx([{ programId: 'Memo4c2pN8afCj432Lb7RMVKi9PbQnnW7ewFFaV3oAH', program: 'spl-memo', parsed: memo }]), 'sig', 'devnet');
    expect(r).toMatchObject({ ok: true, verdict: 'danger', signer: 'SignerKey' });
  });
  it('reports a missing transaction', () => {
    expect(proofFromTransaction(null, 'sig', 'devnet')).toMatchObject({ ok: false, reason: 'not_found' });
  });
  it('reports a failed transaction', () => {
    expect(proofFromTransaction(tx([], { InstructionError: 1 }), 'sig', 'devnet')).toMatchObject({ ok: false, reason: 'failed_tx' });
  });
  it('reports a transaction with no AskLens memo', () => {
    expect(proofFromTransaction(tx([{ programId: memoProgram, parsed: 'hi' }]), 'sig', 'devnet')).toMatchObject({ ok: false, reason: 'not_proof' });
    expect(proofFromTransaction(tx([{ programId: 'Other', parsed: memo }]), 'sig', 'devnet')).toMatchObject({ ok: false, reason: 'not_proof' });
  });
});
