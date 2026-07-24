// Deterministic, clearly-labeled DEMO fixtures. Every consumer of this module
// MUST surface `demo: true` in the UI. These are NOT real market data.
//
// Addresses are obviously-fake placeholders prefixed with 0xDEMO so they can
// never be confused with real wallets.
//
// Design: each demo wallet has a hidden "skill" in [0,1] derived from its
// address. Skilled wallets win more and enter earlier, so the scoring engine
// produces a realistic spread of track / watch / ignore wallets and a mix of
// resolved (with known winner) and open markets.

import type { LeaderboardEntry, MarketData, RawTrade } from "@/lib/types";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CATEGORIES = ["Politics", "Crypto", "Sports", "Economics", "Pop Culture", "Science"];
const LABELS = ["DemoWhale", "DemoSharp", "DemoGrinder", "DemoFader", "DemoScalper", "DemoContrarian", "DemoMomentum", "DemoValue"];

function demoAddress(i: number): string {
  const hex = (i + 1).toString(16).padStart(6, "0");
  return `0xDEMO${hex}${"0".repeat(32)}`.slice(0, 42);
}

// Hidden skill for a demo wallet, stable per address. [0,1].
export function demoWalletSkill(address: string): number {
  const rnd = mulberry32(seedOf(address));
  return rnd();
}

export function demoLeaderboard(count = 500): LeaderboardEntry[] {
  const rnd = mulberry32(1234);
  const out: LeaderboardEntry[] = [];
  for (let i = 0; i < count; i++) {
    const roi = (rnd() * 2 - 0.4) * 100;
    out.push({
      address: demoAddress(i),
      label: `${LABELS[i % LABELS.length]}#${i + 1}`,
      rank: i + 1,
      pnl: Math.round((rnd() * 200000 - 20000) * 100) / 100,
      volume: Math.round(rnd() * 2000000),
      roi: Math.round(roi * 100) / 100,
    });
  }
  return out;
}

// Whether a demo market is resolved + its winner. Deterministic per marketId,
// but the *winner* is correlated with a per-market "yesLikely" so wallets that
// bet the favored side (skilled) win more often.
export function demoMarketResolution(marketId: string): {
  resolved: boolean;
  winner?: "Yes" | "No";
  yesLikely: number;
} {
  const rnd = mulberry32(seedOf("res:" + marketId));
  const yesLikely = 0.25 + rnd() * 0.5; // 0.25..0.75 "true" probability of Yes
  const resolved = rnd() < 0.55; // ~55% of demo markets are historical/resolved
  const winner = rnd() < yesLikely ? "Yes" : "No";
  return { resolved, winner: resolved ? winner : undefined, yesLikely };
}

// Generate a 30d trade history for a demo wallet. Skilled wallets bet the
// favored side more often and enter earlier; ~20% of wallets are one-hit
// wonders (one huge bet, rest small) so the penalty logic has targets.
export function demoWalletTrades(address: string, days = 30): RawTrade[] {
  const skill = demoWalletSkill(address);
  const rnd = mulberry32(seedOf("trades:" + address));
  const isOneHitWonder = rnd() < 0.2;
  const nTrades = 10 + Math.floor(rnd() * 35);
  const trades: RawTrade[] = [];
  const now = Date.now();

  for (let i = 0; i < nTrades; i++) {
    const cat = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)];
    const marketId = `demo-mkt-${(seedOf(address) + i * 101) % 4000}`;
    const { yesLikely } = demoMarketResolution(marketId);

    // Favored side + its probability. Skilled wallets bet the favored side and
    // enter at a better price; unskilled wallets are closer to a coin flip.
    const favored: "Yes" | "No" = yesLikely >= 0.5 ? "Yes" : "No";
    const favoredProb = Math.max(yesLikely, 1 - yesLikely);
    const betFavored = rnd() < 0.5 + skill * 0.45; // skill=1 -> ~95% favored
    const outcome = betFavored ? favored : favored === "Yes" ? "No" : "Yes";
    // Entry price near the true probability of the chosen side (skilled=better).
    const base = outcome === favored ? favoredProb : 1 - favoredProb;
    const noise = (rnd() - 0.5) * (1 - skill) * 0.25;
    const price = Math.max(0.05, Math.min(0.95, base - skill * 0.05 + noise));

    let size = 20 + rnd() * 400;
    if (isOneHitWonder && i === 0) size = 4000 + rnd() * 16000;

    const ageHours = 2 + rnd() * (days * 24 - 2);
    trades.push({
      walletAddress: address,
      marketId,
      conditionId: `0xDEMOCOND${(seedOf(marketId) % 9999).toString(16)}`,
      marketQuestion: `[DEMO] Will demo event #${(seedOf(marketId)) % 4000} in ${cat} happen?`,
      marketCategory: cat,
      outcome,
      side: rnd() < 0.85 ? "BUY" : "SELL",
      price: Math.round(price * 100) / 100,
      size: Math.round(size * 100) / 100,
      timestamp: new Date(now - ageHours * 3600 * 1000).toISOString(),
      raw: { demo: true, oneHitWonder: isOneHitWonder && i === 0, skill: Math.round(skill * 100) / 100 },
    });
  }
  return trades.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
}

export function demoMarket(marketId: string): MarketData {
  const rnd = mulberry32(seedOf("mkt:" + marketId));
  const { resolved, winner, yesLikely } = demoMarketResolution(marketId);
  // Current price drifts toward the winner if resolved, else near yesLikely.
  const yes = resolved
    ? winner === "Yes"
      ? 0.9 + rnd() * 0.09
      : 0.01 + rnd() * 0.09
    : Math.max(0.05, Math.min(0.95, yesLikely + (rnd() - 0.5) * 0.2));
  const spread = 0.005 + rnd() * 0.06;
  const cat = CATEGORIES[seedOf(marketId) % CATEGORIES.length];
  const ttr = resolved ? 0 : 2 + rnd() * 700;
  return {
    marketId,
    conditionId: `0xDEMOCOND${(seedOf(marketId) % 9999).toString(16)}`,
    question: `[DEMO] Will demo event ${marketId} happen?`,
    category: cat,
    yesPrice: Math.round(yes * 1000) / 1000,
    noPrice: Math.round((1 - yes) * 1000) / 1000,
    bestBid: Math.round((yes - spread / 2) * 1000) / 1000,
    bestAsk: Math.round((yes + spread / 2) * 1000) / 1000,
    spread: Math.round(spread * 1000) / 1000,
    liquidity: Math.round(1500 + rnd() * 95000),
    volume: Math.round(1000 + rnd() * 500000),
    timeToResolutionHours: Math.round(ttr),
    resolved,
    resolvedOutcome: winner,
    raw: { demo: true },
  };
}
