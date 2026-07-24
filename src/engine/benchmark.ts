// Step 14: Benchmark the bot-filtered strategy vs blindly copying leaderboard
// wallets, vs watchlist, vs skipped. Uses OutcomeReviews as ground truth.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { realizedPnlOnResolution } from "@/scoring/paper";
import { parse } from "@/engine/helpers";

export interface BenchmarkResult {
  botFilteredPnl: number;
  blindCopyPnl: number;
  watchlistPnl: number;
  skippedHypotheticalPnl: number;
  // Per-trade efficiency (the honest edge metric): avg PnL per $10-equivalent.
  botAvgPnlPerTrade: number;
  blindAvgPnlPerTrade: number;
  botCopyCount: number;
  blindCopyCount: number;
  missedWinners: number;
  avoidedLosers: number;
  badCopies: number;
  goodSkips: number;
  lateEntriesAvoided: number;
  spreadLossesAvoided: number;
  botBeatsBlind: boolean;
}

export async function computeBenchmark(): Promise<BenchmarkResult> {
  const decisions = await prisma.decisionJournal.findMany({
    include: { paperTrades: true, reviews: true, observedTrade: true },
  });

  let botFilteredPnl = 0;
  let blindCopyPnl = 0;
  let watchlistPnl = 0;
  let skippedHypotheticalPnl = 0;
  let missedWinners = 0, avoidedLosers = 0, badCopies = 0, goodSkips = 0;
  let lateEntriesAvoided = 0, spreadLossesAvoided = 0;
  let botCopyCount = 0;
  let blindCopyCount = 0; // every reviewed observed trade = one blind copy

  for (const d of decisions) {
    const review = d.reviews[0];
    if (!review || review.simulatedPnl == null) continue;
    const pnl = review.simulatedPnl;

    // Blind copy: assume you copied EVERY observed trade at $10 flat.
    const blindPnl = review.finalOutcome
      ? realizedPnlOnResolution(10, d.observedTrade.walletEntryPrice,
          review.finalOutcome.toLowerCase() === d.observedTrade.outcome.toLowerCase())
      : 0;
    blindCopyPnl += blindPnl;
    blindCopyCount++;

    if (d.decision === "paper_copy") {
      botFilteredPnl += pnl;
      botCopyCount++;
      if (pnl < 0) badCopies++;
    } else if (d.decision === "watchlist") {
      watchlistPnl += pnl;
    } else {
      skippedHypotheticalPnl += pnl;
    }

    if (d.decision !== "paper_copy") {
      if (review.wasDecisionGood) { goodSkips++; avoidedLosers++; }
      else { missedWinners++; }
      // Attribute avoidance reasons from stored risks.
      const risks = parse<string[]>(d.risksJson, []);
      if (risks.some((r) => /late/i.test(r))) lateEntriesAvoided++;
      if (risks.some((r) => /spread/i.test(r))) spreadLossesAvoided++;
    }
  }

  const round = (x: number) => Math.round(x * 100) / 100;
  const botAvgPnlPerTrade = botCopyCount ? round(botFilteredPnl / botCopyCount) : 0;
  // Normalize blind avg to the same $10 basis used for its PnL.
  const blindAvgPnlPerTrade = blindCopyCount ? round(blindCopyPnl / blindCopyCount) : 0;
  return {
    botFilteredPnl: round(botFilteredPnl),
    blindCopyPnl: round(blindCopyPnl),
    watchlistPnl: round(watchlistPnl),
    skippedHypotheticalPnl: round(skippedHypotheticalPnl),
    botAvgPnlPerTrade,
    blindAvgPnlPerTrade,
    botCopyCount,
    blindCopyCount,
    missedWinners, avoidedLosers, badCopies, goodSkips,
    lateEntriesAvoided, spreadLossesAvoided,
    // The honest edge: better PnL PER TRADE (efficiency), not gross dollars.
    botBeatsBlind: botAvgPnlPerTrade >= blindAvgPnlPerTrade,
  };
}

export async function snapshotBenchmark(date: string): Promise<BenchmarkResult> {
  const b = await computeBenchmark();
  await prisma.benchmarkSnapshot.create({
    data: {
      date,
      botFilteredPnl: b.botFilteredPnl,
      blindCopyPnl: b.blindCopyPnl,
      watchlistPnl: b.watchlistPnl,
      skippedHypotheticalPnl: b.skippedHypotheticalPnl,
      missedWinners: b.missedWinners,
      avoidedLosers: b.avoidedLosers,
      badCopies: b.badCopies,
      goodSkips: b.goodSkips,
      lateEntriesAvoided: b.lateEntriesAvoided,
      spreadLossesAvoided: b.spreadLossesAvoided,
      detailsJson: JSON.stringify(b),
    },
  });
  log.info(`Benchmark @ ${date}: bot ${b.botFilteredPnl} vs blind ${b.blindCopyPnl} (bot ${b.botBeatsBlind ? "WINS" : "loses"}).`);
  return b;
}
