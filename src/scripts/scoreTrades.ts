// Steps 10-11: Score each un-decided ObservedTrade, write DecisionJournal, and
// for paper_copy decisions create a PaperTrade (simulated only, $5-$20).
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getMarket } from "@/adapters/markets";
import { scoreTrade } from "@/scoring/trade";
import { getActiveRules, j, parse, isMissingMarketError } from "@/engine/helpers";
import { config } from "@/lib/config";

export async function scoreTrades() {
  const { rules, version } = await getActiveRules();

  // ObservedTrades that have no decision yet.
  const decided = await prisma.decisionJournal.findMany({ select: { observedTradeId: true } });
  const decidedSet = new Set(decided.map((d) => d.observedTradeId));
  const observed = await prisma.observedTrade.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const pending = observed.filter((o) => !decidedSet.has(o.id));

  log.info(`Scoring ${pending.length} pending observed trades (ruleset v${version})...`);

  let copies = 0, watch = 0, skip = 0;
  for (const o of pending) {
    const wallet = await prisma.walletProfile.findUnique({ where: { address: o.walletAddress } });
    if (!wallet) continue;
    let market;
    try {
      const res = await getMarket(o.marketId);
      market = res.data;
    } catch (err) {
      if (isMissingMarketError(err)) continue; // can't score without market
      throw err;
    }

    const catStrengths = parse<Record<string, number>>(wallet.categoryStrengthsJson, {});
    const cat = o.marketCategory ?? market.category ?? "Uncategorized";
    const walletCategoryScore = catStrengths[cat] ?? 0.3;
    const currentPrice =
      o.outcome.toLowerCase() === "no"
        ? market.noPrice ?? (market.yesPrice != null ? 1 - market.yesPrice : 0.5)
        : market.yesPrice ?? o.walletEntryPrice;

    // Recompute a rough roiScore proxy from stored roi30d.
    const walletRoiScore = Math.max(0, Math.min(1, (wallet.roi30d + 0.4) / 1.4));

    const score = scoreTrade(
      {
        walletGlobalScore: wallet.globalScore,
        walletCategoryScore,
        walletConsistency: wallet.consistencyScore,
        walletCopyability: wallet.copyabilityScore,
        walletRoiScore,
        currentPrice,
        walletEntryPrice: o.walletEntryPrice,
        spread: market.spread ?? 0.03,
        liquidity: market.liquidity ?? 0,
        timeToResolutionHours: market.timeToResolutionHours,
        category: cat,
      },
      rules,
    );

    const dj = await prisma.decisionJournal.create({
      data: {
        observedTradeId: o.id,
        walletAddress: o.walletAddress,
        marketId: o.marketId,
        decision: score.decision,
        copyScore: score.copyScore,
        confidence: score.confidence,
        reasonsJson: j(score.reasons),
        risksJson: j(score.risks),
        walletQualityScore: score.breakdown.walletQualityScore,
        roiScore: score.breakdown.roiScore,
        consistencyScore: score.breakdown.consistencyScore,
        copyabilityScore: score.breakdown.copyabilityScore,
        categoryFitScore: score.breakdown.categoryFitScore,
        entryTimingScore: score.breakdown.entryTimingScore,
        spreadScore: score.breakdown.spreadScore,
        liquidityScore: score.breakdown.liquidityScore,
        thesisScore: score.breakdown.thesisScore,
        simulatedPositionSize: score.simulatedPositionSize,
        ruleSetVersion: version,
      },
    });

    if (score.decision === "paper_copy") {
      // SAFETY GATE: this is a simulated position only. Never a real order.
      if (config.safety.REAL_TRADING_ENABLED) {
        throw new Error("SAFETY VIOLATION: real trading is disabled in v1 and must never be enabled here.");
      }
      const size = Math.max(
        rules.sizing.minSizeUsd,
        Math.min(rules.sizing.maxSizeUsd, score.simulatedPositionSize),
      );
      await prisma.paperTrade.create({
        data: {
          decisionJournalId: dj.id,
          walletAddress: o.walletAddress,
          marketId: o.marketId,
          outcome: o.outcome,
          side: o.side,
          entryPrice: currentPrice,
          currentPrice,
          simulatedPositionSize: size,
          status: "open",
        },
      });
      copies++;
    } else if (score.decision === "watchlist") watch++;
    else skip++;
  }

  log.info(`Decisions -> paper_copy: ${copies}, watchlist: ${watch}, skip: ${skip}`);
  return { copies, watch, skip };
}

if (require.main === module) {
  scoreTrades()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Trade scoring FAILED (real error): ${e.message}`); process.exit(1); });
}
