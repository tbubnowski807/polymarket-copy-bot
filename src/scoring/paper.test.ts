import { describe, it, expect } from "vitest";
import { unrealizedPnl, realizedPnlOnResolution, sharesFromSize } from "@/scoring/paper";

describe("paper PnL math", () => {
  it("computes shares from size and entry price", () => {
    expect(sharesFromSize(10, 0.5)).toBe(20);
  });

  it("unrealized PnL is positive when price rises above entry", () => {
    // $10 at 0.50 = 20 shares; at 0.60 -> worth $12 -> +$2
    expect(unrealizedPnl(10, 0.5, 0.6)).toBeCloseTo(2, 5);
  });

  it("unrealized PnL is negative when price falls", () => {
    expect(unrealizedPnl(10, 0.5, 0.4)).toBeCloseTo(-2, 5);
  });

  it("winning resolution pays shares * $1 minus stake", () => {
    // $10 at 0.5 = 20 shares -> $20 payout -> +$10
    expect(realizedPnlOnResolution(10, 0.5, true)).toBeCloseTo(10, 5);
  });

  it("losing resolution loses the full stake", () => {
    expect(realizedPnlOnResolution(10, 0.5, false)).toBeCloseTo(-10, 5);
  });

  it("handles zero entry price safely", () => {
    expect(sharesFromSize(10, 0)).toBe(0);
  });
});
