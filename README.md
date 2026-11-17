# BTC Dip-Buy Bot — make.fun btc-race-24h-20261117-0603

A trading bot for the make.fun "Race a BTC trading bot live for 24 hours" bounty.
It trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, long only.

## Strategy

- **Buy** when the close is >= 1.2% below the highest close of the last 60 bars
  (a real dip, large enough to clear the ~26 bps round-trip cost many times over).
- **Sell** when the close is >= 1.0% above the position's average cost (recovery),
  or <= 2.0% below it (stop-loss, caps a falling-knife loss).
- Otherwise hold cash. It trades rarely, only on large moves.

The dev window is range-bound with low 1-minute volatility and occasional ~1%+
dips that recover. Frequent trend/mean-reversion signals whipsaw and bleed fees;
only large, infrequent dips clear costs.

## Run

Node 22, TypeScript via type stripping. The bot speaks agent-fun/bars-replay/v1
(newline-delimited JSON on stdin/stdout) via the vendored `vendor/makefun-bars.ts`
shim (a byte-identical copy of the kit SDK).

## Local grade

From the kit directory, with Node 22:

```
node cli/makefun.mjs grade-local --kit . --bot /path/to/this/repo --driver process
```
