# Testing

AskLens Guard has automated tests for the parts that decide what you see and what gets saved. They run in a few seconds and never touch the internet: every network call is replaced with a fake answer.

## Run them

```
npm install
npm test
npm run typecheck
```

`npm test` runs 77 tests. `npm run typecheck` checks the whole app for type mistakes. The same two checks run on GitHub for every push (see `.github/workflows/ci.yml`).

## What is tested

| Area | What the tests check |
| --- | --- |
| Link or address detection | A link, an Ethereum style address, a Solana address and plain text are told apart. Links are found inside shared text. |
| Verdicts | The answer from the live checkers becomes Safe, Be careful, Danger or Not sure. Phone evidence can only make an answer worse, never better. A Solana address is never stamped Safe. |
| Result shape | Every result has the input, kind, verdict, reasons, source and time. |
| Look-alike sites | Typos of real wallet sites, brand names hidden in other names, hidden look-alike letters, shortened links, bare IP links, scam list hits and new sites. |
| Proof note | The note saved on Solana reads `AskLens\|v1\|verdict\|16 characters of the input fingerprint\|time`, stays small, and is read back correctly. Bad or foreign notes are rejected. |
| Fingerprint | The SHA-256 fingerprint matches the standard answer, including accents and emoji. |
| Proof lookup | A transaction with a real AskLens note is accepted. Missing, failed and unrelated transactions are refused with a clear reason. |
| Daily streak | Days in a row, a missed day, several proofs in one day, counting today. |
| Wallet score | 100 minus points for risky apps and tokens and for a very new wallet, never below 0, and the Looking good, Needs attention and Act now bands. |

## What is not tested here

Screens, the wallet pop-up and the real Solana network need a real phone. See the phone checklist kept with the project notes.
