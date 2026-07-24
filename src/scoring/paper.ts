// Paper trade PnL math. Pure functions — no DB, no orders, no signing.
// Position semantics: we simulate buying `size` USD of `outcome` shares at
// entryPrice. Shares = size / entryPrice. Value at current price = shares *
// currentPrice. PnL = value - size.

export function sharesFromSize(sizeUsd: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return sizeUsd / entryPrice;
}

export function unrealizedPnl(
  sizeUsd: number,
  entryPrice: number,
  currentPrice: number,
): number {
  const shares = sharesFromSize(sizeUsd, entryPrice);
  return round2(shares * currentPrice - sizeUsd);
}

// When a market resolves, a winning outcome share is worth $1, losing worth $0.
export function realizedPnlOnResolution(
  sizeUsd: number,
  entryPrice: number,
  didOutcomeWin: boolean,
): number {
  const shares = sharesFromSize(sizeUsd, entryPrice);
  const payout = didOutcomeWin ? shares * 1 : 0;
  return round2(payout - sizeUsd);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
