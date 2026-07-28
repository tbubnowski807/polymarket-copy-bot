// Step 12: Update paper PnL every hour. Fetches current price for each open
// paper trade, writes a PnlSnapshot, updates unrealizedPnl. Resolves trades
// whose market has resolved.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getMarket } from "@/adapters/markets";
import { unrealizedPnl, realizedPnlOnResolution } from "@/scoring/paper";
import { isMissingMarketError } from "@/engine/helpers";

export async function updatePnl() {
  const open = await prisma.paperTrade.findMany({ where: { status: "open" } });
  log.info(`Updating PnL for ${open.length} open paper trades...`);

  let resolvedCount = 0;
  for (const pt of open) {
    let market;
    try {
      const res = await getMarket(pt.marketId);
      market = res.data;
    } catch (err) {
      // If a market can't be resolved this cycle, leave the trade unchanged
      // rather than fabricate a price. Genuine API failures still stop.
      if (isMissingMarketError(err)) { continue; }
      throw err;
    }
    const currentPrice =
      pt.outcome.toLowerCase() === "no"
        ? market.noPrice ?? (market.yesPrice != null ? 1 - market.yesPrice : pt.currentPrice)
        : market.yesPrice ?? pt.currentPrice;

    if (market.resolved && market.resolvedOutcome) {
      const won = market.resolvedOutcome.toLowerCase() === pt.outcome.toLowerCase();
      const realized = realizedPnlOnResolution(pt.simulatedPositionSize, pt.entryPrice, won);
      await prisma.paperTrade.update({
        where: { id: pt.id },
        data: {
          currentPrice: won ? 1 : 0,
          unrealizedPnl: 0,
          realizedPnl: realized,
          status: "resolved",
          exitReason: "resolved",
          exitPrice: won ? 1 : 0,
          resolvedAt: new Date(),
        },
      });
      await prisma.pnlSnapshot.create({
        data: { paperTradeId: pt.id, price: won ? 1 : 0, pnl: realized },
      });
      resolvedCount++;
    } else {
      const uPnl = unrealizedPnl(pt.simulatedPositionSize, pt.entryPrice, currentPrice);
      await prisma.paperTrade.update({
        where: { id: pt.id },
        data: { currentPrice, unrealizedPnl: uPnl },
      });
      await prisma.pnlSnapshot.create({
        data: { paperTradeId: pt.id, price: currentPrice, pnl: uPnl },
      });
    }
  }
  log.info(`PnL updated. ${resolvedCount} markets resolved this run.`);
  return { updated: open.length, resolved: resolvedCount };
}

if (require.main === module) {
  updatePnl()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`PnL update FAILED (real error): ${e.message}`); process.exit(1); });
}
