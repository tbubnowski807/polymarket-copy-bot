// Steps 2-7: Scan wallet activity, score each wallet, assign status.
// Scoring substrate is the wallet's POSITIONS (real per-position PnL from
// Polymarket's /positions endpoint) — this reflects true 30d performance and
// doesn't depend on delisted gamma markets.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getWalletPositions, positionsToScoredTrades } from "@/adapters/positions";
import { scoreWallet, statusForScore } from "@/scoring/wallet";
import { getActiveRules, j } from "@/engine/helpers";

const LOOKBACK_DAYS = 30;

export async function scanWallets() {
  // Limit how many wallets we deeply profile per run (top ranked first).
  const PROFILE_LIMIT = Number(process.env.PROFILE_LIMIT ?? 500);
  const { rules } = await getActiveRules();
  const wallets = await prisma.walletProfile.findMany({
    orderBy: { sourceRank: "asc" },
    take: PROFILE_LIMIT,
  });
  log.info(`Profiling ${wallets.length} wallets from positions (lookback ${LOOKBACK_DAYS}d)...`);

  let profiled = 0;
  let anyDemo = false;
  for (const w of wallets) {
    const { data: positions, demo } = await getWalletPositions(w.address);
    anyDemo = anyDemo || demo;
    const scored = positionsToScoredTrades(w.address, positions);
    const m = scoreWallet(scored, rules);
    const status = statusForScore(m.globalScore, rules);

    const statusReason =
      status === "track"
        ? `Global score ${m.globalScore} ≥ track threshold ${rules.status.trackMinGlobalScore}. ${m.copyabilityNotes}`
        : status === "watch"
        ? `Global score ${m.globalScore} in watch band. ${m.riskNotes}`
        : `Global score ${m.globalScore} below watch threshold. ${m.riskNotes}`;

    await prisma.walletProfile.update({
      where: { address: w.address },
      data: {
        status,
        statusReason,
        roi30d: m.roi30d,
        consistencyScore: m.consistencyScore,
        copyabilityScore: m.copyabilityScore,
        oneHitWonderPenalty: m.oneHitWonderPenalty,
        globalScore: m.globalScore,
        bestCategory: m.bestCategory ?? null,
        categoryStrengthsJson: j(m.categoryStrengths),
        averageTradeSize: m.averageTradeSize,
        tradeCount30d: m.tradeCount30d,
        resolvedTradeCount30d: m.resolvedTradeCount30d,
        winRate30d: m.winRate30d,
        averageLiquidity: m.averageLiquidity,
        averageSpread: m.averageSpread,
        averageEntryTiming: m.averageEntryTiming,
        copyabilityNotes: m.copyabilityNotes,
        riskNotes: m.riskNotes,
        lastScannedAt: new Date(),
      },
    });
    profiled++;
  }
  log.info(`Profiled ${profiled} wallets.${anyDemo ? " (some/all DEMO DATA)" : ""}`);
  return { profiled, demo: anyDemo };
}

if (require.main === module) {
  scanWallets()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Wallet scan FAILED (real error): ${e.message}`); process.exit(1); });
}
