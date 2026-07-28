// Steps 10-11: Score each un-decided ObservedTrade, write DecisionJournal, and
// for paper_copy decisions create a PaperTrade (simulated only, $5-$20).
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getMarket } from "@/adapters/markets";
import { scoreTrade } from "@/scoring/trade";
import { classifyTradeDirection } from "@/scoring/direction";
import { unrealizedPnl } from "@/scoring/paper";
import { getActiveRules, j, parse, isMissingMarketError } from "@/engine/helpers";
import { config } from "@/lib/config";

export async function scoreTrades() {
  const { rules, version } = await getActiveRules();

  // Find UNDECIDED observed trades. We fetch recent trades (newest first so we
  // never miss fresh signals), drop any already decided, then sort the
  // remaining OLDEST-first so a wallet's BUY is processed before its later SELL.
  const decided = await prisma.decisionJournal.findMany({ select: { observedTradeId: true } });
  const decidedSet = new Set(decided.map((d) => d.observedTradeId));
  const recent = await prisma.observedTrade.findMany({ orderBy: { createdAt: "desc" }, take: 1500 });
  const pending = recent
    .filter((o) => !decidedSet.has(o.id))
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));

  log.info(`Scoring ${pending.length} pending observed trades (ruleset v${version})...`);

  let copies = 0, watch = 0, skip = 0, exitsMirrored = 0, exitsIgnored = 0;
  for (const o of pending) {
    const wallet = await prisma.walletProfile.findUnique({ where: { address: o.walletAddress } });
    if (!wallet) continue;
    let market;
    try {
      const res = await getMarket(o.marketId);
      market = res.data;
    } catch (err) {
      if (isMissingMarketError(err)) continue; // can't score without market
      throw err;
    }

    const cat = o.marketCategory ?? market.category ?? "Uncategorized";
    const currentPrice =
      o.outcome.toLowerCase() === "no"
        ? market.noPrice ?? (market.yesPrice != null ? 1 - market.yesPrice : 0.5)
        : market.yesPrice ?? o.walletEntryPrice;

    // STEP 1: classify the DIRECTION of the trade (buy = entry, sell = exit).
    const action = classifyTradeDirection(
      { side: o.side as "BUY" | "SELL", walletGlobalScore: wallet.globalScore, walletStatus: wallet.status },
      rules,
    );

    // STEP 2a: a SELL (exit). We never open a fresh position from a sell.
    if (action !== "consider_entry") {
      const mirrored = action === "mirror_exit"
        ? await mirrorWalletExit(o, currentPrice)
        : 0;
      if (action === "mirror_exit") exitsMirrored += mirrored;
      else exitsIgnored++;
      // Record a lightweight decision so the journal explains what happened.
      await prisma.decisionJournal.create({
        data: {
          observedTradeId: o.id, walletAddress: o.walletAddress, marketId: o.marketId,
          decision: "skip", copyScore: 0, confidence: 0,
          reasonsJson: j([
            action === "mirror_exit"
              ? `Wallet SOLD (exited). Reliable wallet (score ${wallet.globalScore}, ${wallet.status}) — mirrored the exit by closing ${mirrored} copied position(s).`
              : `Wallet SOLD (exited). Not opening a position from a sell. Seller not reliable enough to mirror (score ${wallet.globalScore}, ${wallet.status}) — ignoring the exit.`,
          ]),
          risksJson: j([]),
          walletQualityScore: wallet.globalScore, roiScore: 0, consistencyScore: 0,
          copyabilityScore: 0, categoryFitScore: 0, entryTimingScore: 0, spreadScore: 0,
          liquidityScore: 0, thesisScore: 0, simulatedPositionSize: 0, ruleSetVersion: version,
        },
      });
      skip++;
      continue;
    }

    // STEP 2b: a BUY (entry) — run the normal copy-quality scorer.
    const catStrengths = parse<Record<string, number>>(wallet.categoryStrengthsJson, {});
    const walletCategoryScore = catStrengths[cat] ?? 0.3;

    // Recompute a rough roiScore proxy from stored roi30d.
    const walletRoiScore = Math.max(0, Math.min(1, (wallet.roi30d + 0.4) / 1.4));

    const score = scoreTrade(
      {
        walletGlobalScore: wallet.globalScore,
        walletCategoryScore,
        walletConsistency: wallet.consistencyScore,
        walletCopyability: wallet.copyabilityScore,
        walletRoiScore,
        currentPrice,
        walletEntryPrice: o.walletEntryPrice,
        spread: market.spread ?? 0.03,
        liquidity: market.liquidity ?? 0,
        timeToResolutionHours: market.timeToResolutionHours,
        category: cat,
      },
      rules,
    );

    const dj = await prisma.decisionJournal.create({
      data: {
        observedTradeId: o.id,
        walletAddress: o.walletAddress,
        marketId: o.marketId,
        decision: score.decision,
        copyScore: score.copyScore,
        confidence: score.confidence,
        reasonsJson: j(score.reasons),
        risksJson: j(score.risks),
        walletQualityScore: score.breakdown.walletQualityScore,
        roiScore: score.breakdown.roiScore,
        consistencyScore: score.breakdown.consistencyScore,
        copyabilityScore: score.breakdown.copyabilityScore,
        categoryFitScore: score.breakdown.categoryFitScore,
        entryTimingScore: score.breakdown.entryTimingScore,
        spreadScore: score.breakdown.spreadScore,
        liquidityScore: score.breakdown.liquidityScore,
        thesisScore: score.breakdown.thesisScore,
        simulatedPositionSize: score.simulatedPositionSize,
        ruleSetVersion: version,
      },
    });

    if (score.decision === "paper_copy") {
      // SAFETY GATE: this is a simulated position only. Never a real order.
      if (config.safety.REAL_TRADING_ENABLED) {
        throw new Error("SAFETY VIOLATION: real trading is disabled in v1 and must never be enabled here.");
      }
      const size = Math.max(
        rules.sizing.minSizeUsd,
        Math.min(rules.sizing.maxSizeUsd, score.simulatedPositionSize),
      );
      await prisma.paperTrade.create({
        data: {
          decisionJournalId: dj.id,
          walletAddress: o.walletAddress,
          marketId: o.marketId,
          outcome: o.outcome,
          side: o.side,
          entryPrice: currentPrice,
          currentPrice,
          // Slippage: what the wallet paid vs what WE paid at execution time.
          // Positive = we entered at a worse (higher) price than the wallet.
          walletEntryPrice: o.walletEntryPrice,
          slippage: Math.round((currentPrice - o.walletEntryPrice) * 10000) / 10000,
          simulatedPositionSize: size,
          status: "open",
        },
      });
      copies++;
    } else if (score.decision === "watchlist") watch++;
    else skip++;
  }

  log.info(`Decisions -> paper_copy: ${copies}, watchlist: ${watch}, skip: ${skip} (exits mirrored: ${exitsMirrored}, exits ignored: ${exitsIgnored})`);
  return { copies, watch, skip, exitsMirrored, exitsIgnored };
}

