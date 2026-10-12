// Turns technical errors into one short, plain sentence for the screen.
export function friendlyError(e: any): string {
  const code = String(e?.code ?? '');
  const text = String(e?.message ?? e ?? '');
  const all = `${code} ${text}`;

  if (/WALLET_NOT_FOUND|No installed wallet|found no wallet/i.test(all))
    return 'No Solana wallet found on this phone. Install Phantom or Solflare, then try again.';
  if (/ASSOCIATION_CANCELLED|AUTHORIZATION_FAILED|declined|rejected|cancel|NOT_SIGNED/i.test(all))
    return 'You cancelled in your wallet. Nothing was sent.';
  if (/SESSION_TIMEOUT|timed out|timeout|aborted/i.test(all)) return 'That took too long. Check your connection and try again.';
  if (/NOT_SUBMITTED/i.test(all)) return 'The wallet signed it but the network did not take it. Try again.';
  if (/insufficient|0x1\b|debit an account|Attempt to debit/i.test(all))
    return 'Not enough SOL to pay the tiny network fee. Tap "Get 1 test SOL" first.';
  if (/Blockhash not found|block height exceeded|expired/i.test(all)) return 'The request expired. Please try again.';
  if (/429|Too Many Requests|rate/i.test(all)) return 'The network is busy right now. Wait a few seconds and try again.';
  if (/Network request failed|Failed to fetch|ECONN|ENOTFOUND|offline/i.test(all))
    return 'No internet connection. Check your signal and try again.';
  if (/free test coin|faucet/i.test(text)) return text;
  return 'Something went wrong. Please try again.';
}
