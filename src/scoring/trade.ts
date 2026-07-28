// Trade scoring: given a new observed trade + market snapshot + wallet quality,
// produce a copyScore, a decision (paper_copy | watchlist | skip), score
// breakdown, reasons, risks, and a simulated position size.
import type { Rules } from "./rules";

export interface TradeScoreInput {
  walletGlobalScore: number; // 0..1
  walletCategoryScore: number; // 0..1 for this market's category
  walletConsistency: number; // 0..1
  walletCopyability: number; // 0..1
  walletRoiScore: number; // 0..1
  currentPrice: number; // 0..1
  walletEntryPrice: number; // 0..1
  spread: number; // absolute, e.g. 0.03
  liquidity: number; // USD
  timeToResolutionHours?: number;
  category?: string;
  thesisClarity?: number; // 0..1 optional prior
}

export interface TradeScore {
  copyScore: number; // 0..1
  confidence: number; // 0..1
  decision: "paper_copy" | "watchlist" | "skip";
  breakdown: {
    walletQualityScore: number;
    roiScore: number;
    consistencyScore: number;
    copyabilityScore: number;
    categoryFitScore: number;
    entryTimingScore: number;
    spreadScore: number;
    liquidityScore: number;
    thesisScore: number;
  };
  reasons: string[];
  risks: string[];
  simulatedPositionSize: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function scoreTrade(input: TradeScoreInput, rules: Rules): TradeScore {
  const reasons: string[] = [];
  const risks: string[] = [];

  // How far has price moved since the wallet entered? Moving further into the
  // trade's favor means the edge may be gone / we'd enter late.
  const priceMove = Math.abs(input.currentPrice - input.walletEntryPrice);
  const priceMovePenalized = priceMove > rules.copyability.maxPriceMoveSinceEntry;

  const walletQualityScore = clamp01(input.walletGlobalScore);
  const roiScore = clamp01(input.walletRoiScore);
  const consistencyScore = clamp01(input.walletConsistency);
  const copyabilityScore = clamp01(input.walletCopyability);
  const categoryFitScore = clamp01(input.walletCategoryScore);

  const entryTimingScore = clamp01(
    1 - priceMove / (rules.copyability.maxPriceMoveSinceEntry * 2),
  );
  const spreadScore = clamp01(1 - input.spread / (rules.copyability.maxSpread * 2));
  const liquidityScore = clamp01(input.liquidity / (rules.copyability.minLiquidity * 4));
  const thesisScore = clamp01(input.thesisClarity ?? 0.5);

  // Weighted blend for copyScore.
  const copyScore = clamp01(
    0.26 * walletQualityScore +
      0.1 * roiScore +
      0.1 * consistencyScore +
      0.12 * copyabilityScore +
      0.1 * categoryFitScore +
      0.12 * entryTimingScore +
      0.08 * spreadScore +
      0.09 * liquidityScore +
      0.03 * thesisScore,
  );

  // Reasons / risks narrative.
  if (walletQualityScore >= 0.6) reasons.push(`Strong wallet (quality ${(walletQualityScore * 100).toFixed(0)}%).`);
  else risks.push(`Weak/unproven wallet (quality ${(walletQualityScore * 100).toFixed(0)}%).`);

  if (categoryFitScore >= 0.6) reasons.push(`Good category fit in ${input.category ?? "category"}.`);
  else risks.push(`Weak edge in ${input.category ?? "this category"}.`);

  if (priceMovePenalized)
    risks.push(
      `Price moved ${(priceMove * 100).toFixed(1)}¢ since wallet entry (> ${(rules.copyability.maxPriceMoveSinceEntry * 100).toFixed(0)}¢) — likely late.`,
    );
  else reasons.push(`Entry still fresh (price moved only ${(priceMove * 100).toFixed(1)}¢).`);

  if (input.spread > rules.copyability.maxSpread)
    risks.push(`Spread ${(input.spread * 100).toFixed(1)}% too wide to copy cleanly.`);
  if (input.liquidity < rules.copyability.minLiquidity)
    risks.push(`Liquidity $${input.liquidity.toFixed(0)} below min $${rules.copyability.minLiquidity} — hard to fill.`);
  if (input.timeToResolutionHours != null && input.timeToResolutionHours < 2)
    risks.push(`Only ${input.timeToResolutionHours.toFixed(1)}h to resolution — little room.`);

  // ABSOLUTE price gate: buying near-certain outcomes is almost pure downside
  // (tiny upside, total-loss risk). This forces a hard SKIP, not even watchlist.
  const priceTooHigh = input.currentPrice > rules.copyability.maxEntryPrice;
  const priceTooLow = input.currentPrice < rules.copyability.minEntryPrice;
  if (priceTooHigh)
    risks.push(`Price ${(input.currentPrice * 100).toFixed(0)}¢ above max entry ${(rules.copyability.maxEntryPrice * 100).toFixed(0)}¢ — too little upside to be worth the downside.`);
  if (priceTooLow)
    risks.push(`Price ${(input.currentPrice * 100).toFixed(0)}¢ below min entry ${(rules.copyability.minEntryPrice * 100).toFixed(0)}¢ — lottery-ticket longshot.`);

  // Hard gates -> force skip regardless of score.
  const hardSkip =
    input.walletGlobalScore < rules.tradeDecision.minWalletGlobalScore ||
    input.spread > rules.copyability.maxSpread ||
    input.liquidity < rules.copyability.minLiquidity ||
    priceMovePenalized;

  let decision: TradeScore["decision"];
  if (priceTooHigh || priceTooLow) {
    // Price gate is absolute: never copy AND never watchlist a bad-price entry.
    decision = "skip";
  } else if (hardSkip) {
    decision = copyScore >= rules.tradeDecision.watchlistThreshold ? "watchlist" : "skip";
  } else if (copyScore >= rules.tradeDecision.paperCopyThreshold) {
    decision = "paper_copy";
  } else if (copyScore >= rules.tradeDecision.watchlistThreshold) {
    decision = "watchlist";
  } else {
    decision = "skip";
  }

  // Confidence: distance above the paper-copy threshold, plus wallet quality.
  const confidence = clamp01(
    0.5 * clamp01((copyScore - rules.tradeDecision.watchlistThreshold) /
      Math.max(0.01, 1 - rules.tradeDecision.watchlistThreshold)) +
      0.5 * walletQualityScore,
  );

  const simulatedPositionSize =
    decision === "paper_copy" ? sizeFromConfidence(confidence, rules) : 0;

  return {
    copyScore: round2(copyScore),
    confidence: round2(confidence),
    decision,
    breakdown: {
      walletQualityScore: round2(walletQualityScore),
      roiScore: round2(roiScore),
      consistencyScore: round2(consistencyScore),
      copyabilityScore: round2(copyabilityScore),
      categoryFitScore: round2(categoryFitScore),
      entryTimingScore: round2(entryTimingScore),
      spreadScore: round2(spreadScore),
      liquidityScore: round2(liquidityScore),
      thesisScore: round2(thesisScore),
    },
    reasons,
    risks,
    simulatedPositionSize,
  };
}

// Higher confidence -> larger simulated size, always within [min, max].
export function sizeFromConfidence(confidence: number, rules: Rules): number {
  const { minSizeUsd, maxSizeUsd } = rules.sizing;
  const size = minSizeUsd + clamp01(confidence) * (maxSizeUsd - minSizeUsd);
  return Math.round(Math.max(minSizeUsd, Math.min(maxSizeUsd, size)) * 100) / 100;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
