// Seed the database end-to-end with CLEARLY-LABELED demo data by running the
// full pipeline in demo mode. This proves the engine works with zero network.
//
// Every wallet/market here is demo (0xDEMO… addresses, "[DEMO]" questions).
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { DEFAULT_RULES } from "@/scoring/rules";
import { j } from "@/engine/helpers";

// Force demo mode for the seed regardless of .env.
process.env.DATA_MODE = "demo";

async function reset() {
  // Clear in dependency order.
  await prisma.pnlSnapshot.deleteMany();
  await prisma.outcomeReview.deleteMany();
  await prisma.paperTrade.deleteMany();
  await prisma.decisionJournal.deleteMany();
  await prisma.observedTrade.deleteMany();
  await prisma.marketSnapshot.deleteMany();
  await prisma.benchmarkSnapshot.deleteMany();
  await prisma.dailyReport.deleteMany();
  await prisma.ruleChange.deleteMany();
  await prisma.ruleSet.deleteMany();
  await prisma.leaderboardScan.deleteMany();
  await prisma.walletProfile.deleteMany();
}

async function main() {
  log.demo("Seeding with clearly-labeled DEMO data (DATA_MODE=demo). No real trades, no network.");
  await reset();

  // Ensure the base ruleset (v1) exists.
  await prisma.ruleSet.create({ data: { version: 1, active: true, rulesJson: j(DEFAULT_RULES) } });

  // Import pipeline steps AFTER setting demo mode so adapters pick it up.
  const { scanLeaderboard } = await import("./scanLeaderboard");
  const { scanWallets } = await import("./scanWallets");
  const { monitorTrades } = await import("./monitorTrades");
  const { scoreTrades } = await import("./scoreTrades");
  const { updatePnl } = await import("./updatePnl");
  const { reviewOutcomes } = await import("./reviewOutcomes");
  const { updateRules } = await import("./updateRules");
  const { buildDailyReport } = await import("./reportDaily");
  const { backfillHistory } = await import("./backfillHistory");

  // Keep the seed fast: scan a subset of the demo leaderboard.
  process.env.SCAN_LIMIT = process.env.SEED_SCAN_LIMIT ?? "60";
  process.env.PROFILE_LIMIT = process.env.SEED_SCAN_LIMIT ?? "60";

  log.demo("1/9 leaderboard scan"); await scanLeaderboard();
  log.demo("2/9 wallet profiling + scoring"); await scanWallets();
  log.demo("3/9 backfill historical track record (resolved paper trades)"); await backfillHistory(14);
  log.demo("4/9 monitor new trades"); await monitorTrades();
  log.demo("5/9 score trades + create paper trades"); await scoreTrades();
  log.demo("6/9 update paper PnL"); await updatePnl();
  log.demo("7/9 review outcomes"); await reviewOutcomes();
  log.demo("8/9 auto rule update"); await updateRules();
  log.demo("9/9 daily report"); await buildDailyReport();

  // Add a couple of extra hourly PnL snapshots so the charts have a curve.
  const open = await prisma.paperTrade.findMany({ take: 50 });
  for (let h = 1; h <= 4; h++) {
    for (const pt of open) {
      const drift = (Math.sin(h + pt.entryPrice * 10) * 0.03);
      const price = Math.max(0.01, Math.min(0.99, pt.currentPrice + drift));
      const shares = pt.simulatedPositionSize / (pt.entryPrice || 0.5);
      const pnl = Math.round((shares * price - pt.simulatedPositionSize) * 100) / 100;
      await prisma.pnlSnapshot.create({
        data: { paperTradeId: pt.id, price, pnl, collectedAt: new Date(Date.now() - (5 - h) * 3600 * 1000) },
      });
    }
  }

  const counts = {
    wallets: await prisma.walletProfile.count(),
    tracked: await prisma.walletProfile.count({ where: { status: "track" } }),
    observed: await prisma.observedTrade.count(),
    decisions: await prisma.decisionJournal.count(),
    paperTrades: await prisma.paperTrade.count(),
    ruleSets: await prisma.ruleSet.count(),
    reports: await prisma.dailyReport.count(),
  };
  log.demo(`Seed complete. Counts: ${JSON.stringify(counts)}`);
  console.log("\n✅ DEMO SEED COMPLETE — all data labeled as demo.\n", counts, "\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { log.error(`Seed FAILED: ${e.message}\n${e.stack}`); process.exit(1); });
