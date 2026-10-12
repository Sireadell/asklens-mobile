/// <reference types="jest" />
/// <reference types="node" />
import { streakFrom } from '../src/solana/streak';
import { computeGuardScore } from '../src/solana/score';

const DAY = 86400000;
const now = new Date(2026, 9, 12, 12).getTime();
const saved = (...daysAgo: number[]) => daysAgo.map((n) => ({ savedAt: now - n * DAY }));

describe('streakFrom', () => {
  it('is 0 with no proofs', () => {
    expect(streakFrom([], now)).toBe(0);
  });
  it('counts consecutive days ending today', () => {
    expect(streakFrom(saved(0, 1, 2), now)).toBe(3);
  });
  it('still counts when the last proof was yesterday', () => {
    expect(streakFrom(saved(1, 2), now)).toBe(2);
  });
  it('breaks when a day is missed', () => {
    expect(streakFrom(saved(0, 1, 3, 4), now)).toBe(2);
  });
  it('is 0 when the last proof was two days ago', () => {
    expect(streakFrom(saved(2, 3), now)).toBe(0);
  });
  it('counts several proofs on one day once', () => {
    expect(streakFrom([...saved(0), ...saved(0), ...saved(1)], now)).toBe(2);
  });
  it('counts today when includeToday is set', () => {
    expect(streakFrom(saved(1, 2), now, true)).toBe(3);
    expect(streakFrom([], now, true)).toBe(1);
  });
});

describe('computeGuardScore', () => {
  it('is 100 for a clean wallet', () => {
    expect(computeGuardScore({ approvals: 0, risky: 0 })).toEqual({ score: 100, band: 'Looking good' });
  });
  it('takes 15 per approval, capped at 45', () => {
    expect(computeGuardScore({ approvals: 1, risky: 0 }).score).toBe(85);
    expect(computeGuardScore({ approvals: 10, risky: 0 }).score).toBe(55);
  });
  it('takes 8 per risky token, capped at 32', () => {
    expect(computeGuardScore({ approvals: 0, risky: 2 }).score).toBe(84);
    expect(computeGuardScore({ approvals: 0, risky: 20 }).score).toBe(68);
  });
  it('takes 10 off a wallet under 30 days old only', () => {
    expect(computeGuardScore({ approvals: 0, risky: 0, ageDays: 5 }).score).toBe(90);
    expect(computeGuardScore({ approvals: 0, risky: 0, ageDays: 30 }).score).toBe(100);
  });
  it('picks the band from the score', () => {
    expect(computeGuardScore({ approvals: 1, risky: 0 }).band).toBe('Looking good');
    expect(computeGuardScore({ approvals: 2, risky: 0 }).band).toBe('Needs attention');
    expect(computeGuardScore({ approvals: 3, risky: 4, ageDays: 1 }).band).toBe('Act now');
  });
  it('never goes below 0', () => {
    expect(computeGuardScore({ approvals: 99, risky: 99, ageDays: 0 }).score).toBeGreaterThanOrEqual(0);
  });
});
