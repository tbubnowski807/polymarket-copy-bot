// Steps 8-9: Monitor tracked wallets for NEW trades, store as ObservedTrade +
// a MarketSnapshot for context.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getWalletTrades } from "@/adapters/trades";
import { getMarket } from "@/adapters/markets";
import { j, isMissingMarketError } from "@/engine/helpers";

export async function monitorTrades() {
  // Monitor BOTH tracked and watch wallets. "track" wallets are strong enough
  // to auto-copy; "watch" wallets are still interesting to observe (their
  // signals may become copy candidates or just inform the journal). Only
  // "ignore" wallets are skipped. This keeps signals flowing even when the
  // leaderboard has no standout track-grade wallet in the latest batch.
  const tracked = await prisma.walletProfile.findMany({
    where: { status: { in: ["track", "watch"] } },
    orderBy: { globalScore: "desc" },
    take: Number(process.env.MONITOR_LIMIT ?? 15),
  });
  log.info(`Monitoring ${tracked.length} track+watch wallets for new trades...`);

  let newTrades = 0;
  let anyDemo = false;
  for (const w of tracked) {
    // Look back a short window for "new" trades.
    const { data: raw, demo } = await getWalletTrades(w.address, 2);
    anyDemo = anyDemo || demo;
    for (const t of raw) {
      // Dedup by wallet+market+timestamp.
      const exists = await prisma.observedTrade.findFirst({
        where: { walletAddress: t.walletAddress, marketId: t.marketId, timestamp: new Date(t.timestamp) },
      });
      if (exists) continue;

      let market;
      try {
        const res = await getMarket(t.marketId);
        market = res.data;
      } catch (err) {
        // Skip trades whose market can't be resolved; never fabricate.
        if (isMissingMarketError(err)) continue;
        throw err;
      }

      await prisma.marketSnapshot.create({
        data: {
          marketId: market.marketId,
          conditionId: market.conditionId ?? null,
          question: market.question,
          category: market.category ?? null,
          yesPrice: market.yesPrice ?? null,
          noPrice: market.noPrice ?? null,
          bestBid: market.bestBid ?? null,
          bestAsk: market.bestAsk ?? null,
          spread: market.spread ?? null,
          liquidity: market.liquidity ?? null,
          volume: market.volume ?? null,
          timeToResolution: market.timeToResolutionHours ?? null,
          rawMarketJson: j(market.raw),
        },
      });

      await prisma.observedTrade.create({
        data: {
          walletAddress: t.walletAddress,
          marketId: t.marketId,
          conditionId: t.conditionId ?? null,
          marketQuestion: t.marketQuestion,
          marketCategory: t.marketCategory ?? market.category ?? null,
          outcome: t.outcome,
          side: t.side,
          walletEntryPrice: t.price,
          detectedPrice: market.yesPrice ?? t.price,
          size: t.size,
          timestamp: new Date(t.timestamp),
          rawTradeJson: j(t.raw),
        },
      });
      newTrades++;
    }
  }
  log.info(`Detected ${newTrades} new observed trades.${anyDemo ? " (DEMO DATA involved)" : ""}`);
  return { newTrades, demo: anyDemo };
}

if (require.main === module) {
  monitorTrades()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Trade monitor FAILED (real error): ${e.message}`); process.exit(1); });
}
