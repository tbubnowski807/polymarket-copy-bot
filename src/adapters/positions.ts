// Positions adapter. Polymarket's /positions endpoint returns a wallet's
// portfolio with REAL per-position PnL — the best substrate for wallet scoring
// on live data (it doesn't depend on delisted gamma markets).
//
// Verified shape (GET /positions?user=<addr>&limit=N):
//   [{ proxyWallet, conditionId, asset, size, avgPrice, initialValue,
//      currentValue, cashPnl, percentPnl, realizedPnl, percentRealizedPnl,
//      curPrice, redeemable, title, slug, ... }]
import { config } from "@/lib/config";
import type { DataMode } from "@/lib/types";
import { getJson, withMode } from "./http";
import { demoWalletTrades } from "./demoData";
import type { ScoredTrade } from "@/scoring/wallet";

export interface WalletPosition {
  conditionId?: string;
  slug?: string;
  title?: string;
  category?: string;
  size: number; // shares held
  avgPrice: number;
  initialValue: number; // USD cost basis
  currentValue: number;
  cashPnl: number; // total PnL (realized + unrealized), USD
  percentPnl: number;
  realizedPnl: number;
  curPrice: number;
  redeemable: boolean; // true = market resolved & claimable
}

interface PolyPositionRow {
  conditionId?: string;
  slug?: string;
  title?: string;
  category?: string;
  size?: number;
  avgPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  realizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
}

async function fetchPolymarketPositions(address: string): Promise<WalletPosition[]> {
  const url = `${config.api.data}/positions?user=${address}&limit=500`;
  const rows = await getJson<PolyPositionRow[] | { data?: PolyPositionRow[] }>(url);
  const list: PolyPositionRow[] = Array.isArray(rows) ? rows : rows.data ?? [];
  return list.map((r) => ({
    conditionId: r.conditionId,
    slug: r.slug,
    title: r.title,
    category: r.category,
    size: Number(r.size ?? 0),
    avgPrice: Number(r.avgPrice ?? 0),
    initialValue: Number(r.initialValue ?? 0),
    currentValue: Number(r.currentValue ?? 0),
    cashPnl: Number(r.cashPnl ?? 0),
    percentPnl: Number(r.percentPnl ?? 0),
    realizedPnl: Number(r.realizedPnl ?? 0),
    curPrice: Number(r.curPrice ?? 0),
    redeemable: Boolean(r.redeemable),
  }));
}

export async function getWalletPositions(
  address: string,
  mode: DataMode = config.dataMode,
): Promise<{ data: WalletPosition[]; demo: boolean }> {
  return withMode(
    mode,
    () => fetchPolymarketPositions(address),
    () => demoPositions(address),
    "positions",
  );
}

// Derive clearly-labeled demo positions from the demo trade generator so demo
// mode still produces a scoreable portfolio.
function demoPositions(address: string): WalletPosition[] {
  return demoWalletTrades(address, 30).map((t) => {
    const won = Math.random() < 0.5;
    const cashPnl = won ? t.size * (Math.random() * 0.8) : -t.size * (Math.random() * 0.6);
    return {
      conditionId: t.conditionId,
      slug: t.marketId,
      title: t.marketQuestion,
      category: t.marketCategory,
      size: t.size / Math.max(0.05, t.price),
      avgPrice: t.price,
      initialValue: t.size,
      currentValue: t.size + cashPnl,
      cashPnl,
      percentPnl: (cashPnl / t.size) * 100,
      realizedPnl: cashPnl,
      curPrice: t.price,
      redeemable: won,
    };
  });
}

// Map positions into the existing ScoredTrade shape so we reuse ALL existing
// wallet-scoring logic (consistency, one-hit-wonder, category, etc.).
// A position is treated as "resolved" when it is redeemable (market settled) or
// its value has effectively gone to an extreme (fully realized).
export function positionsToScoredTrades(
  address: string,
  positions: WalletPosition[],
): ScoredTrade[] {
  return positions.map((p) => {
    const settled = p.redeemable || p.curPrice <= 0.02 || p.curPrice >= 0.98;
    return {
      walletAddress: address,
      marketId: p.slug ?? p.conditionId ?? "unknown",
      conditionId: p.conditionId,
      marketQuestion: p.title ?? "unknown market",
      marketCategory: p.category ?? categoryFromTitle(p.title),
      outcome: "Yes",
      side: "BUY" as const,
      price: p.avgPrice,
      size: p.initialValue,
      timestamp: new Date().toISOString(),
      raw: p,
      resolved: settled,
      won: settled ? p.cashPnl > 0 : undefined,
      profit: settled ? p.cashPnl : undefined,
      // Liquidity/spread aren't in the positions payload; use neutral-ish
      // proxies so copyability isn't unfairly penalized. Real spread/liquidity
      // are still fetched per-market in the trade-signal path.
      liquidity: 6000,
      spread: 0.03,
      entryTiming: 0.4,
    };
  });
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(election|president|senate|congress|governor|poll|trump|biden)\b/i, "Politics"],
  [/\b(bitcoin|btc|ethereum|eth|crypto|solana|token)\b/i, "Crypto"],
  [/\b(nba|nfl|nhl|mlb|premier|ufc|match|vs\.?|game|cup|league|championship)\b/i, "Sports"],
  [/\b(fed|rate|gdp|inflation|cpi|recession|jobs|unemployment)\b/i, "Economics"],
  [/\b(movie|album|oscar|grammy|box office|celebrity)\b/i, "Pop Culture"],
];

function categoryFromTitle(title?: string): string | undefined {
  if (!title) return undefined;
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(title)) return cat;
  return "Other";
}
