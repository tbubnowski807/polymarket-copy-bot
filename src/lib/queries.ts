// Server-side data access for the dashboard. All reads. No mutations here.
import { prisma } from "@/lib/prisma";

export async function getOverview() {
  const paperTrades = await prisma.paperTrade.findMany();
  const realizedResolved = paperTrades.filter((p) => p.status === "resolved");
  const totalPnl = paperTrades.reduce((a, p) => a + p.realizedPnl + p.unrealizedPnl, 0);
  const winRate = realizedResolved.length
    ? realizedResolved.filter((p) => p.realizedPnl > 0).length / realizedResolved.length
    : 0;
  const openPositions = paperTrades.filter((p) => p.status === "open").length;
  const trackedWallets = await prisma.walletProfile.count({ where: { status: "track" } });

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const copyCandidatesToday = await prisma.decisionJournal.count({
    where: { decision: "paper_copy", createdAt: { gte: startOfToday } },
  });

  const latestReport = await prisma.dailyReport.findFirst({ orderBy: { createdAt: "desc" } });
  const latestRuleChanges = await prisma.ruleChange.findMany({ orderBy: { createdAt: "desc" }, take: 3 });

  // PnL over time from snapshots (aggregate net pnl per hour bucket).
  const snaps = await prisma.pnlSnapshot.findMany({ orderBy: { collectedAt: "asc" } });
  const pnlSeries = bucketPnl(snaps);

  return { totalPnl, winRate, openPositions, trackedWallets, copyCandidatesToday, latestReport, latestRuleChanges, pnlSeries, resolvedCount: realizedResolved.length };
}

// Cumulative realized PnL curve from resolved paper trades + running unrealized.
function bucketPnl(snaps: { collectedAt: Date; pnl: number }[]) {
  if (snaps.length === 0) return [] as { t: string; pnl: number }[];
  const byBucket = new Map<string, number>();
  for (const s of snaps) {
    const d = new Date(s.collectedAt);
    const key = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
    byBucket.set(key, (byBucket.get(key) ?? 0) + s.pnl);
  }
  return Array.from(byBucket.entries()).map(([t, pnl]) => ({ t, pnl: Math.round(pnl * 100) / 100 }));
}

export async function getWallets() {
  return prisma.walletProfile.findMany({ orderBy: { globalScore: "desc" } });
}

export async function getWallet(address: string) {
  const wallet = await prisma.walletProfile.findUnique({ where: { address } });
  if (!wallet) return null;
  const observed = await prisma.observedTrade.findMany({
    where: { walletAddress: address }, orderBy: { timestamp: "desc" }, take: 20,
  });
  const paperTrades = await prisma.paperTrade.findMany({ where: { walletAddress: address } });
  const paperPnl = paperTrades.reduce((a, p) => a + p.realizedPnl + p.unrealizedPnl, 0);
  return { wallet, observed, paperTrades, paperPnl };
}

export async function getSignals() {
  const decisions = await prisma.decisionJournal.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { observedTrade: true },
  });
  // Attach a market snapshot per decision for current price/spread/liquidity.
  const withMarket = await Promise.all(decisions.map(async (d) => {
    const snap = await prisma.marketSnapshot.findFirst({
      where: { marketId: d.marketId }, orderBy: { collectedAt: "desc" },
    });
    return { d, snap };
  }));
  return withMarket;
}

export async function getPaperTrades() {
  return prisma.paperTrade.findMany({
    orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    include: { decision: true },
    take: 200,
  });
}

export async function getJournal() {
  return prisma.decisionJournal.findMany({
    orderBy: { createdAt: "desc" }, take: 150,
    include: { observedTrade: true, reviews: true },
  });
}

export async function getPerformance() {
  const benchRow = await prisma.benchmarkSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  // detailsJson stores the full BenchmarkResult (incl. per-trade efficiency
  // fields not in dedicated columns). Merge them so the page has everything.
  const bench = benchRow
    ? ({ ...benchRow, ...(JSON.parse(benchRow.detailsJson || "{}") as Record<string, number | boolean>) } as
        typeof benchRow & {
          botAvgPnlPerTrade: number; blindAvgPnlPerTrade: number;
          botCopyCount: number; blindCopyCount: number; botBeatsBlind: boolean;
        })
    : null;
  const snaps = await prisma.pnlSnapshot.findMany({ orderBy: { collectedAt: "asc" } });
  const pnlSeries = bucketPnl(snaps);

  // Category performance from resolved paper trades.
  const paper = await prisma.paperTrade.findMany({ include: { decision: true } });
  const observedByMarket = new Map<string, string>();
  const observed = await prisma.observedTrade.findMany();
  for (const o of observed) observedByMarket.set(o.marketId, o.marketCategory ?? "Uncategorized");

  const catPnl = new Map<string, number>();
  const walletPnl = new Map<string, number>();
  for (const p of paper) {
    const cat = observedByMarket.get(p.marketId) ?? "Uncategorized";
    const pnl = p.realizedPnl + p.unrealizedPnl;
    catPnl.set(cat, (catPnl.get(cat) ?? 0) + pnl);
    walletPnl.set(p.walletAddress, (walletPnl.get(p.walletAddress) ?? 0) + pnl);
  }

  const categoryPerf = Array.from(catPnl.entries()).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  const walletPerf = Array.from(walletPnl.entries())
    .map(([address, pnl]) => ({ address, pnl: Math.round(pnl * 100) / 100 }))
    .sort((a, b) => b.pnl - a.pnl);

  // Win rate by cohort.
  const resolved = paper.filter((p) => p.status === "resolved");
  const copyWins = resolved.filter((p) => p.realizedPnl > 0).length;
  const winRateSeries = [
    { name: "Bot copies", value: resolved.length ? (copyWins / resolved.length) * 100 : 0 },
  ];

  return { bench, pnlSeries, categoryPerf, walletPerf, winRateSeries, resolvedCount: resolved.length };
}

export async function getRules() {
  const rulesets = await prisma.ruleSet.findMany({ orderBy: { version: "desc" } });
  const changes = await prisma.ruleChange.findMany({ orderBy: { createdAt: "desc" } });
  const active = rulesets.find((r) => r.active) ?? rulesets[0];
  return { rulesets, changes, active };
}

export async function getReports() {
  return prisma.dailyReport.findMany({ orderBy: { createdAt: "desc" }, take: 60 });
}

export async function getScanMeta() {
  const scan = await prisma.leaderboardScan.findFirst({ orderBy: { scannedAt: "desc" } });
  return scan;
}
