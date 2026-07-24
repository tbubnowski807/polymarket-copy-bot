// The rule schema + default rules (version 1). Rules are the tunable knobs the
// self-improvement engine adjusts over time. Everything the scorer uses that
// could reasonably change lives here.

export interface Rules {
  // Wallet scoring weights (should sum ~1 but not enforced).
  weights: {
    roi: number;
    consistency: number;
    copyability: number;
    categoryEdge: number;
    liquidityQuality: number;
    entryTiming: number;
    tradeFrequency: number;
    resolvedPerformance: number;
  };
  // One-hit-wonder detection.
  oneHitWonder: {
    // If the single most profitable trade contributes >= this fraction of
    // total profit, penalize.
    maxSingleTradeProfitShare: number;
    // Minimum resolved trades before we trust a wallet at all.
    minResolvedTrades: number;
    // Penalty magnitude (subtracted from global score, 0..1 scale).
    penaltyWeight: number;
  };
  // Copyability constraints.
  copyability: {
    maxSpread: number; // markets wider than this are hard to copy
    minLiquidity: number; // markets thinner than this are hard to copy
    maxPriceMoveSinceEntry: number; // if price ran past this, entry is gone
    maxEntryTiming: number; // 0..1 fraction of market life; later = worse
  };
  // Trade scoring thresholds (decision boundaries on 0..1 copyScore).
  tradeDecision: {
    paperCopyThreshold: number;
    watchlistThreshold: number;
    minWalletGlobalScore: number;
  };
  // Paper sizing.
  sizing: {
    minSizeUsd: number;
    maxSizeUsd: number;
    // confidence (0..1) maps linearly from min->max size.
  };
  // Status assignment thresholds for wallets.
  status: {
    trackMinGlobalScore: number;
    watchMinGlobalScore: number;
  };
}

export const DEFAULT_RULES: Rules = {
  weights: {
    roi: 0.2,
    consistency: 0.18,
    copyability: 0.18,
    categoryEdge: 0.1,
    liquidityQuality: 0.1,
    entryTiming: 0.1,
    tradeFrequency: 0.06,
    resolvedPerformance: 0.08,
  },
  oneHitWonder: {
    maxSingleTradeProfitShare: 0.6,
    minResolvedTrades: 8,
    penaltyWeight: 0.35,
  },
  copyability: {
    maxSpread: 0.05,
    minLiquidity: 2000,
    maxPriceMoveSinceEntry: 0.08,
    maxEntryTiming: 0.75,
  },
  tradeDecision: {
    paperCopyThreshold: 0.65,
    watchlistThreshold: 0.45,
    minWalletGlobalScore: 0.5,
  },
  sizing: {
    minSizeUsd: 5,
    maxSizeUsd: 20,
  },
  status: {
    trackMinGlobalScore: 0.55,
    watchMinGlobalScore: 0.4,
  },
};

export function cloneRules(r: Rules): Rules {
  return JSON.parse(JSON.stringify(r));
}
