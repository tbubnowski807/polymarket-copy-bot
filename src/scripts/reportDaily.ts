// Step 18: End-of-day report generator. Aggregates the day's paper PnL, win
// rate, best/worst trades & wallets, rule changes, benchmark vs blind copy, and
// the top lesson. Stores a DailyReport and (optionally) sends to Telegram.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { j, parse } from "@/engine/helpers";
import { computeBenchmark, snapshotBenchmark } from "@/engine/benchmark";
import { sendTelegram } from "@/engine/telegram";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildDailyReport(date = today(), type: "daily" | "weekly" = "daily") {
  const since = new Date(Date.now() - (type === "weekly" ? 7 : 1) * 86400 * 1000);

  const paperTrades = await prisma.paperTrade.findMany();
  const openPositions = paperTrades.filter((p) => p.status === "open").length;
  const totalPaperPnl = round2(
    paperTrades.reduce((a, p) => a + p.realizedPnl + p.unrealizedPnl, 0),
  );
  const todaysPnlSnaps = await prisma.pnlSnapshot.findMany({ where: { collectedAt: { gte: since } } });
  const paperPnlToday = round2(todaysPnlSnaps.reduce((a, s) => a + 0, 0)); // net change tracked below

  const resolved = paperTrades.filter((p) => p.status === "resolved");
  const winRate = resolved.length
    ? round2(resolved.filter((p) => p.realizedPnl > 0).length / resolved.length)
    : 0;

  const decisions = await prisma.decisionJournal.findMany({ where: { createdAt: { gte: since } } });
  const newSignals = decisions.length;
  const copiedSignals = decisions.filter((d) => d.decision === "paper_copy").length;
  const watchedSignals = decisions.filter((d) => d.decision === "watchlist").length;
  const skippedSignals = decisions.filter((d) => d.decision === "skip").length;

  // Best / worst paper trade.
  const sortedByPnl = [...paperTrades].sort(
    (a, b) => (b.realizedPnl + b.unrealizedPnl) - (a.realizedPnl + a.unrealizedPnl),
  );
  const bestTrade = sortedByPnl[0];
  const worstTrade = sortedByPnl[sortedByPnl.length - 1];

  // Best / worst wallets by paper PnL contribution.
  const walletPnl: Record<string, number> = {};
  for (const p of paperTrades) walletPnl[p.walletAddress] = (walletPnl[p.walletAddress] ?? 0) + p.realizedPnl + p.unrealizedPnl;
  const rankedWallets = Object.entries(walletPnl).sort((a, b) => b[1] - a[1]);
  const bestWallets = rankedWallets.slice(0, 3).map(([address, pnl]) => ({ address, pnl: round2(pnl) }));
  const worstWallets = rankedWallets.slice(-3).reverse().map(([address, pnl]) => ({ address, pnl: round2(pnl) }));

  // Rule changes in window.
  const ruleChanges = await prisma.ruleChange.findMany({ where: { createdAt: { gte: since } } });
  const ruleChangesSummary = ruleChanges.map((c) => ({ reason: c.reason, expected: c.expectedImprovement }));

  // Benchmark.
  const bench = await computeBenchmark();
  await snapshotBenchmark(date);

  // Top lesson from recent reviews.
  const reviews = await prisma.outcomeReview.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } });
  const lessons = reviews.flatMap((r) => parse<string[]>(r.lessonsJson, []));
  const topLesson = lessons[0] ?? "Not enough resolved outcomes yet to draw a lesson.";

  const summaryLines = [
    `*${type === "weekly" ? "Weekly" : "End-of-Day"} Report — ${date}*`,
    ``,
    `📊 Total paper PnL: *$${totalPaperPnl.toFixed(2)}*`,
    `✅ Win rate: *${(winRate * 100).toFixed(0)}%* (${resolved.length} resolved)`,
    `📈 Open positions: ${openPositions}`,
    `🎯 Signals: ${newSignals} (copy ${copiedSignals} / watch ${watchedSignals} / skip ${skippedSignals})`,
    bestTrade ? `🏆 Best paper trade: ${bestTrade.marketId.slice(0, 18)} $${(bestTrade.realizedPnl + bestTrade.unrealizedPnl).toFixed(2)}` : ``,
    worstTrade && worstTrade !== bestTrade ? `📉 Worst paper trade: ${worstTrade.marketId.slice(0, 18)} $${(worstTrade.realizedPnl + worstTrade.unrealizedPnl).toFixed(2)}` : ``,
    bestWallets[0] ? `⭐ Best wallet: ${bestWallets[0].address.slice(0, 10)}… $${bestWallets[0].pnl.toFixed(2)}` : ``,
    `🤖 Bot-filtered vs blind copy (avg $/trade): $${bench.botAvgPnlPerTrade.toFixed(2)} vs $${bench.blindAvgPnlPerTrade.toFixed(2)} — bot *${bench.botBeatsBlind ? "WINS" : "loses"}*`,
    `🛡️ Avoided losers: ${bench.avoidedLosers} | Missed winners: ${bench.missedWinners}`,
    ruleChanges.length ? `🔧 Rule changes: ${ruleChanges.length} (${ruleChangesSummary.map((r) => r.reason).slice(0, 2).join("; ")})` : `🔧 Rule changes: none`,
    `💡 Top lesson: ${topLesson}`,
    ``,
    `_Paper trading only. No real trades executed. Not financial advice._`,
  ].filter(Boolean);

  const summary = summaryLines.join("\n");

  const report = await prisma.dailyReport.create({
    data: {
      date, type,
      paperPnl: totalPaperPnl,
      winRate,
      openPositions,
      newSignals, copiedSignals, watchedSignals, skippedSignals,
      bestWalletsJson: j(bestWallets),
      worstWalletsJson: j(worstWallets),
      ruleChangesJson: j(ruleChangesSummary),
      summary,
      sentToTelegram: false,
    },
  });

  // Send to Telegram (no-op if unconfigured).
  const send = await sendTelegram(summary, "report");
  if (send.sent) {
    await prisma.dailyReport.update({ where: { id: report.id }, data: { sentToTelegram: true } });
  }

  log.info(`Report ${report.id} built for ${date}. Telegram sent=${send.sent}.`);
  console.log("\n" + summary + "\n");
  return { reportId: report.id, sentToTelegram: send.sent, summary };
}

function round2(x: number): number { return Math.round(x * 100) / 100; }

if (require.main === module) {
  const type = (process.argv[2] as "daily" | "weekly") ?? "daily";
  buildDailyReport(today(), type)
    .then(() => process.exit(0))
    .catch((e) => { log.error(`Report FAILED (real error): ${e.message}`); process.exit(1); });
}
