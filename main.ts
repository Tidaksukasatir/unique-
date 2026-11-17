// BTC dip-buy bot for make.fun btc-race-24h-20261117-0603.
//
// Strategy (long only, one position, all-in):
//   Buy  when the close is >= 1.2% below the highest close of the last 60 bars
//        (a real dip, big enough to clear the ~26 bps round-trip cost many times over).
//   Sell when the close is >= 1.0% above the position's average cost (recovery),
//        or <= 2.0% below it (stop-loss: caps a falling-knife loss).
//   Otherwise hold cash. Trades rarely, only on large moves.
//
// Rationale: the dev window is range-bound with low 1-minute volatility (std ~6 bps)
// and occasional ~1%+ dips that recover. Frequent trend/mean-reversion signals
// whipsaw and bleed fees; only large, infrequent dips clear costs. The 2% stop
// never fired on the dev window (dips recovered) but caps downside in a crash.
// Deterministic: bigint math on closes only, no randomness, no clock.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 60; // bars for the dip reference high
const DROP_BPS = 120n; // buy when close <= high * (1 - 1.2%)
const RECOV_BPS = 100n; // sell when close >= avg cost * (1 + 1.0%)
const STOP_BPS = 200n; // sell when close <= avg cost * (1 - 2.0%)
const MAX_SLIP_BPS = 100; // 1% slippage cap vs the latest close
const BPS = 10_000n;

const closes: bigint[] = [];

/** Average cost of the held position as a price (same scale as closes). */
function avgCostPx(state: BarsState): bigint | null {
  const held = state.positions.get(SYMBOL);
  if (held === undefined || held.qty === 0n) return null;
  // cost (quote units) -> price: qty * price * 10^quote_scale / 10^(qty+price scale) = cost
  // => price = cost * 10^(qty_scale+price_scale) / (qty * 10^quote_scale)
  return (held.cost * 10n ** 13n) / (held.qty * 10n ** 6n);
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const held = state.positions.get(SYMBOL);
    if (held !== undefined && held.qty > 0n) {
      const avg = avgCostPx(state);
      if (avg !== null) {
        if (close * BPS >= avg * (BPS + RECOV_BPS)) {
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIP_BPS }];
        }
        if (close * BPS <= avg * (BPS - STOP_BPS)) {
          return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIP_BPS }];
        }
      }
      return [];
    }
    // Flat: look for a dip.
    if (closes.length < LOOKBACK) return [];
    let hi = 0n;
    for (let i = closes.length - LOOKBACK; i < closes.length; i++) {
      if (closes[i]! > hi) hi = closes[i]!;
    }
    if (close * BPS <= hi * (BPS - DROP_BPS)) {
      const amount = state.cash;
      if (amount < BigInt(state.hello.fees.min_notional_quote_units)) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIP_BPS }];
    }
    return [];
  },
});
