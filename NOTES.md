# Notes

## Works
- Share a link or address into the app from another app, and it is checked on arrival
- Paste box and "Check what I copied"
- Links: live AskLens service (3 checkers). No key needed.
- Ethereum 0x addresses: live AskLens service (one checker, takes up to about 10 seconds)
- Result screen, history (last 100), daily streak, risky things caught, share card as a picture
- App compiles and bundles for Android

## Solana addresses
The live service rejects them ("Send an EVM address"). So the app asks the Solana network directly: does the account exist, is it a program, how many recent transactions. It cannot tell a scam address from a clean one, and says so on screen.

## Does not work or not tested
- Not yet run on a physical phone
- Live service allows about 10 checks per 10 minutes per phone
- Ethereum address checks often come back "not sure" (the checker says inconclusive)
- Save proof on Solana depends on the wallet part in src/solana
