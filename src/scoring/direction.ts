// Decides how to handle an observed trade's DIRECTION (buy vs sell), separate
// from the copy-quality score. This is the fix for the bug where the bot
// treated a wallet's SELL (an exit) as if it were a fresh entry.
//
// Rules:
//  - BUY  = the wallet is ENTERING a position. This is copyable (subject to the
//           normal quality score).
//  - SELL = the wallet is EXITING. We must NOT open a fresh position from a sell.
//           Instead we consider MIRRORING their exit (closing our own copied
//           position) — but ONLY if the seller is still reliable. An unreliable
//           wallet's sell is ignored.
import type { Rules } from "@/scoring/rules";

export type TradeAction =
  | "consider_entry"   // a BUY -> run the normal copy scorer
  | "mirror_exit"      // a SELL from a reliable wallet -> close our copy if we hold one
  | "ignore_exit";     // a SELL from an unreliable wallet, or exits disabled -> do nothing

export interface DirectionInput {
  side: "BUY" | "SELL";
  walletGlobalScore: number;
  walletStatus: string; // "track" | "watch" | "ignore"
}

export function classifyTradeDirection(input: DirectionInput, rules: Rules): TradeAction {
  if (input.side === "BUY") return "consider_entry";

  // It's a SELL (an exit).
  if (!rules.exit.mirrorWalletSell) return "ignore_exit";

  // Reliability gate: only mirror exits from genuinely reliable wallets.
  const reliable =
    input.walletStatus === "track" &&
    input.walletGlobalScore >= rules.exit.minWalletScoreToMirror;

  return reliable ? "mirror_exit" : "ignore_exit";
}
