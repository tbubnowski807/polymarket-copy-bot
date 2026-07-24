// Step 1 & 6: Pull leaderboard, store scan, upsert top-N wallet stubs.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getLeaderboard } from "@/adapters/leaderboard";
import { j } from "@/engine/helpers";

const LOOKBACK_DAYS = 30;

export async function scanLeaderboard() {
  const TOP_N = Number(process.env.SCAN_LIMIT ?? 500);
  const { data, demo, source } = await getLeaderboard(TOP_N);
  log.info(`Leaderboard fetched: ${data.length} wallets from ${source}${demo ? " [DEMO]" : ""}`);

  const scan = await prisma.leaderboardScan.create({
    data: {
      source,
      walletCount: data.length,
      lookbackDays: LOOKBACK_DAYS,
      rawSummaryJson: j({
        demo,
        top10: data.slice(0, 10).map((d) => ({ address: d.address, rank: d.rank, label: d.label, roi: d.roi })),
      }),
    },
  });

  // Upsert wallet stubs (rank + label). Full scoring happens in scanWallets.
  for (const e of data) {
    await prisma.walletProfile.upsert({
      where: { address: e.address },
      create: {
        address: e.address,
        label: e.label ?? null,
        sourceRank: e.rank,
        status: "watch",
        statusReason: "Newly discovered on leaderboard; awaiting profile scan.",
      },
      update: { sourceRank: e.rank, label: e.label ?? undefined, lastScannedAt: new Date() },
    });
  }

  log.info(`Scan ${scan.id} stored. ${data.length} wallet stubs upserted.${demo ? " (DEMO DATA)" : ""}`);
  return { scanId: scan.id, count: data.length, demo };
}

if (require.main === module) {
  scanLeaderboard()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Leaderboard scan FAILED (real error, not faking data): ${e.message}`); process.exit(1); });
}
