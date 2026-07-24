import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Health + safety status. Confirms the app is read-only w.r.t. real trading.
export async function GET() {
  let dbOk = false;
  let counts: Record<string, number> = {};
  let dbError: string | null = null;
  try {
    counts = {
      wallets: await prisma.walletProfile.count(),
      paperTrades: await prisma.paperTrade.count(),
      decisions: await prisma.decisionJournal.count(),
      ruleSets: await prisma.ruleSet.count(),
    };
    dbOk = true;
  } catch (e) {
    dbError = (e as Error).message;
  }

  return NextResponse.json({
    ok: dbOk,
    safety: config.safety, // all false — no real trading, signing, spending, keys
    dataMode: config.dataMode,
    leaderboardSource: config.leaderboardSource,
    telegramConfigured: config.telegram.enabled,
    counts,
    dbError,
  });
}
