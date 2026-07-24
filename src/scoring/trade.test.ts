import { describe, it, expect } from "vitest";
import { scoreTrade, sizeFromConfidence, type TradeScoreInput } from "@/scoring/trade";
import { DEFAULT_RULES } from "@/scoring/rules";

function input(p: Partial<TradeScoreInput>): TradeScoreInput {
  return {
    walletGlobalScore: 0.7, walletCategoryScore: 0.7, walletConsistency: 0.7,
    walletCopyability: 0.7, walletRoiScore: 0.7, currentPrice: 0.5, walletEntryPrice: 0.5,
    spread: 0.02, liquidity: 20000, timeToResolutionHours: 48, category: "Crypto",
    ...p,
  };
}

describe("trade scoring", () => {
  it("recommends paper_copy for a strong, fresh, liquid signal", () => {
    const s = scoreTrade(input({}), DEFAULT_RULES);
    expect(s.decision).toBe("paper_copy");
    expect(s.simulatedPositionSize).toBeGreaterThanOrEqual(DEFAULT_RULES.sizing.minSizeUsd);
    expect(s.simulatedPositionSize).toBeLessThanOrEqual(DEFAULT_RULES.sizing.maxSizeUsd);
  });

  it("skips weak wallets via the hard gate", () => {
    const s = scoreTrade(input({ walletGlobalScore: 0.2 }), DEFAULT_RULES);
    expect(s.decision).not.toBe("paper_copy");
    expect(s.simulatedPositionSize).toBe(0);
  });

  it("skips/downgrades when price already moved too far (late entry)", () => {
    const s = scoreTrade(input({ walletEntryPrice: 0.5, currentPrice: 0.7 }), DEFAULT_RULES);
    expect(s.decision).not.toBe("paper_copy");
    expect(s.risks.join(" ")).toMatch(/late|moved/i);
  });

  it("skips illiquid markets", () => {
    const s = scoreTrade(input({ liquidity: 100 }), DEFAULT_RULES);
    expect(s.decision).not.toBe("paper_copy");
    expect(s.risks.join(" ")).toMatch(/liquidity/i);
  });

  it("skips wide-spread markets", () => {
    const s = scoreTrade(input({ spread: 0.15 }), DEFAULT_RULES);
    expect(s.decision).not.toBe("paper_copy");
    expect(s.risks.join(" ")).toMatch(/spread/i);
  });

  it("always keeps simulated size within $5-$20 bounds", () => {
    for (const c of [0, 0.25, 0.5, 0.75, 1]) {
      const size = sizeFromConfidence(c, DEFAULT_RULES);
      expect(size).toBeGreaterThanOrEqual(5);
      expect(size).toBeLessThanOrEqual(20);
    }
  });

  it("higher confidence yields larger size", () => {
    expect(sizeFromConfidence(0.9, DEFAULT_RULES)).toBeGreaterThan(sizeFromConfidence(0.1, DEFAULT_RULES));
  });
});
