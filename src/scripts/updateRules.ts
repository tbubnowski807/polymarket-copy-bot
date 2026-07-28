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

  // MINIMUM-SAMPLE GATE: never change rules off a tiny/volatile sample. Rule
  // changes must be based on CLOSED trades (resolved or sold), not unrealized
  // swings on still-open positions. Require at least this many.
  const MIN_CLOSED_TRADES = Number(process.env.MIN_CLOSED_TRADES_FOR_RULES ?? 20);
  if (ev.totalResolvedCopies < MIN_CLOSED_TRADES) {
    log.info(
      `Rule update SKIPPED: only ${ev.totalResolvedCopies} closed trades (need ${MIN_CLOSED_TRADES}). ` +
      `Not adjusting rules off an insufficient/unresolved sample.`,
    );
    // Still allow wallet downgrades (those are per-wallet, not global rules)?
    // No — downgrades also need evidence. Hold everything until we have data.
    return { changed: false, changes: [], newVersion: version, reason: "insufficient_closed_trades", closedTrades: ev.totalResolvedCopies };
  }

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
        evidenceSummary: `${c.evidence} [based on ${ev.totalResolvedCopies} closed trades]`,
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
