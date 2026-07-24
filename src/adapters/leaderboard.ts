// Leaderboard adapter. Pulls top wallets from Polymarket (or Bullpen).
// On live API failure it surfaces the REAL error (unless mode allows demo).
//
// NOTE: Polymarket's public leaderboard endpoint shape has changed over time.
// We try a known public endpoint; if the schema differs, the raw error is
// shown so a human can fix the mapping — we never invent wallet data.

import { config } from "@/lib/config";
import type { DataMode, LeaderboardEntry } from "@/lib/types";
import { getJson, withMode } from "./http";
import { demoLeaderboard } from "./demoData";
import { log } from "@/lib/logger";

interface PolyLeaderRow {
  rank?: string | number;
  proxyWallet?: string;
  wallet?: string;
  address?: string;
  userName?: string;
  name?: string;
  pseudonym?: string;
  amount?: number;
  pnl?: number;
  vol?: number;
  volume?: number;
}

async function fetchPolymarket(limit: number): Promise<LeaderboardEntry[]> {
  // Public leaderboard by PnL over a 30d window. Verified endpoint + schema:
  //   GET /v1/leaderboard?window=30d&limit=N&offset=M
  //   -> [{ rank, proxyWallet, userName, xUsername, vol, pnl, ... }]
  // The endpoint HARD-CAPS at 50 rows per request, so we paginate with offset
  // to reach the requested `limit` (e.g. top 500 = 10 pages of 50).
  const PAGE = 50;
  const all: PolyLeaderRow[] = [];
  for (let offset = 0; offset < limit; offset += PAGE) {
    const pageSize = Math.min(PAGE, limit - offset);
    const url = `${config.api.data}/v1/leaderboard?window=30d&limit=${pageSize}&offset=${offset}`;
    const rows = await getJson<PolyLeaderRow[] | { data?: PolyLeaderRow[] }>(url);
    const list: PolyLeaderRow[] = Array.isArray(rows) ? rows : rows.data ?? [];
    if (offset === 0 && (!Array.isArray(list) || list.length === 0)) {
      throw new Error(
        `Leaderboard response from ${url} had no usable rows. ` +
          `The public schema may have changed — inspect the raw response and update the mapping in leaderboard.ts. Not faking data.`,
      );
    }
    if (!Array.isArray(list) || list.length === 0) break; // reached the end
    all.push(...list);
    if (list.length < pageSize) break; // last (partial) page
  }
  return all.map((r, i) => {
    const address = r.proxyWallet ?? r.wallet ?? r.address;
    if (!address) {
      throw new Error(
        `Leaderboard row ${i} missing wallet address. Raw: ${JSON.stringify(r).slice(0, 200)}`,
      );
    }
    return {
      address: address.toLowerCase(),
      label: r.userName ?? r.name ?? r.pseudonym ?? undefined,
      rank: r.rank != null ? Number(r.rank) : i + 1,
      pnl: r.pnl ?? r.amount,
      volume: r.volume ?? r.vol,
    };
  });
}

async function fetchBullpen(limit: number): Promise<LeaderboardEntry[]> {
  // Bullpen is not a guaranteed-public endpoint. We attempt it and, on failure,
  // surface the real error rather than fabricate.
  const url = `https://api.bullpen.fi/leaderboard?limit=${limit}`;
  const rows = await getJson<PolyLeaderRow[]>(url);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Bullpen leaderboard from ${url} returned no rows.`);
  }
  return rows.map((r, i) => ({
    address: (r.wallet ?? r.address ?? "").toLowerCase(),
    label: r.name,
    rank: i + 1,
    pnl: r.pnl,
    volume: r.volume,
  }));
}

export async function getLeaderboard(
  limit = 500,
  mode: DataMode = config.dataMode,
): Promise<{ data: LeaderboardEntry[]; demo: boolean; source: string }> {
  const source = config.leaderboardSource;
  log.info(`Fetching ${source} leaderboard (top ${limit}), mode=${mode}`);
  const { data, demo } = await withMode(
    mode,
    () => (source === "bullpen" ? fetchBullpen(limit) : fetchPolymarket(limit)),
    () => demoLeaderboard(limit),
    `leaderboard[${source}]`,
  );
  return { data, demo, source: demo ? `${source} (DEMO)` : source };
}