// When a RELIABLE tracked wallet sells (exits) a market, close any OPEN paper
// positions we copied from that same wallet on that same market — mirroring
// their exit. Returns how many positions we closed. Never opens anything.
async function mirrorWalletExit(
  o: { walletAddress: string; marketId: string; outcome: string },
  currentPrice: number,
): Promise<number> {
  const open = await prisma.paperTrade.findMany({
    where: {
      walletAddress: o.walletAddress,
      marketId: o.marketId,
      outcome: o.outcome,
      status: "open",
    },
  });
  let closed = 0;
  for (const pt of open) {
    // Realize PnL at the current price (we "sold" our simulated shares).
    const pnl = unrealizedPnl(pt.simulatedPositionSize, pt.entryPrice, currentPrice);
    await prisma.paperTrade.update({
      where: { id: pt.id },
      data: {
        status: "closed",
        exitReason: "sold_early",
        exitPrice: currentPrice,
        currentPrice,
        unrealizedPnl: 0,
        realizedPnl: pnl,
        closedAt: new Date(),
      },
    });
    closed++;
    log.info(`Mirrored exit: closed paper trade ${pt.id} (${o.marketId}) at ${currentPrice}, realized $${pnl.toFixed(2)}`);
  }
  return closed;
}

if (require.main === module) {
  scoreTrades()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Trade scoring FAILED (real error): ${e.message}`); process.exit(1); });
}
