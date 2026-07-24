# Polymarket Copy Bot — Hermes-operated paper-trading research system

A **self-improving Polymarket copy-trading research system** operated by a Hermes
Agent, with a Vercel-ready **Max HQ dashboard**. It finds high-quality wallets on
the leaderboard, scores their new trades, and **paper-trades** copy candidates —
so you can prove an edge *before* any real money is ever involved.

> **This is not financial advice.**
> **Version one is paper trading only. It never places real trades, never signs
> transactions, never spends money, and never asks for or stores private keys.**

---

## What the bot does

1. Pulls the Polymarket (or Bullpen) leaderboard and scans the top wallets.
2. Analyzes each wallet's last 30 days of activity.
3. Scores wallets by ROI, consistency, copyability, category edge, liquidity
   quality, entry timing, and resolved-trade performance.
4. **Penalizes one-hit wonders** — wallets whose profit came from a single lucky
   trade, or who have too few resolved trades.
5. Ranks wallets globally and by category; marks each **track / watch / ignore**
   with a written reason.
6. Skips wallets and markets that are too illiquid or too wide-spread to copy.
7. Monitors tracked wallets for **new trades**, scores each for copy-worthiness.
8. **Paper-trades** strong candidates with a simulated $5–$20 position size.
9. Updates paper PnL hourly; resolves trades when markets settle.
10. Reviews outcomes: was each decision good? Tracks **missed winners** and
    **avoided losers**.
11. Benchmarks the **bot-filtered strategy vs. blindly copying leaderboard wallets**.
12. **Automatically updates its own rules** based on performance — every change is
    versioned and explained.
13. Generates an **end-of-day report** (optionally sent to Telegram) and weekly
    summaries.
14. Shows everything in a clean, focused dashboard.

## What the bot does NOT do

- ❌ It does **not** place real trades.
- ❌ It does **not** sign transactions or interact with any wallet/signer.
- ❌ It does **not** spend money or move funds.
- ❌ It does **not** ask for, receive, or store private keys / seed phrases.
- ❌ It does **not** fabricate live data — if an API fails, it shows the **real
  error and stops**. Demo data is only ever used when explicitly labeled `DEMO`.

These guarantees are enforced in code (`src/lib/config.ts` → `config.safety`, all
`false` and non-configurable) and covered by tests (`src/lib/safety.test.ts`).
See **[SAFETY.md](./SAFETY.md)**.

---

## Tech stack

TypeScript · Next.js 14 (App Router) · React · Tailwind · SQLite (local) · Prisma ·
Recharts · Vitest. No paid services required for version one.

## Architecture

```
src/
  adapters/     Data source layer (leaderboard, trades, markets, prices, outcomes)
                Real Polymarket public APIs + clearly-labeled DEMO fallback.
  scoring/      Pure, unit-tested scoring: wallet, trade, paper PnL, rules.
  engine/       Helpers, benchmark, self-improving rule engine, Telegram.
  scripts/      The operational loop (one npm command each).
  app/          Next.js dashboard (9 pages) + /api/health.
  components/   UI kit + charts.
  lib/          config, prisma, logger (redacting), queries, formatters.
prisma/         schema.prisma (SQLite; swap to Postgres for prod).
```

### Adapter layer & data modes

`DATA_MODE` controls data sourcing:

- `live` — only real Polymarket public APIs. On any failure, show the real error
  and stop. **Never fakes data.**
- `demo` — clearly-labeled demo data only (no network). Every demo record is
  tagged `DEMO` in the UI and uses `0xDEMO…` addresses.
- `auto` (default) — try live; if the **network is unavailable**, fall back to
  labeled demo data. A real API error (4xx/5xx) still stops with the real error.

---

## Setup

```bash
# 1. Install
npm install

# 2. Configure (all keys optional)
cp .env.example .env

# 3. Create the database
npm run db:migrate        # or: npm run db:push

# 4. Seed clearly-labeled demo data (proves the whole pipeline end-to-end)
npm run seed

# 5. Run the dashboard
npm run dev               # http://localhost:3000
```

### Environment variables (all optional)

| Var | Purpose | Default |
|-----|---------|---------|
| `DATABASE_URL` | Prisma DB | `file:./dev.db` |
| `DATA_MODE` | `live` / `demo` / `auto` | `auto` |
| `LEADERBOARD_SOURCE` | `polymarket` / `bullpen` | `polymarket` |
| `POLYMARKET_DATA_API` / `_GAMMA_API` / `_CLOB_API` | API base URLs | public defaults |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Optional alerts | blank = disabled |
| `PAPER_MIN_SIZE_USD` / `PAPER_MAX_SIZE_USD` | Paper sizing | `5` / `20` |

> There is intentionally **no** variable for a private key, mnemonic, or signer.
> Secrets are redacted from all logs and the UI.

---

