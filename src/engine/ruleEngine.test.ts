import { describe, it, expect } from "vitest";
import { proposeRuleChanges, walletsToDowngrade, type PerfEvidence } from "@/engine/ruleEngine";
import { DEFAULT_RULES, cloneRules } from "@/scoring/rules";

function evidence(p: Partial<PerfEvidence>): PerfEvidence {
  return { copyTrades: [], walletPaperPnl: {}, volatileHighRoiCount: 0, totalResolvedCopies: 0, ...p };
}

describe("automatic rule changes", () => {
  it("makes no change without evidence", () => {
    const { changes } = proposeRuleChanges(DEFAULT_RULES, evidence({}));
    expect(changes).toHaveLength(0);
  });

  it("lowers max spread when wide-spread copies lose", () => {
    const copyTrades = Array.from({ length: 6 }, () => ({ pnl: -5, spread: 0.045, liquidity: 20000, wasLate: false }));
    const { next, changes } = proposeRuleChanges(DEFAULT_RULES, evidence({ copyTrades }));
    expect(next.copyability.maxSpread).toBeLessThan(DEFAULT_RULES.copyability.maxSpread);
    expect(changes.some((c) => c.path === "copyability.maxSpread")).toBe(true);
    const c = changes.find((c) => c.path === "copyability.maxSpread")!;
    expect(c.reason).toBeTruthy();
    expect(c.evidence).toBeTruthy();
    expect(c.expectedImprovement).toBeTruthy();
  });

  it("raises min liquidity when thin copies lose", () => {
    const copyTrades = Array.from({ length: 6 }, () => ({ pnl: -4, spread: 0.02, liquidity: 1000, wasLate: false }));
    const { next } = proposeRuleChanges(DEFAULT_RULES, evidence({ copyTrades }));
    expect(next.copyability.minLiquidity).toBeGreaterThan(DEFAULT_RULES.copyability.minLiquidity);
  });

  it("reduces allowed price move when late entries lose", () => {
    const copyTrades = Array.from({ length: 6 }, () => ({ pnl: -6, spread: 0.02, liquidity: 20000, wasLate: true }));
    const { next } = proposeRuleChanges(DEFAULT_RULES, evidence({ copyTrades }));
    expect(next.copyability.maxPriceMoveSinceEntry).toBeLessThan(DEFAULT_RULES.copyability.maxPriceMoveSinceEntry);
  });

  it("increases consistency weight when high-ROI wallets are volatile", () => {
    const { next } = proposeRuleChanges(DEFAULT_RULES, evidence({ volatileHighRoiCount: 4, totalResolvedCopies: 10 }));
    expect(next.weights.consistency).toBeGreaterThan(DEFAULT_RULES.weights.consistency);
  });

  it("does not mutate the input ruleset", () => {
    const before = cloneRules(DEFAULT_RULES);
    const copyTrades = Array.from({ length: 6 }, () => ({ pnl: -5, spread: 0.045, liquidity: 20000, wasLate: false }));
    proposeRuleChanges(DEFAULT_RULES, evidence({ copyTrades }));
    expect(DEFAULT_RULES).toEqual(before);
  });

  it("flags wallets with poor paper PnL for downgrade", () => {
    const bad = walletsToDowngrade(evidence({ walletPaperPnl: { "0xA": -30, "0xB": 5 } }));
    expect(bad).toContain("0xA");
    expect(bad).not.toContain("0xB");
  });
});
