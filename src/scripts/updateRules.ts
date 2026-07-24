// Step 16-17 script: gather evidence from reviews/paper trades, propose rule
// changes, and if any, persist a NEW RuleSet version + RuleChange audit rows.
// Also downgrades chronically-underperforming wallets. No approval required,
// but everything is logged.
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import { getActiveRules, j, parse } from "@/engine/helpers";
import { proposeRuleChanges, walletsToDowngrade, type PerfEvidence } from "@/engine/ruleEngine";
import type { Rules } from "@/scoring/rules";

async function gatherEvidence(): Promise<PerfEvidence> {
  const copies = await prisma.paperTrade.findMany({
    where: { status: { in: ["resolved", "closed"] } },
    include: { decision: true },
  });
  const copyTrades = await Promise.all(
    copies.map(async (pt) => {
      const risks = parse<string[]>(pt.decision.risksJson, []);
      return {
        pnl: pt.realizedPnl,
        spread: pt.decision.spreadScore < 0.5 ? 0.06 : 0.02, // proxy from score
        liquidity: pt.decision.liquidityScore * 8000,
        wasLate: risks.some((r) => /late/i.test(r)) || pt.decision.entryTimingScore < 0.4,
      };
    }),
  );

  const walletPaperPnl: Record<string, number> = {};
  for (const pt of copies) {
    walletPaperPnl[pt.walletAddress] = (walletPaperPnl[pt.walletAddress] ?? 0) + pt.realizedPnl;
  }

  const wallets = await prisma.walletProfile.findMany();
  const volatileHighRoiCount = wallets.filter(
    (w) => w.roi30d > 0.3 && w.consistencyScore < 0.4,
  ).length;

  return {
    copyTrades,
    walletPaperPnl,
    volatileHighRoiCount,
    totalResolvedCopies: copies.length,
  };
}

export async function updateRules() {
  const { rules, version, id } = await getActiveRules();
  const ev = await gatherEvidence();
  const { next, changes } = proposeRuleChanges(rules, ev);

  // Downgrade underperforming tracked wallets (logged as status changes).
  const downgrade = walletsToDowngrade(ev);
  for (const addr of downgrade) {
    const w = await prisma.walletProfile.findUnique({ where: { address: addr } });
    if (w && w.status !== "ignore") {
      await prisma.walletProfile.update({
        where: { address: addr },
        data: {
          status: w.status === "track" ? "watch" : "ignore",
          statusReason: `Auto-downgraded: poor paper performance ($${(ev.walletPaperPnl[addr] ?? 0).toFixed(2)}).`,
        },
      });
      log.info(`Downgraded wallet ${addr.slice(0, 8)}… due to poor paper PnL.`);
    }
  }

  if (changes.length === 0) {
    log.info("No rule changes warranted this cycle. Rules unchanged.");
    return { changed: false, changes: [], newVersion: version };
  }

  // Persist a new active ruleset version.
  const newVersion = version + 1;
  await prisma.ruleSet.updateMany({ where: { active: true }, data: { active: false } });
  const newSet = await prisma.ruleSet.create({
    data: { version: newVersion, active: true, rulesJson: j(next) },
  });

  for (const c of changes) {
    await prisma.ruleChange.create({
      data: {
        oldRuleSetId: id,
        newRuleSetId: newSet.id,
        changedBy: "hermes",
        reason: `${c.path}: ${c.reason}`,
        evidenceSummary: c.evidence,
        beforeJson: j({ [c.path]: c.before }),
        afterJson: j({ [c.path]: c.after }),
        expectedImprovement: c.expectedImprovement,
      },
    });
    log.info(`RULE CHANGE v${version}->v${newVersion}: ${c.path} ${c.before} -> ${c.after} (${c.reason})`);
  }

  return { changed: true, changes, newVersion };
}

if (require.main === module) {
  updateRules()
    .then((r) => { log.info(`Done: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Rule update FAILED (real error): ${e.message}`); process.exit(1); });
}
