// Centralized, typed configuration. All secrets come from env vars.
// SAFETY: there is intentionally NO private key / mnemonic / signer config.

export type DataMode = "live" | "demo" | "auto";
export type LeaderboardSource = "polymarket" | "bullpen";

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  // Lazy getters so scripts (e.g. seed) that set env at runtime are respected.
  get dataMode(): DataMode {
    return (process.env.DATA_MODE as DataMode) ?? "auto";
  },
  get leaderboardSource(): LeaderboardSource {
    return (process.env.LEADERBOARD_SOURCE as LeaderboardSource) ?? "polymarket";
  },

  api: {
    data: process.env.POLYMARKET_DATA_API ?? "https://data-api.polymarket.com",
    gamma:
      process.env.POLYMARKET_GAMMA_API ?? "https://gamma-api.polymarket.com",
    clob: process.env.POLYMARKET_CLOB_API ?? "https://clob.polymarket.com",
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    get enabled() {
      return Boolean(this.botToken && this.chatId);
    },
  },

  paper: {
    minSizeUsd: num(process.env.PAPER_MIN_SIZE_USD, 5),
    maxSizeUsd: num(process.env.PAPER_MAX_SIZE_USD, 20),
  },

  // Hard safety switches. These are constants, not env-configurable, so no
  // config change can ever enable real trading in version one.
  safety: {
    REAL_TRADING_ENABLED: false as const,
    CAN_SIGN_TRANSACTIONS: false as const,
    CAN_SPEND_MONEY: false as const,
    STORES_PRIVATE_KEYS: false as const,
  },
} as const;

export type AppConfig = typeof config;
