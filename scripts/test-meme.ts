// @ts-nocheck
import { checkMeme } from '../src/lib/memeVerdict';
(async () => {
  const rec = await (await fetch('https://lite-api.jup.ag/tokens/v2/recent?limit=3')).json();
  const mints = ['DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263','SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', ...rec.slice(0,2).map(t=>t.id)];
  for (const m of mints) {
    const t0 = Date.now(); let first = 0;
    const r = await checkMeme(m, () => { if (!first) first = Date.now() - t0; });
    console.log(`\n${m.slice(0,6)} first update ${first}ms final ${Date.now()-t0}ms partial=${r.partial}`);
    console.log(r.verdict.toUpperCase(), '|', r.sentence);
    console.log(' ', r.name, r.symbol, '| age', r.ageText, '| price', r.priceText, r.change5mText, '| liq', r.liquidityText, '| holders', r.holders, '| top', r.topHoldersPct?.toFixed(1), '| dev', r.devPct?.toFixed(2), '| real', r.realBuyingPct);
    r.reasons.forEach(x => console.log('   -', x));
  }
})();
