export type InputKind = 'link' | 'evm-address' | 'solana-address' | 'unknown';
export type Verdict = 'safe' | 'caution' | 'danger' | 'unknown';

export interface Evidence {
  level: 'bad' | 'warn' | 'info';
  text: string;
}

export interface CheckResult {
  input: string;
  kind: InputKind;
  verdict: Verdict;
  reasons: string[];
  source: string;
  checkedAt: number;
  /** Facts the phone gathered itself (scam lists, site age, name copying). */
  evidence?: Evidence[];
  /** What kind of thing was checked, for the small chip on the result. */
  label?: string;
  /** True when the link or address was copied on a linked PC. */
  fromPc?: boolean;
}
