// Shared domain types used across adapters, scoring, and engine.

export type DataMode = "live" | "demo" | "auto";

export interface LeaderboardEntry {
  address: string;
  label?: string;
  rank: number;
  // Optional aggregate stats the leaderboard may expose:
  pnl?: number;
  volume?: number;
  roi?: number;
}

export interface RawTrade {
  walletAddress: string;
  marketId: string;
  conditionId?: string;
  marketQuestion: string;
  marketCategory?: string;
  outcome: string;
  side: "BUY" | "SELL";
  price: number; // wallet entry price
  size: number; // USD size
  timestamp: string; // ISO
  raw: unknown;
}

export interface MarketData {
  marketId: string;
  conditionId?: string;
  question: string;
  category?: string;
  yesPrice?: number;
  noPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number;
  volume?: number;
  timeToResolutionHours?: number;
  resolved?: boolean;
  resolvedOutcome?: string; // winning outcome label if resolved
  raw: unknown;
}

export interface PriceQuote {
  marketId: string;
  outcome: string;
  price: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number;
  demo?: boolean;
}

export interface OutcomeResult {
  marketId: string;
  resolved: boolean;
  winningOutcome?: string;
  demo?: boolean;
}

// Wrapper marking whether a payload is real (live) or clearly-labeled demo.
export interface Sourced<T> {
  data: T;
  demo: boolean;
  source: string;
}
