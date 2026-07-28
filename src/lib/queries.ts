// Server-side data access for the dashboard. All reads. No mutations here.
import { prisma } from "@/lib/prisma";

export async function getOverview() {
  const paperTrades = await prisma.paperTrade.findMany();
  const closed = paperTrades.filter((p) => p.status === "closed" || p.status === "resolved");
  const open = paperTrades.filter((p) => p.status === "open");

  // REALIZED = money locked in from closed positions (resolved or sold early).
  // UNREALIZED = paper-only swing on positions still open.
  const realizedPnl = closed.reduce((a, p) => a + p.realizedPnl, 0);
  const unrealizedPnl = open.reduce((a, p) => a + p.unrealizedPnl, 0);
  const totalPnl = realizedPnl + unrealizedPnl;

  // Win rate is computed on CLOSED trades only (open ones haven't happened yet).
  const winRate = closed.length
    ? closed.filter((p) => p.realizedPnl > 0).length / closed.length
    : 0;

  const openPositions = open.length;
  const trackedWallets = await prisma.walletProfile.count({ where: { status: "track" } });

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const copyCandidatesToday = await prisma.decisionJournal.count({
    where: { decision: "paper_copy", createdAt: { gte: startOfToday } },
  });

  const latestReport = await prisma.dailyReport.findFirst({ orderBy: { createdAt: "desc" } });
  const latestRuleChanges = await prisma.ruleChange.findMany({ orderBy: { createdAt: "desc" }, take: 3 });

  const snaps = await prisma.pnlSnapshot.findMany({ orderBy: { collectedAt: "asc" } });
  const pnlSeries = bucketPnl(snaps);

  return {
    totalPnl: round2(totalPnl),
    realizedPnl: round2(realizedPnl),
    unrealizedPnl: round2(unrealizedPnl),
    winRate,
    openPositions,
    closedCount: closed.length,
    trackedWallets,
    copyCandidatesToday,
    latestReport,
    latestRuleChanges,
    pnlSeries,
    resolvedCount: closed.length,
  };
}

function round2(x: number): number { return Math.round(x * 100) / 100; }

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
  // OPEN positions = the trades you're currently "in".
  const openTrades = await prisma.paperTrade.findMany({
    where: { status: "open" },
    orderBy: { openedAt: "desc" },
    include: { decision: { include: { observedTrade: true } } },
  });
  // CLOSED trades = the log of finished positions (resolved or sold early).
  const closedTrades = await prisma.paperTrade.findMany({
    where: { status: { in: ["closed", "resolved"] } },
    orderBy: { closedAt: "desc" },
    include: { decision: { include: { observedTrade: true } } },
    take: 300,
  });

  // Consistent totals (whole book, not a truncated slice).
  const allForTotals = await prisma.paperTrade.findMany({
    select: { status: true, realizedPnl: true, unrealizedPnl: true },
  });
  const closedAll = allForTotals.filter((p) => p.status !== "open");
  const openAll = allForTotals.filter((p) => p.status === "open");
  const realizedPnl = round2(closedAll.reduce((a, p) => a + p.realizedPnl, 0));
  const unrealizedPnl = round2(openAll.reduce((a, p) => a + p.unrealizedPnl, 0));
  const wins = closedAll.filter((p) => p.realizedPnl > 0).length;
  const winRate = closedAll.length ? wins / closedAll.length : 0;

  return {
    openTrades,
    closedTrades,
    totals: {
      realizedPnl,
      unrealizedPnl,
      totalPnl: round2(realizedPnl + unrealizedPnl),
      openCount: openAll.length,
      closedCount: closedAll.length,
      wins,
      winRate,
    },
  };
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
