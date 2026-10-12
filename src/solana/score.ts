export interface ScoreInput {
  approvals: number;
  risky: number;
  ageDays?: number;
}

export const SCORE_FORMULA = 'Starts at 100. Minus 15 per app that can still move your tokens (up to 45), minus 8 per risky token (up to 32), minus 10 if the wallet is under 30 days old.';

export function computeGuardScore(i: ScoreInput): { score: number; band: string } {
  let s = 100;
  s -= Math.min(45, i.approvals * 15);
  s -= Math.min(32, i.risky * 8);
  if (i.ageDays !== undefined && i.ageDays < 30) s -= 10;
  s = Math.max(0, s);
  return { score: s, band: s >= 85 ? 'Looking good' : s >= 60 ? 'Needs attention' : 'Act now' };
}
