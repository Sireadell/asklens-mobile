# Solana side (track B) notes

## Exports (src/solana/index.ts)
connectWallet, getWalletProfile, saveReceipt (required), plus getConnectedAddress, disconnectWallet, getSolBalance, requestAirdrop, getReceipts, getCluster, setCluster, buildReceiptMemo.
WalletScreen is the default export of src/screens/WalletScreen.tsx (track A: add it to navigation).

## Live AskLens API with a Solana address (tested 2026-10-12)
| Route | Result |
|---|---|
| POST /api/clipguard/check-wallet with a Solana address (with or without chain "solana") | Rejected: "Send an EVM address: 0x followed by 40 hex characters." Does NOT understand Solana. |
| POST /api/ask with a free-text question containing a Solana wallet | Routes to the fraud check (FRAUD_DETECTION), but the answer came back "language model could not be reached" (no real verdict). |
| POST /api/ask with a Solana token mint | HTTP 500, no miner available for that. |
| Links via /api/clipguard/check-url | Work as before (track A's area). |
So for a Solana address, track A should show an honest "Not sure" verdict, or use the wallet profile (getWalletProfile) as the evidence, not the AskLens verdict.

## Data services on our free plans (real calls)
| Service | Solana? |
|---|---|
| Zerion | Yes. Positions call returns Solana tokens and USD values. Used for token count and top holdings. |
| Dwellir | The key works on many chains (Ethereum host answers), but the Solana host names I guessed do not resolve, so it is not used for Solana. |
| Quicknode | Our endpoint is Monad only, not used for Solana. |
| Blockvision | Our key is Monad only ("Method not found"). |
| Public Solana RPC (mainnet-beta, devnet) | Yes. Used for balance, history and age. Rate limited, fine for a demo. |

## Verified (npx tsx scripts/test-solana.ts, real network)
- SHA-256 helper matches node's crypto, including emoji and accents.
- Receipt text format: `AskLens|v1|<verdict>|<16 hex of input hash>|<unix seconds>`.
- Wallet profile on a real big mainnet wallet: balance, age, tx count, tokens, top holdings all returned. Empty wallet gets "No activity" flag.
- Type check (npx tsc --noEmit) passes.

## NOT verified, needs action
1. **Devnet memo send**: the free devnet test-coin tap refused this computer (limit reached), so the full send was not proven. Script will do it on a rerun: `npx tsx scripts/test-solana.ts`. The memo code is the standard Memo program call from the Solana Mobile docs.
2. **Zerion key for the app**: copy ZERION_API_KEY from headwater\.env into this folder's `.env` as `EXPO_PUBLIC_ZERION_API_KEY=...` (I was blocked from copying it). Without it the profile still shows balance and age, but no tokens. Note: the key is bundled in the app, fine for a free demo key.
3. **Real phone test** (needs a development build, not Expo Go; `npx expo run:android` or EAS dev build): connect with Phantom or Solflare, approve, balance shows, save proof signs and sends a memo, Explorer link opens. Set the wallet app to devnet or accept the chain prompt.
4. In-app "Get 1 test SOL" may hit the same tap limit; fallback is faucet.solana.com (pick devnet).

## Technical choices
- Mobile Wallet Adapter via `@solana-mobile/mobile-wallet-adapter-protocol-web3js` 3.0.1, `@solana/web3.js` 1.99.0, `@solana/spl-memo` 0.3.1.
- Polyfills: `react-native-get-random-values` and `buffer`, imported first in src/solana/polyfills.ts (src/solana/index.ts imports it before anything else). Lighter than the docs' quick-crypto option.
- Devnet default, mainnet switch in WalletScreen. Wallet profile always reads mainnet.

## SKR Holder tier (2026-10-12)
- `getGuardTier(address)` in src/solana/skr.ts, exported from src/solana/index.ts. Returns `{skr, tier: 'free'|'holder', perks}`. Holder means 1 SKR or more (`HOLDER_THRESHOLD`).
- Read only. Always asks mainnet-beta (getTokenAccountsByOwner with the SKR mint), even when the app is on devnet for receipts. If the read fails it returns free, never blocks the app.
- Mint SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3, 6 decimals, classic SPL token, re-verified on-chain today.
- Tested with real mainnet wallets found from recent mint activity (getTokenLargestAccounts is blocked on public RPCs): 224.79 SKR and 14.11 SKR read as holder, a wallet with none reads as free. Script: `npx tsx scripts/test-skr.ts`.
- No SKR payments or transfers. WalletScreen shows SKR next to SOL plus a Holder badge.
- Perks to enforce in track A files: Holder badge on the share card, higher daily check allowance.

## Verify a proof (2026-10-12)
- `verifyProof(signature, cluster?)` in src/solana/verify.ts reads the transaction from the public RPC of the chosen network, finds the Memo instruction and returns verdict, time, signer, input fingerprint, or "not an AskLens proof" / "not found" / "failed on chain".
- Screen: src/screens/VerifyProofScreen.tsx (default export). Paste a signature, pick network, or tap a saved proof. Needs adding to navigation by track A.
- Tested (`npx tsx scripts/test-verify.ts`): memo parsing, synthetic transactions (proof, not a proof, failed, missing), real mainnet RPC (a non-AskLens memo transaction reads "not an AskLens proof", unknown signature reads "not found"), bad text.
- NOT tested on a real AskLens proof yet: needs a devnet or mainnet memo saved from the phone (devnet faucet still refuses this PC).

## Wallet Checkup, SKR perks card, proof streak (2026-10-12)
- Checkup tab (src/screens/CheckupScreen.tsx, added to App.tsx): reads token accounts on mainnet (Token and Token-2022, first 300), lists apps with live access, Guard score out of 100 with the formula shown, "up/down since last time". Remove access button asks first, then sends a Revoke on the REAL network via Mobile Wallet Adapter (about 0.000005 SOL), needs the connected wallet to be the token owner.
- Risky token scan is NOT built (waiting for track A's tokenRisk.ts, cut line). Score uses approvals and wallet age only. Weekly notification not built.
- Known delegate names list is empty on purpose (no unverified addresses). All delegates show as "Unknown app".
- Tested: score maths, approval filter on synthetic rows, real mainnet read of a large wallet (300 accounts, 0 approvals), revoke instruction shape. NOT tested: a real approval and a real revoke (no real approval wallet found; needs a demo approval from the founder, and the revoke needs the phone).
- SKR perks card on Wallet screen lists the real perks (30 checks a day instead of 10, Holder mark on the share card), numbers read from track A's guard.ts.
- Proof streak: receipt memo may end with `|s<days>` (consecutive days with a saved proof). Verify screen shows "Proof streak: Day N". Wallet screen reads the streak from saved receipts. Old memos without it still verify.
- Risky token scan now in the Checkup (src/solana/riskyTokens.ts, uses track A's src/lib/tokenRisk.ts): up to 15 held tokens (largest balance first, which favours dust), 4 at a time, danger or caution counts as risky (8 points each, max 32). Tested on a real spam-heavy mainnet wallet: 14 of 15 flagged with plain reasons. Unknown results are not counted.

## Meme coin check engine (2026-10-12)
- `checkMeme(mint, onUpdate)` in src/lib/memeVerdict.ts returns a `MemeReport` (agreed shape). Four sources run at once, each with a 2.5 s cut-off, in src/lib/tokenRisk.ts `readMemeSources`: Jupiter search, the chain (mint and freeze power, Token-2022 extensions), DexScreener, RugCheck. `onUpdate` fires as each lands (`partial: true` until all four answered). `getTokenRisk` is unchanged.
- Rules: red for mint or freeze power on (new coins), Token-2022 permanent delegate, transfer fee, transfer hook, frozen-by-default, buys with zero sells, nobody can trade. Amber for under 7 days old, top holders over 30%, dev over 10%, dev launches over 3, low organic score, liquidity under $10K, or a serious RugCheck finding. Green only with no flags and older than 7 days. Under 24 hours is never green. Big established coins (30+ days, $100K+ liquidity, 10K+ holders) keep their issuer powers as amber and skip holder and dev rules, so BONK reads green while USDC and SKR read amber ("the issuer can still create more").
- pump.fun: if the coin is still on the bonding curve, a high top-holder share is explained as the launch pool, not a person.
- Receipt memo may also end with `|f<12 hex>`: a fingerprint of the verdict and the words shown (`factsHash`). The Verify screen shows it. Still devnet, no money moved.
- Tests: `npx jest` (__tests__/meme.test.ts, mocked sources, 27 tests). Live check: `npx tsx scripts/test-meme.ts`.
- Live times (PC wifi): first report 180 to 350 ms; all four answered in 230 to 350 ms when RugCheck was warm; when RugCheck is slow the final report arrives at the 2.5 s cut-off with `partial: true`.
