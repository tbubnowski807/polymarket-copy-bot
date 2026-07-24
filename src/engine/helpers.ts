// Engine helpers shared across scripts: active ruleset management, trade
// enrichment (attaching resolution/profit/liquidity), and JSON helpers.
import { prisma } from "@/lib/prisma";
import { DEFAULT_RULES, type Rules } from "@/scoring/rules";
import type { RawTrade } from "@/lib/types";
import type { ScoredTrade } from "@/scoring/wallet";
import { getMarket } from "@/adapters/markets";
import { realizedPnlOnResolution } from "@/scoring/paper";
import { log } from "@/lib/logger";

export function j(v: unknown): string {
  return JSON.stringify(v);
}

// True when a market lookup returned no data (resolved/delisted/slug mismatch),
// as opposed to a genuine transport/API failure. Used to exclude an individual
// unavailable market from scoring WITHOUT fabricating it.
export function isMissingMarketError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return /No market found/i.test(msg);
}

export function parse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// Ensure a version-1 active ruleset exists; return active rules + version.
export async function getActiveRules(): Promise<{ rules: Rules; version: number; id: string }> {
  let active = await prisma.ruleSet.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  if (!active) {
    active = await prisma.ruleSet.create({
      data: { version: 1, active: true, rulesJson: j(DEFAULT_RULES) },
    });
  }
  return { rules: parse<Rules>(active.rulesJson, DEFAULT_RULES), version: active.version, id: active.id };
}

// Enrich raw trades with market context (resolution, profit, liquidity, spread,
// entry timing) so the wallet scorer can operate. Uses the market adapter,
// which respects DATA_MODE (live vs clearly-labeled demo).
export async function enrichTrades(raw: RawTrade[]): Promise<ScoredTrade[]> {
  const out: ScoredTrade[] = [];
  // Cache markets to avoid refetching.
  const cache = new Map<string, Awaited<ReturnType<typeof getMarket>>["data"]>();
  let skippedMissing = 0;
  for (const t of raw) {
    let market = cache.get(t.marketId);
    if (!market) {
      try {
        const res = await getMarket(t.marketId);
        market = res.data;
        cache.set(t.marketId, market);
      } catch (err) {
        // An INDIVIDUAL market that can't be found (resolved/delisted/slug
        // mismatch) is excluded from scoring — NOT fabricated. Genuine API
        // failures (network, 5xx) are re-thrown so the caller stops.
        if (isMissingMarketError(err)) {
          skippedMissing++;
          continue;
        }
        throw err;
      }
    }
    const resolved = Boolean(market.resolved);
    let won: boolean | undefined;
    let profit: number | undefined;
    if (resolved) {
      // If we know the winning outcome, compute; else infer from demo raw.
      const winning = market.resolvedOutcome;
      if (winning) {
        won = winning.toLowerCase() === t.outcome.toLowerCase();
      } else {
        // Unknown resolution outcome from live data: treat as unresolved for
        // scoring rather than guessing. (We never fabricate a winner.)
        won = undefined;
      }
      if (won !== undefined) profit = realizedPnlOnResolution(t.size, t.price, won);
    }
    // Entry timing: fraction of market life elapsed at entry. We approximate
    // using time-to-resolution now vs trade age (demo has ttr; live may not).
    const ttr = market.timeToResolutionHours ?? 24;
    const tradeAgeH = (Date.now() - +new Date(t.timestamp)) / 3600000;
    const totalLifeH = Math.max(1, ttr + tradeAgeH);
    const entryTiming = Math.max(0, Math.min(1, tradeAgeH / totalLifeH));

    out.push({
      ...t,
      resolved,
      won,
      profit,
      liquidity: market.liquidity ?? 0,
      spread: market.spread ?? 0.03,
      entryTiming,
    });
  }
  if (skippedMissing > 0) {
    log.warn(`enrichTrades: skipped ${skippedMissing} trade(s) whose market could not be resolved (excluded from scoring, not fabricated).`);
  }
  return out;
}
