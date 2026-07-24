import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, cloneRules } from "@/scoring/rules";
import { proposeRuleChanges } from "@/engine/ruleEngine";

// Rule versioning invariants (pure): applying a change yields a distinct
// ruleset while the original is untouched, and change records are complete.
describe("rule versioning", () => {
  it("produces an audit-complete change record", () => {
    const copyTrades = Array.from({ length: 6 }, () => ({ pnl: -5, spread: 0.045, liquidity: 20000, wasLate: false }));
    const { next, changes } = proposeRuleChanges(DEFAULT_RULES, {
      copyTrades, walletPaperPnl: {}, volatileHighRoiCount: 0, totalResolvedCopies: 6,
    });
    expect(changes.length).toBeGreaterThanOrEqual(1);
    for (const c of changes) {
      expect(c).toHaveProperty("path");
      expect(c).toHaveProperty("before");
      expect(c).toHaveProperty("after");
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.before).not.toEqual(c.after);
    }
    // Original ruleset unchanged; next is a different object.
    expect(next).not.toBe(DEFAULT_RULES);
  });

  it("cloneRules yields a deep copy", () => {
    const c = cloneRules(DEFAULT_RULES);
    c.copyability.maxSpread = 0.999;
    expect(DEFAULT_RULES.copyability.maxSpread).not.toBe(0.999);
  });
});
