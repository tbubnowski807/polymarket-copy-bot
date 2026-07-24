// Step 16-17: Automatic rule updater (self-improvement). Pure analysis function
// `proposeRuleChanges` is unit-testable; the script persists new RuleSet
// versions + RuleChange audit rows. Rules change WITHOUT approval, but every
// change is logged with reason, evidence, before/after, and expected impact.
import { cloneRules, type Rules } from "@/scoring/rules";

export interface PerfEvidence {
  // Aggregates the updater reasons over.
  copyTrades: { pnl: number; spread: number; liquidity: number; wasLate: boolean }[];
  // Per-wallet recent paper performance.
  walletPaperPnl: Record<string, number>;
  // High-ROI but volatile wallets (roi high, consistency low).
  volatileHighRoiCount: number;
  totalResolvedCopies: number;
}

export interface ProposedChange {
  path: string; // dotted path into Rules
  before: number;
  after: number;
  reason: string;
  evidence: string;
  expectedImprovement: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Analyze evidence and propose bounded rule adjustments.
export function proposeRuleChanges(
  current: Rules,
  ev: PerfEvidence,
): { next: Rules; changes: ProposedChange[] } {
  const next = cloneRules(current);
  const changes: ProposedChange[] = [];

  if (ev.copyTrades.length >= 5) {
    // 1) If spread-heavy copies underperform, lower max spread.
    const wide = ev.copyTrades.filter((t) => t.spread > current.copyability.maxSpread * 0.8);
    const wideAvg = avg(wide.map((t) => t.pnl));
    if (wide.length >= 3 && wideAvg < 0) {
      const before = current.copyability.maxSpread;
      const after = round3(clamp(before * 0.85, 0.01, 0.2));
      if (after !== before) {
        next.copyability.maxSpread = after;
        changes.push({
          path: "copyability.maxSpread", before, after,
          reason: "Spread-heavy copy trades underperformed.",
          evidence: `${wide.length} wide-spread copies averaged $${wideAvg.toFixed(2)} PnL (negative).`,
          expectedImprovement: "Fewer costly wide-spread entries; higher fill quality.",
        });
      }
    }

    // 2) If low-liquidity copies underperform, raise min liquidity.
    const thin = ev.copyTrades.filter((t) => t.liquidity < current.copyability.minLiquidity * 1.5);
    const thinAvg = avg(thin.map((t) => t.pnl));
    if (thin.length >= 3 && thinAvg < 0) {
      const before = current.copyability.minLiquidity;
      const after = Math.round(clamp(before * 1.25, 500, 100000));
      if (after !== before) {
        next.copyability.minLiquidity = after;
        changes.push({
          path: "copyability.minLiquidity", before, after,
          reason: "Low-liquidity copy trades performed poorly.",
          evidence: `${thin.length} thin-liquidity copies averaged $${thinAvg.toFixed(2)} PnL (negative).`,
          expectedImprovement: "Avoid unfillable/thin markets; reduce slippage risk.",
        });
      }
    }

    // 3) If late entries lose, reduce allowed price movement.
    const late = ev.copyTrades.filter((t) => t.wasLate);
    const lateAvg = avg(late.map((t) => t.pnl));
    if (late.length >= 3 && lateAvg < 0) {
      const before = current.copyability.maxPriceMoveSinceEntry;
      const after = round3(clamp(before * 0.8, 0.02, 0.3));
      if (after !== before) {
        next.copyability.maxPriceMoveSinceEntry = after;
        changes.push({
          path: "copyability.maxPriceMoveSinceEntry", before, after,
          reason: "Late entries (price already moved) lost money.",
          evidence: `${late.length} late copies averaged $${lateAvg.toFixed(2)} PnL (negative).`,
          expectedImprovement: "Only copy fresh entries; avoid chasing.",
        });
      }
    }
  }

  // 4) If high-ROI wallets are too volatile, increase consistency weighting.
  if (ev.volatileHighRoiCount >= 3 && ev.totalResolvedCopies >= 5) {
    const before = current.weights.consistency;
    const after = round3(clamp(before + 0.03, 0, 0.4));
    if (after !== before) {
      next.weights.consistency = after;
      // keep it sane by trimming roi weight slightly
      next.weights.roi = round3(clamp(current.weights.roi - 0.02, 0, 0.4));
      changes.push({
        path: "weights.consistency", before, after,
        reason: "High-ROI wallets proved too volatile.",
        evidence: `${ev.volatileHighRoiCount} high-ROI/low-consistency wallets detected.`,
        expectedImprovement: "Favor steady wallets over boom-bust ROI.",
      });
    }
  }

  return { next, changes };
}

// Which specific wallets should be downgraded based on poor paper performance.
export function walletsToDowngrade(ev: PerfEvidence, thresholdUsd = -15): string[] {
  return Object.entries(ev.walletPaperPnl)
    .filter(([, pnl]) => pnl <= thresholdUsd)
    .map(([addr]) => addr);
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
