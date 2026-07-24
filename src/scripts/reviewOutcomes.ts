// Step 13 & 15: Review outcomes. For each decision with a resolved (or aged)
// paper trade, record price trajectory, final PnL, and whether the decision was
// good. Also evaluate skipped/watchlist decisions to track missed winners and
// avoided losers.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getMarket } from "@/adapters/markets";
import { realizedPnlOnResolution } from "@/scoring/paper";
import { j, isMissingMarketError } from "@/engine/helpers";

export async function reviewOutcomes() {
  // Only review decisions whose market has resolved and not yet reviewed.
  const decisions = await prisma.decisionJournal.findMany({
    include: { paperTrades: true, reviews: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  let reviewed = 0;
  let missedWinners = 0;
  let avoidedLosers = 0;
  for (const d of decisions) {
    if (d.reviews.length > 0) continue; // already reviewed
    let market;
    try {
      const res = await getMarket(d.marketId);
      market = res.data;
    } catch (err) {
      if (isMissingMarketError(err)) continue;
      throw err;
    }
    if (!market.resolved || !market.resolvedOutcome) continue;

    const observed = await prisma.observedTrade.findUnique({ where: { id: d.observedTradeId } });
    if (!observed) continue;
    const won = market.resolvedOutcome.toLowerCase() === observed.outcome.toLowerCase();

    const pt = d.paperTrades[0];
    const hypotheticalSize = d.simulatedPositionSize || 10;
    const simulatedPnl = pt
      ? pt.realizedPnl
      : realizedPnlOnResolution(hypotheticalSize, observed.walletEntryPrice, won);

    // Judge the decision:
    // - paper_copy good if it made money.
    // - skip/watchlist good if it AVOIDED a loser (would have lost).
    let wasGood: boolean;
    const lessons: string[] = [];
    if (d.decision === "paper_copy") {
      wasGood = simulatedPnl >= 0;
      lessons.push(wasGood ? "Copied trade resolved profitably." : "Copied trade lost — review wallet/market filters.");
    } else {
      // A skip/watchlist that would have won is a "missed winner"; that would
      // have lost is an "avoided loser".
      const hypoWin = won;
      if (hypoWin) { missedWinners++; wasGood = false; lessons.push("Skipped/watched a trade that would have WON (missed winner)."); }
      else { avoidedLosers++; wasGood = true; lessons.push("Skipped/watched a trade that would have LOST (avoided loser)."); }
    }

    await prisma.outcomeReview.create({
      data: {
        decisionJournalId: d.id,
        paperTradeId: pt?.id ?? null,
        priceAfter1h: null,
        priceAfter6h: null,
        priceAfter24h: null,
        finalOutcome: market.resolvedOutcome,
        simulatedPnl,
        wasDecisionGood: wasGood,
        lessonsJson: j(lessons),
      },
    });
    reviewed++;
  }

  log.info(`Reviewed ${reviewed} decisions. Missed winners: ${missedWinners}, avoided losers: ${avoidedLosers}.`);
  return { reviewed, missedWinners, avoidedLosers };
}

if (require.main === module) {
  reviewOutcomes()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Outcome review FAILED (real error): ${e.message}`); process.exit(1); });
}
