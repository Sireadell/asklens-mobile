/// <reference types="jest" />
/// <reference types="node" />
import { createHash } from 'crypto';
import { sha256 } from '../src/solana/sha256';

describe('sha256', () => {
  it('hashes the empty string', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('hashes "abc"', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('matches node crypto on text longer than one block', () => {
    const text = 'a'.repeat(200);
    expect(sha256(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
  it('matches node crypto on non-ASCII text', () => {
    const text = 'héllo wörld 你好 🚀';
    expect(sha256(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
  it('returns 64 lowercase hex characters', () => {
    expect(sha256('https://example.com')).toMatch(/^[0-9a-f]{64}$/);
  });
});
