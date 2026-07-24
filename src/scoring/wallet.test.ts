import { describe, it, expect } from "vitest";
import {
  scoreWallet, computeOneHitWonderPenalty, computeCopyability,
  computeConsistency, statusForScore, type ScoredTrade,
} from "@/scoring/wallet";
import { DEFAULT_RULES } from "@/scoring/rules";

function trade(p: Partial<ScoredTrade>): ScoredTrade {
  return {
    walletAddress: "0xTEST", marketId: "m1", marketQuestion: "q", outcome: "Yes",
    side: "BUY", price: 0.5, size: 100, timestamp: new Date().toISOString(), raw: {},
    resolved: true, won: true, profit: 50, liquidity: 10000, spread: 0.02, entryTiming: 0.2,
    ...p,
  };
}

describe("wallet scoring", () => {
  it("produces a global score in [0,1]", () => {
    const trades = Array.from({ length: 12 }, (_, i) => trade({ profit: i % 2 ? 40 : -20, won: i % 2 === 1 }));
    const m = scoreWallet(trades, DEFAULT_RULES);
    expect(m.globalScore).toBeGreaterThanOrEqual(0);
    expect(m.globalScore).toBeLessThanOrEqual(1);
  });

  it("rewards a consistent winner over a volatile one", () => {
    const steady = Array.from({ length: 12 }, () => trade({ profit: 30, won: true }));
    const volatile = Array.from({ length: 12 }, (_, i) =>
      trade({ profit: i === 0 ? 400 : -25, won: i === 0 }));
    const a = scoreWallet(steady, DEFAULT_RULES);
    const b = scoreWallet(volatile, DEFAULT_RULES);
    expect(a.globalScore).toBeGreaterThan(b.globalScore);
  });

  it("computes win rate from resolved trades only", () => {
    const trades = [
      trade({ resolved: true, won: true }), trade({ resolved: true, won: false, profit: -10 }),
      trade({ resolved: false, won: undefined, profit: undefined }),
    ];
    const m = scoreWallet(trades, DEFAULT_RULES);
    expect(m.resolvedTradeCount30d).toBe(2);
    expect(m.winRate30d).toBe(0.5);
  });
});

describe("one-hit-wonder penalty", () => {
  it("penalizes when one trade dominates profit", () => {
    const trades = [
      trade({ profit: 5000, won: true }),
      ...Array.from({ length: 9 }, () => trade({ profit: 10, won: true })),
    ];
    const { penalty, note } = computeOneHitWonderPenalty(trades, DEFAULT_RULES);
    expect(penalty).toBeGreaterThan(0);
    expect(note).toMatch(/one-hit-wonder|% of all profit/i);
  });

  it("does not penalize a balanced winner", () => {
    const trades = Array.from({ length: 12 }, () => trade({ profit: 40, won: true }));
    const { penalty } = computeOneHitWonderPenalty(trades, DEFAULT_RULES);
    expect(penalty).toBe(0);
  });

  it("penalizes too-few resolved trades", () => {
    const trades = [trade({ profit: 30, won: true }), trade({ profit: 20, won: true })];
    const { penalty } = computeOneHitWonderPenalty(trades, DEFAULT_RULES);
    expect(penalty).toBeGreaterThan(0);
  });
});

describe("copyability", () => {
  it("scores liquid, tight, early markets highly", () => {
    const trades = Array.from({ length: 10 }, () => trade({ liquidity: 40000, spread: 0.01, entryTiming: 0.1 }));
    const { score } = computeCopyability(trades, DEFAULT_RULES);
    expect(score).toBeGreaterThan(0.6);
  });
  it("scores illiquid, wide, late markets poorly", () => {
    const trades = Array.from({ length: 10 }, () => trade({ liquidity: 200, spread: 0.12, entryTiming: 0.9 }));
    const { score, note } = computeCopyability(trades, DEFAULT_RULES);
    expect(score).toBeLessThan(0.4);
    expect(note).toMatch(/liquidity|spread|late/i);
  });
});

describe("consistency", () => {
  it("returns higher for steady returns", () => {
    const steady = Array.from({ length: 10 }, () => trade({ profit: 25, won: true }));
    const noisy = Array.from({ length: 10 }, (_, i) => trade({ profit: i % 2 ? 300 : -280, won: i % 2 === 1 }));
    expect(computeConsistency(steady)).toBeGreaterThan(computeConsistency(noisy));
  });
});

describe("status assignment", () => {
  it("maps scores to track/watch/ignore", () => {
    expect(statusForScore(0.8, DEFAULT_RULES)).toBe("track");
    expect(statusForScore(0.45, DEFAULT_RULES)).toBe("watch");
    expect(statusForScore(0.1, DEFAULT_RULES)).toBe("ignore");
  });
});
