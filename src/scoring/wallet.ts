// Wallet scoring. Pure functions (no DB) so they're easy to unit test.
import type { RawTrade } from "@/lib/types";
import type { Rules } from "./rules";

export interface WalletMetrics {
  roi30d: number; // fraction, e.g. 0.35 = +35%
  consistencyScore: number; // 0..1
  copyabilityScore: number; // 0..1
  oneHitWonderPenalty: number; // 0..1 (subtracted)
  globalScore: number; // 0..1 final
  bestCategory?: string;
  categoryStrengths: Record<string, number>;
  averageTradeSize: number;
  tradeCount30d: number;
  resolvedTradeCount30d: number;
  winRate30d: number; // 0..1
  averageLiquidity: number;
  averageSpread: number;
  averageEntryTiming: number; // 0..1 fraction of market life at entry
  copyabilityNotes: string;
  riskNotes: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// A resolved trade carries a realized profit (per-trade PnL). For live data
// this is computed from entry price vs resolution; for demo data we estimate.
export interface ScoredTrade extends RawTrade {
  resolved?: boolean;
  profit?: number; // realized USD profit if resolved
  won?: boolean;
  liquidity?: number;
  spread?: number;
  entryTiming?: number; // 0..1 fraction of market life elapsed at entry
}

export function computeConsistency(trades: ScoredTrade[]): number {
  const resolved = trades.filter((t) => t.resolved && typeof t.profit === "number");
  if (resolved.length < 2) return 0.2; // not enough info -> low-ish
  const profits = resolved.map((t) => t.profit as number);
  const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
  const variance =
    profits.reduce((a, b) => a + (b - mean) ** 2, 0) / profits.length;
  const std = Math.sqrt(variance);
  // Coefficient of variation of returns; lower CV = more consistent.
  const denom = Math.abs(mean) + 1e-6;
  const cv = std / denom;
  // win rate contributes too
  const winRate = resolved.filter((t) => t.won).length / resolved.length;
  const consistencyFromCv = clamp01(1 - cv / 3);
  return clamp01(0.5 * consistencyFromCv + 0.5 * winRate);
}

// One-hit-wonder penalty: if a single trade dominates total profit, penalize.
export function computeOneHitWonderPenalty(
  trades: ScoredTrade[],
  rules: Rules,
): { penalty: number; note: string } {
  const winners = trades
    .filter((t) => t.resolved && (t.profit ?? 0) > 0)
    .map((t) => t.profit as number)
    .sort((a, b) => b - a);
  const totalProfit = winners.reduce((a, b) => a + b, 0);
  const resolvedCount = trades.filter((t) => t.resolved).length;

  let penalty = 0;
  const notes: string[] = [];

  if (resolvedCount < rules.oneHitWonder.minResolvedTrades) {
    penalty += rules.oneHitWonder.penaltyWeight * 0.5;
    notes.push(
      `Only ${resolvedCount} resolved trades (< ${rules.oneHitWonder.minResolvedTrades} required) — low confidence.`,
    );
  }

  if (totalProfit > 0 && winners.length > 0) {
    const topShare = winners[0] / totalProfit;
    if (topShare >= rules.oneHitWonder.maxSingleTradeProfitShare) {
      const scaled =
        rules.oneHitWonder.penaltyWeight *
        clamp01(
          (topShare - rules.oneHitWonder.maxSingleTradeProfitShare) /
            (1 - rules.oneHitWonder.maxSingleTradeProfitShare),
        );
      penalty += scaled;
      notes.push(
        `One trade produced ${(topShare * 100).toFixed(0)}% of all profit (one-hit-wonder risk).`,
      );
    }
  }

  return {
    penalty: clamp01(penalty),
    note: notes.join(" ") || "No one-hit-wonder red flags.",
  };
}

export function computeCopyability(
  trades: ScoredTrade[],
  rules: Rules,
): { score: number; note: string; avgLiquidity: number; avgSpread: number; avgEntryTiming: number } {
  if (trades.length === 0) {
    return { score: 0, note: "No trades observed.", avgLiquidity: 0, avgSpread: 0, avgEntryTiming: 0.5 };
  }
  const liqs = trades.map((t) => t.liquidity ?? 0);
  const spreads = trades.map((t) => t.spread ?? 0.03);
  const timings = trades.map((t) => t.entryTiming ?? 0.5);
  const avgLiquidity = avg(liqs);
  const avgSpread = avg(spreads);
  const avgEntryTiming = avg(timings);

  const liqScore = clamp01(avgLiquidity / (rules.copyability.minLiquidity * 4));
  const spreadScore = clamp01(1 - avgSpread / (rules.copyability.maxSpread * 2));
  const timingScore = clamp01(1 - avgEntryTiming / rules.copyability.maxEntryTiming);

  const score = clamp01(0.4 * liqScore + 0.35 * spreadScore + 0.25 * timingScore);
  const notes: string[] = [];
  if (avgLiquidity < rules.copyability.minLiquidity)
    notes.push(`Avg liquidity $${avgLiquidity.toFixed(0)} below min $${rules.copyability.minLiquidity}.`);
  if (avgSpread > rules.copyability.maxSpread)
    notes.push(`Avg spread ${(avgSpread * 100).toFixed(1)}% above max ${(rules.copyability.maxSpread * 100).toFixed(1)}%.`);
  if (avgEntryTiming > rules.copyability.maxEntryTiming)
    notes.push(`Enters late (avg ${(avgEntryTiming * 100).toFixed(0)}% into market life).`);

  return {
    score,
    note: notes.join(" ") || "Markets are generally copyable (liquid, tight, early).",
    avgLiquidity,
    avgSpread,
    avgEntryTiming,
  };
}

export function computeCategoryStrengths(
  trades: ScoredTrade[],
): { strengths: Record<string, number>; best?: string } {
  const byCat: Record<string, { wins: number; total: number; profit: number }> = {};
  for (const t of trades) {
    const c = t.marketCategory ?? "Uncategorized";
    byCat[c] ??= { wins: 0, total: 0, profit: 0 };
    if (t.resolved) {
      byCat[c].total += 1;
      if (t.won) byCat[c].wins += 1;
      byCat[c].profit += t.profit ?? 0;
    }
  }
  const strengths: Record<string, number> = {};
  let best: string | undefined;
  let bestVal = -Infinity;
  for (const [c, v] of Object.entries(byCat)) {
    const wr = v.total > 0 ? v.wins / v.total : 0;
    const score = clamp01(0.7 * wr + 0.3 * clamp01(v.profit / 5000));
    strengths[c] = Math.round(score * 100) / 100;
    if (v.total >= 2 && score > bestVal) {
      bestVal = score;
      best = c;
    }
  }
  return { strengths, best };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// Full wallet metric computation.
export function scoreWallet(trades: ScoredTrade[], rules: Rules): WalletMetrics {
  const resolved = trades.filter((t) => t.resolved);
  const winRate30d = resolved.length
    ? resolved.filter((t) => t.won).length / resolved.length
    : 0;
  const totalInvested = trades.reduce((a, t) => a + t.size, 0);
  const totalProfit = resolved.reduce((a, t) => a + (t.profit ?? 0), 0);
  const roi30d = totalInvested > 0 ? totalProfit / totalInvested : 0;

  const consistencyScore = computeConsistency(trades);
  const ohw = computeOneHitWonderPenalty(trades, rules);
  const copy = computeCopyability(trades, rules);
  const cats = computeCategoryStrengths(trades);

  const roiScore = clamp01((roi30d + 0.4) / 1.4); // map -40%..+100% -> 0..1
  const categoryEdge = cats.best ? cats.strengths[cats.best] : 0;
  const liquidityQuality = clamp01(copy.avgLiquidity / (rules.copyability.minLiquidity * 5));
  const entryTimingScore = clamp01(1 - copy.avgEntryTiming);
  const freqScore = clamp01(trades.length / 40);
  const resolvedPerf = clamp01(0.5 * winRate30d + 0.5 * clamp01((roi30d + 0.2) / 1.2));

  const w = rules.weights;
  let global =
    w.roi * roiScore +
    w.consistency * consistencyScore +
    w.copyability * copy.score +
    w.categoryEdge * categoryEdge +
    w.liquidityQuality * liquidityQuality +
    w.entryTiming * entryTimingScore +
    w.tradeFrequency * freqScore +
    w.resolvedPerformance * resolvedPerf;

  global = clamp01(global - ohw.penalty);

  const riskNotes = [ohw.note, copy.note].filter(Boolean).join(" ");

  return {
    roi30d,
    consistencyScore: round2(consistencyScore),
    copyabilityScore: round2(copy.score),
    oneHitWonderPenalty: round2(ohw.penalty),
    globalScore: round2(global),
    bestCategory: cats.best,
    categoryStrengths: cats.strengths,
    averageTradeSize: round2(totalInvested / (trades.length || 1)),
    tradeCount30d: trades.length,
    resolvedTradeCount30d: resolved.length,
    winRate30d: round2(winRate30d),
    averageLiquidity: round2(copy.avgLiquidity),
    averageSpread: round2(copy.avgSpread),
    averageEntryTiming: round2(copy.avgEntryTiming),
    copyabilityNotes: copy.note,
    riskNotes,
  };
}

export function statusForScore(global: number, rules: Rules): "track" | "watch" | "ignore" {
  if (global >= rules.status.trackMinGlobalScore) return "track";
  if (global >= rules.status.watchMinGlobalScore) return "watch";
  return "ignore";
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
