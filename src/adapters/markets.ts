// Market + price + outcome adapter. Uses Polymarket Gamma (markets) and CLOB
// (order book / prices). On live failure, surfaces the real error.
import { config } from "@/lib/config";
import type { DataMode, MarketData, OutcomeResult, PriceQuote } from "@/lib/types";
import { getJson, withMode } from "./http";
import { demoMarket } from "./demoData";
import { log } from "@/lib/logger";

interface GammaMarket {
  id?: string;
  conditionId?: string;
  question?: string;
  category?: string;
  slug?: string;
  outcomes?: string; // JSON-encoded array string, e.g. "[\"Yes\",\"No\"]"
  outcomePrices?: string; // JSON-encoded array string, e.g. "[\"0.94\",\"0.06\"]"
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  liquidity?: number | string;
  liquidityNum?: number;
  volume?: number | string;
  volumeNum?: number;
  endDate?: string;
  closed?: boolean;
  umaResolutionStatus?: string;
}

function parseStrArray(s?: string): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function parsePrices(s?: string): number[] {
  return parseStrArray(s).map(Number);
}

// Simple global throttle + in-process cache for gamma market lookups. Polymarket
// sits behind Cloudflare, which rate-limits bursts (HTTP 429). We space calls
// out and cache each market for the process lifetime so a profiling run that
// touches the same markets repeatedly makes far fewer requests.
const MARKET_CACHE = new Map<string, MarketData>();
let lastGammaCall = 0;
const GAMMA_MIN_INTERVAL_MS = Number(process.env.GAMMA_MIN_INTERVAL_MS ?? 120);

async function throttleGamma(): Promise<void> {
  const now = Date.now();
  const wait = lastGammaCall + GAMMA_MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGammaCall = Date.now();
}

// Look up a market by slug (preferred) or conditionId. Both are verified to
// work against gamma: ?slug=<slug> and ?condition_ids=<0x...>.
async function fetchGammaMarket(marketId: string): Promise<MarketData> {
  const cached = MARKET_CACHE.get(marketId);
  if (cached) return cached;
  await throttleGamma();
  const isCondition = marketId.startsWith("0x");
  const url = isCondition
    ? `${config.api.gamma}/markets?condition_ids=${encodeURIComponent(marketId)}`
    : `${config.api.gamma}/markets?slug=${encodeURIComponent(marketId)}`;
  const rows = await getJson<GammaMarket[]>(url);
  const m = Array.isArray(rows) ? rows[0] : (rows as GammaMarket);
  if (!m) {
    throw new Error(
      `No market found for "${marketId}" at ${url}. Not faking market data.`,
    );
  }

  const outcomes = parseStrArray(m.outcomes);
  const prices = parsePrices(m.outcomePrices);
  // Index of "Yes" (or first outcome) for yes/no pricing.
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
  const yi = yesIdx >= 0 ? yesIdx : 0;
  const ni = yi === 0 ? 1 : 0;
  const yes = prices[yi];
  const no = prices[ni] ?? (yes != null ? 1 - yes : undefined);

  const closed = Boolean(m.closed);
  // On a resolved market, the winning outcome is the one priced ~1.
  let resolvedOutcome: string | undefined;
  if (closed && prices.length && outcomes.length) {
    const winIdx = prices.findIndex((p) => p >= 0.99);
    if (winIdx >= 0) resolvedOutcome = outcomes[winIdx];
  }

  const endMs = m.endDate ? +new Date(m.endDate) : undefined;
  const ttr = endMs ? (endMs - Date.now()) / 3600000 : undefined;
  const liquidity = m.liquidityNum ?? (m.liquidity != null ? Number(m.liquidity) : undefined);
  const volume = m.volumeNum ?? (m.volume != null ? Number(m.volume) : undefined);

  const result: MarketData = {
    marketId,
    conditionId: m.conditionId,
    question: m.question ?? "unknown",
    category: m.category,
    yesPrice: yes,
    noPrice: no,
    bestBid: m.bestBid,
    bestAsk: m.bestAsk,
    spread:
      m.spread ??
      (m.bestBid != null && m.bestAsk != null ? m.bestAsk - m.bestBid : undefined),
    liquidity,
    volume,
    timeToResolutionHours: ttr,
    resolved: closed,
    resolvedOutcome,
    raw: m,
  };
  MARKET_CACHE.set(marketId, result);
  return result;
}

export async function getMarket(
  marketId: string,
  mode: DataMode = config.dataMode,
): Promise<{ data: MarketData; demo: boolean }> {
  return withMode(
    mode,
    () => fetchGammaMarket(marketId),
    () => demoMarket(marketId),
    `market`,
  );
}

export async function getPrice(
  marketId: string,
  outcome: string,
  mode: DataMode = config.dataMode,
): Promise<{ data: PriceQuote; demo: boolean }> {
  const { data: m, demo } = await getMarket(marketId, mode);
  const price =
    outcome.toLowerCase() === "no"
      ? m.noPrice ?? (m.yesPrice != null ? 1 - m.yesPrice : 0.5)
      : m.yesPrice ?? 0.5;
  return {
    data: {
      marketId,
      outcome,
      price,
      bestBid: m.bestBid,
      bestAsk: m.bestAsk,
      spread: m.spread,
      liquidity: m.liquidity,
      demo,
    },
    demo,
  };
}

export async function getOutcome(
  marketId: string,
  mode: DataMode = config.dataMode,
): Promise<{ data: OutcomeResult; demo: boolean }> {
  const { data: m, demo } = await getMarket(marketId, mode);
  return {
    data: {
      marketId,
      resolved: Boolean(m.resolved),
      winningOutcome: m.resolvedOutcome,
      demo,
    },
    demo,
  };
}

export { log };
