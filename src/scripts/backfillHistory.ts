// Backfill a HISTORICAL cohort of resolved paper trades so the dashboard has a
// track record on first run. Represents "the bot has been running for weeks."
// Still 100% DEMO data. The bot's edge emerges naturally: tracked (skilled)
// wallets win more, and the bot's filters skip the late/illiquid copies that
// hurt the blind-copy benchmark.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getWalletTrades } from "@/adapters/trades";
import { getMarket } from "@/adapters/markets";
import { scoreTrade } from "@/scoring/trade";
import { realizedPnlOnResolution } from "@/scoring/paper";
import { getActiveRules, j, parse } from "@/engine/helpers";

export async function backfillHistory(days = 14) {
  const { rules, version } = await getActiveRules();
  const tracked = await prisma.walletProfile.findMany({
    where: { status: { in: ["track", "watch"] } },
    orderBy: { globalScore: "desc" },
    take: 30,
  });

  let copies = 0, resolvedCopies = 0, reviews = 0;

  for (const w of tracked) {
    const { data: raw } = await getWalletTrades(w.address, 30);
    for (const t of raw) {
      const { data: market } = await getMarket(t.marketId);
      // Only backfill on RESOLVED markets (they form the track record).
      if (!market.resolved || !market.resolvedOutcome) continue;

      const catStrengths = parse<Record<string, number>>(w.categoryStrengthsJson, {});
      const cat = t.marketCategory ?? market.category ?? "Uncategorized";
      // At the historical entry moment, current price ≈ wallet entry price
      // (the bot copies fresh), so priceMove is small — decision reflects the
      // wallet/market quality, not hindsight.
      const entryPrice = t.price;
      const currentAtEntry = t.price + (Math.random() - 0.5) * 0.02;

      const score = scoreTrade(
        {
          walletGlobalScore: w.globalScore,
          walletCategoryScore: catStrengths[cat] ?? 0.3,
          walletConsistency: w.consistencyScore,
          walletCopyability: w.copyabilityScore,
          walletRoiScore: Math.max(0, Math.min(1, (w.roi30d + 0.4) / 1.4)),
          currentPrice: currentAtEntry,
          walletEntryPrice: entryPrice,
          spread: market.spread ?? 0.03,
          liquidity: market.liquidity ?? 0,
          timeToResolutionHours: 48, // pretend it had room at entry time
          category: cat,
        },
        rules,
      );

      const openedAt = new Date(Date.now() - Math.random() * days * 86400 * 1000);

      const observed = await prisma.observedTrade.create({
        data: {
          walletAddress: w.address, marketId: t.marketId, conditionId: t.conditionId ?? null,
          marketQuestion: t.marketQuestion, marketCategory: cat, outcome: t.outcome, side: t.side,
          walletEntryPrice: entryPrice, detectedPrice: currentAtEntry, size: t.size,
          timestamp: openedAt, rawTradeJson: j({ ...(t.raw as object), backfill: true }),
        },
      });

      const dj = await prisma.decisionJournal.create({
        data: {
          observedTradeId: observed.id, walletAddress: w.address, marketId: t.marketId,
          decision: score.decision, copyScore: score.copyScore, confidence: score.confidence,
          reasonsJson: j(score.reasons), risksJson: j(score.risks),
          walletQualityScore: score.breakdown.walletQualityScore, roiScore: score.breakdown.roiScore,
          consistencyScore: score.breakdown.consistencyScore, copyabilityScore: score.breakdown.copyabilityScore,
          categoryFitScore: score.breakdown.categoryFitScore, entryTimingScore: score.breakdown.entryTimingScore,
          spreadScore: score.breakdown.spreadScore, liquidityScore: score.breakdown.liquidityScore,
          thesisScore: score.breakdown.thesisScore, simulatedPositionSize: score.simulatedPositionSize,
          ruleSetVersion: version, createdAt: openedAt,
        },
      });

      const won = market.resolvedOutcome.toLowerCase() === t.outcome.toLowerCase();

      if (score.decision === "paper_copy") {
        const size = score.simulatedPositionSize;
        const realized = realizedPnlOnResolution(size, entryPrice, won);
        const resolvedAt = new Date(openedAt.getTime() + Math.random() * 3 * 86400 * 1000);
        const pt = await prisma.paperTrade.create({
          data: {
            decisionJournalId: dj.id, walletAddress: w.address, marketId: t.marketId,
            outcome: t.outcome, side: t.side, entryPrice, currentPrice: won ? 1 : 0,
            simulatedPositionSize: size, unrealizedPnl: 0, realizedPnl: realized,
            status: "resolved", openedAt, resolvedAt,
          },
        });
        // A few hourly snapshots forming a curve to resolution.
        for (let h = 1; h <= 5; h++) {
          const p = entryPrice + ((won ? 1 : 0) - entryPrice) * (h / 5);
          const shares = size / (entryPrice || 0.5);
          await prisma.pnlSnapshot.create({
            data: { paperTradeId: pt.id, price: p, pnl: Math.round((shares * p - size) * 100) / 100,
              collectedAt: new Date(openedAt.getTime() + h * 3600 * 1000) },
          });
        }
        await prisma.outcomeReview.create({
          data: { decisionJournalId: dj.id, paperTradeId: pt.id, finalOutcome: market.resolvedOutcome,
            simulatedPnl: realized, wasDecisionGood: realized >= 0,
            lessonsJson: j([realized >= 0 ? "Copied trade resolved profitably." : "Copied trade lost — review filters."]),
            createdAt: resolvedAt },
        });
        copies++; resolvedCopies++; reviews++;
      } else {
        // Watchlist/skip: record the hypothetical outcome for benchmark.
        const hypoPnl = realizedPnlOnResolution(score.simulatedPositionSize || 10, entryPrice, won);
        await prisma.outcomeReview.create({
          data: { decisionJournalId: dj.id, finalOutcome: market.resolvedOutcome, simulatedPnl: hypoPnl,
            wasDecisionGood: !won, // good skip if it would have lost
            lessonsJson: j([won ? "Skipped/watched a would-be winner (missed winner)." : "Skipped/watched a would-be loser (avoided loser)."]),
            createdAt: openedAt },
        });
        reviews++;
      }
    }
  }

  log.demo(`Backfill: ${copies} historical paper copies (${resolvedCopies} resolved), ${reviews} reviews.`);
  return { copies, resolvedCopies, reviews };
}
