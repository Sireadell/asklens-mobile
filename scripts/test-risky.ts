// @ts-nocheck
import { getHoldings } from '../src/solana/approvals';
import { scanRiskyTokens } from '../src/solana/riskyTokens';
(async () => {
  const h = await getHoldings('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  const r = await scanRiskyTokens(h.mints);
  console.log('mints', h.mints.length, 'scanned', r.scanned, 'risky', r.risky.length);
  r.risky.slice(0, 4).forEach((t) => console.log(t.level, t.symbol, '-', t.reason));
})();
