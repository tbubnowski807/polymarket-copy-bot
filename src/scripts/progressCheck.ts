// Progress check: summarizes whether the paper strategy is building an edge.
// Prints a compact, human-readable snapshot to stdout for the cron job to frame.
import { prisma } from "@/lib/prisma";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400 * 1000);
}

async function main() {
  const paper = await prisma.paperTrade.findMany();
  const resolved = paper.filter((p) => p.status === "resolved");
  const open = paper.filter((p) => p.status === "open");
  const totalPnl = paper.reduce((a, p) => a + p.realizedPnl + p.unrealizedPnl, 0);
  const realizedPnl = resolved.reduce((a, p) => a + p.realizedPnl, 0);
  const wins = resolved.filter((p) => p.realizedPnl > 0).length;
  const winRate = resolved.length ? (wins / resolved.length) * 100 : 0;

  const tracked = await prisma.walletProfile.count({ where: { status: "track" } });
  const watch = await prisma.walletProfile.count({ where: { status: "watch" } });

  const decisions = await prisma.decisionJournal.count();
  const copies = await prisma.decisionJournal.count({ where: { decision: "paper_copy" } });

  const ruleset = await prisma.ruleSet.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  const ruleChanges = await prisma.ruleChange.count();

  const bench = await prisma.benchmarkSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  let benchLine = "No benchmark computed yet.";
  if (bench) {
    try {
      const d = JSON.parse(bench.detailsJson || "{}");
      benchLine = `Bot avg $/trade ${fmt(d.botAvgPnlPerTrade)} vs blind ${fmt(d.blindAvgPnlPerTrade)} — bot ${d.botBeatsBlind ? "AHEAD" : "behind"}. Avoided losers: ${bench.avoidedLosers}, missed winners: ${bench.missedWinners}.`;
    } catch {}
  }

  // How long has it been running? (oldest paper trade)
  const oldest = await prisma.paperTrade.findFirst({ orderBy: { openedAt: "asc" } });
  const daysRunning = oldest ? Math.max(1, Math.round((Date.now() - new Date(oldest.openedAt).getTime()) / 86400000)) : 0;

  // Weekly delta: resolved trades in the last 7 days.
  const recentResolved = resolved.filter((p) => p.resolvedAt && new Date(p.resolvedAt) >= daysAgo(7));
  const recentPnl = recentResolved.reduce((a, p) => a + p.realizedPnl, 0);

  const lines = [
    `RUNNING FOR: ~${daysRunning} day(s)`,
    `RULE VERSION: v${ruleset?.version ?? 1} (${ruleChanges} automatic change(s) logged so far)`,
    `WALLETS: ${tracked} tracked, ${watch} watch`,
    `SIGNALS: ${decisions} decisions, ${copies} paper-copy candidates`,
    `PAPER TRADES: ${paper.length} total — ${open.length} open, ${resolved.length} resolved`,
    `RESOLVED WIN RATE: ${winRate.toFixed(0)}% (${wins}/${resolved.length})`,
    `TOTAL PAPER PNL: ${fmt(totalPnl)} (realized ${fmt(realizedPnl)})`,
    `LAST 7 DAYS: ${recentResolved.length} trades resolved, ${fmt(recentPnl)} realized`,
    `BENCHMARK: ${benchLine}`,
    ``,
    `EDGE VERDICT INPUTS: ${resolved.length} resolved trades is ${resolved.length < 30 ? "TOO FEW to judge (need ~30+)" : resolved.length < 100 ? "a small sample (building)" : "a meaningful sample"}.`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

function fmt(n: number | undefined | null): string {
  const v = n ?? 0;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2);
}

main().catch((e) => { process.stderr.write(`progress check failed: ${e.message}\n`); process.exit(1); });
