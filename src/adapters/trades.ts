// Trades adapter. Fetches a wallet's recent trade activity.
import { config } from "@/lib/config";
import type { DataMode, RawTrade } from "@/lib/types";
import { getJson, withMode } from "./http";
import { demoWalletTrades } from "./demoData";
import { log } from "@/lib/logger";

interface PolyActivityRow {
  proxyWallet?: string;
  conditionId?: string;
  slug?: string;
  eventSlug?: string;
  title?: string;
  question?: string;
  outcome?: string;
  outcomeIndex?: number;
  side?: string;
  price?: number;
  usdcSize?: number;
  size?: number;
  timestamp?: number; // unix seconds
  type?: string;
  category?: string;
}

async function fetchPolymarketActivity(
  address: string,
  lookbackDays: number,
): Promise<RawTrade[]> {
  const since = Math.floor(Date.now() / 1000) - lookbackDays * 86400;
  // Verified public activity endpoint + schema:
  //   GET /activity?user=<addr>&limit=500&type=TRADE
  //   -> [{ proxyWallet, timestamp, conditionId, size, usdcSize, price,
  //         side, outcomeIndex, outcome, title, slug, eventSlug, ... }]
  // We key the market by `slug` (gamma can resolve ?slug=), falling back to
  // conditionId which gamma resolves via ?condition_ids=.
  const url = `${config.api.data}/activity?user=${address}&limit=500&type=TRADE`;
  const rows = await getJson<PolyActivityRow[] | { data?: PolyActivityRow[] }>(
    url,
  );
  const list: PolyActivityRow[] = Array.isArray(rows) ? rows : rows.data ?? [];
  return list
    .filter((r) => (r.timestamp ?? 0) >= since)
    .map((r) => ({
      walletAddress: address.toLowerCase(),
      marketId: r.slug ?? r.conditionId ?? "unknown",
      conditionId: r.conditionId,
      marketQuestion: r.title ?? r.question ?? r.slug ?? "unknown market",
      marketCategory: r.category,
      // The API gives the human outcome label directly ("Yes"/"No"/team name).
      outcome: r.outcome ?? (r.outcomeIndex === 1 ? "No" : "Yes"),
      side: (r.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
      price: Number(r.price ?? 0),
      // usdcSize is the USD notional; size is share count. Prefer notional.
      size: Number(r.usdcSize ?? r.size ?? 0),
      timestamp: new Date((r.timestamp ?? 0) * 1000).toISOString(),
      raw: r,
    }));
}

export async function getWalletTrades(
  address: string,
  lookbackDays = 30,
  mode: DataMode = config.dataMode,
): Promise<{ data: RawTrade[]; demo: boolean }> {
  log.info(`Fetching trades for wallet, lookback=${lookbackDays}d, mode=${mode}`);
  return withMode(
    mode,
    () => fetchPolymarketActivity(address, lookbackDays),
    () => demoWalletTrades(address, lookbackDays),
    `trades`,
  );
}
