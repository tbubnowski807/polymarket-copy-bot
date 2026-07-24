// Wipe all data (clean slate) without seeding. Useful before a pure live scan.
// Deletes in dependency order. This never touches keys or funds — it's just DB.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

async function main() {
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
  log.info("DB reset complete (all tables cleared).");
}

main().then(() => process.exit(0)).catch((e) => { log.error(`Reset failed: ${e.message}`); process.exit(1); });
