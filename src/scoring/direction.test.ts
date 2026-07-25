import { describe, it, expect } from "vitest";
import { classifyTradeDirection } from "@/scoring/direction";
import { DEFAULT_RULES, cloneRules } from "@/scoring/rules";

describe("trade direction handling (buy = entry, sell = exit)", () => {
  it("treats a BUY as a candidate entry", () => {
    const a = classifyTradeDirection(
      { side: "BUY", walletGlobalScore: 0.7, walletStatus: "track" },
      DEFAULT_RULES,
    );
    expect(a).toBe("consider_entry");
  });

  it("NEVER opens a position from a SELL (the original bug)", () => {
    const a = classifyTradeDirection(
      { side: "SELL", walletGlobalScore: 0.9, walletStatus: "track" },
      DEFAULT_RULES,
    );
    // Must not be 'consider_entry' — a sell can only mirror or be ignored.
    expect(a).not.toBe("consider_entry");
  });

  it("mirrors a SELL only from a reliable (track + high score) wallet", () => {
    const a = classifyTradeDirection(
      { side: "SELL", walletGlobalScore: 0.7, walletStatus: "track" },
      DEFAULT_RULES,
    );
    expect(a).toBe("mirror_exit");
  });

  it("IGNORES a SELL from an unreliable wallet (low score)", () => {
    const a = classifyTradeDirection(
      { side: "SELL", walletGlobalScore: 0.3, walletStatus: "track" },
      DEFAULT_RULES,
    );
    expect(a).toBe("ignore_exit");
  });

  it("IGNORES a SELL from a non-tracked wallet even if score is high", () => {
    const a = classifyTradeDirection(
      { side: "SELL", walletGlobalScore: 0.9, walletStatus: "watch" },
      DEFAULT_RULES,
    );
    expect(a).toBe("ignore_exit");
  });

  it("respects the master switch: mirrorWalletSell = false ignores all exits", () => {
    const rules = cloneRules(DEFAULT_RULES);
    rules.exit.mirrorWalletSell = false;
    const a = classifyTradeDirection(
      { side: "SELL", walletGlobalScore: 0.9, walletStatus: "track" },
      rules,
    );
    expect(a).toBe("ignore_exit");
  });
});