## Commands (the operational loop)

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dashboard |
| `npm run db:migrate` | Create/upgrade the database |
| `npm run seed` | Seed labeled demo data + historical backfill |
| `npm run scan:leaderboard` | Pull leaderboard, upsert wallet stubs |
| `npm run scan:wallets` | Profile + score wallets, assign status |
| `npm run monitor:trades` | Detect new trades from tracked wallets |
| `npm run score:trades` | Score signals → decisions → paper copies |
| `npm run paper:update-pnl` | Hourly paper PnL update + resolutions |
| `npm run review:outcomes` | Judge decisions; missed winners / avoided losers |
| `npm run update:rules` | **Auto rule update** (versioned + logged) |
| `npm run report:daily` | End-of-day report (+ Telegram if configured) |
| `npm run report:weekly` | Weekly summary |
| `npm run loop:hourly` | monitor → score → PnL → review, in one shot |
| `npm run test` | Run the test suite |

---

## How it works

### Leaderboard scan
`scan:leaderboard` pulls the top wallets via the leaderboard adapter and stores a
`LeaderboardScan` plus a `WalletProfile` stub per wallet. If the live endpoint's
schema differs, it surfaces the raw response error rather than guessing.

### Wallet scoring
`scan:wallets` scores each wallet from its **live positions** (Polymarket's
`/positions` endpoint, which returns real per-position `cashPnl`, `realizedPnl`,
cost basis, and settlement status). This reflects true 30-day performance and,
unlike per-trade market lookups, does **not** break when Polymarket delists
resolved short-lived markets (common for sports). Each position maps into the
scorer's trade shape, then we compute:

- **ROI**, **consistency** (win-rate + inverse return-volatility), **copyability**
  (liquidity/spread/timing), **category strengths**, and a **one-hit-wonder
  penalty**. The weighted blend minus the penalty is the **global score**, which
  maps to **track / watch / ignore** with a written reason.

### Trade scoring & paper trading
`monitor:trades` records new `ObservedTrade`s + `MarketSnapshot`s. `score:trades`
produces a `DecisionJournal` entry (full score breakdown, reasons, risks) and, for
`paper_copy` decisions, a `PaperTrade` sized **$5–$20** by confidence. Hard gates
force a skip for weak wallets, wide spreads, thin liquidity, or late entries
(price already moved past `maxPriceMoveSinceEntry`).

Paper PnL uses share math: `shares = size / entryPrice`; unrealized =
`shares * currentPrice − size`; on resolution a winning share pays $1, a loser $0.

### Self-improvement
`update:rules` gathers evidence from resolved paper trades and reviews, then
proposes **bounded** rule changes (e.g. lower max spread if wide-spread copies
lose; raise min liquidity if thin copies lose; reduce allowed price movement if
late entries lose; increase consistency weight if high-ROI wallets are volatile).
It does **not** ask for approval, but writes a new `RuleSet` version and a
`RuleChange` audit row with reason, evidence, before/after, and expected
improvement. Chronically-underperforming wallets are auto-downgraded.

### Benchmark
The dashboard compares **bot-filtered** paper trades against **blindly copying**
every observed trade. The honest edge metric is **PnL per trade** (efficiency):
the bot wins by skipping the late/illiquid/weak setups that drag down blind copy.

---

## Interpreting the dashboard

The **Overview** answers three questions immediately:

1. **Are we profitable on paper?** — total paper PnL + win rate.
2. **Which wallets are worth copying?** — tracked count + today's copy candidates.
3. **What did the bot learn today?** — latest automatic rule changes.

Other pages: **Wallet Rankings** (top-500 scan), **Wallet Profile** (per-wallet
deep dive + copyability verdict), **Trade Signals**, **Paper Trades**, **Decision
Journal** (score breakdowns + hindsight verdicts), **Performance** (charts,
benchmark, missed/avoided), **Rules** (thresholds + full change history), and
**Reports**.

`DEMO` badges appear whenever data came from the labeled demo source.

---

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. **Switch the datasource to Postgres** for production (Vercel is serverless;
   SQLite file storage is not durable). In `prisma/schema.prisma` set
   `provider = "postgresql"` and point `DATABASE_URL` at a Vercel Postgres / Neon
   / Supabase database, then run `prisma migrate deploy`.
3. Set env vars in the Vercel dashboard (`DATA_MODE`, optional `TELEGRAM_*`).
4. Deploy. The dashboard is read-only over the DB; the **operational scripts run
   from Hermes** (see below), not inside Vercel functions.
5. A `vercel.json` is included; the build runs `prisma generate && next build`.

## Add it to Max HQ

The dashboard is a self-contained Next.js app designed to embed in Max HQ. Point a
Max HQ panel at the deployed URL (or `http://localhost:3000` locally). The layout
is dark, focused, and fits an iframe/panel. `/api/health` returns a JSON status
(including the all-`false` safety flags) for HQ health checks.

## How Hermes operates it

See **[docs/HERMES_OPERATOR.md](./docs/HERMES_OPERATOR.md)** for the operator
prompt and the recommended cron cadence. In short, Hermes runs the scans on a
schedule, runs the hourly loop, applies automatic rule updates, sends the
end-of-day report, and only sends **important** Telegram alerts.

---

## Testing

```bash
npm run test
```

Covers wallet scoring, one-hit-wonder penalty, copyability, trade scoring, paper
trade creation, hourly PnL math, rule versioning, automatic rule changes,
benchmark comparison, read-only safety, no-real-trade-execution, and secret
redaction.
