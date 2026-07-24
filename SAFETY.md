# SAFETY.md

This document explains the safety model of the Polymarket Copy Bot. Read it
before running, deploying, or extending the system.

> **Not financial advice.** This software is a research tool. Nothing it produces
> is a recommendation to buy, sell, or hold anything.

---

## Why version one is paper trading only

Copy trading looks easy and is mostly a trap. Leaderboards are dominated by
survivorship bias, one-hit wonders, and wallets whose edge you cannot actually
replicate (they enter earlier, at better prices, in markets too thin for you to
follow). **The only responsible way to find out whether a copy strategy has an
edge is to simulate it first** — with realistic entry prices, position sizes,
spreads, liquidity limits, and honest outcome accounting — and see if it beats the
naive baseline of blindly copying the leaderboard.

Version one therefore **paper trades only**. Every "trade" is a database row with
a simulated $5–$20 position. No order is ever sent anywhere.

## Why real execution is disabled

Real execution is disabled in code, not just by configuration:

- `src/lib/config.ts` exposes `config.safety` with
  `REAL_TRADING_ENABLED`, `CAN_SIGN_TRANSACTIONS`, `CAN_SPEND_MONEY`, and
  `STORES_PRIVATE_KEYS` all set to `false as const`. They are **constants**, not
  environment variables — no config change can flip them on.
- The paper-trading engine throws if `REAL_TRADING_ENABLED` is ever true.
- There is **no** order-placement, signing, wallet, or fund-movement code path
  anywhere in the codebase. The adapters are **read-only** HTTP GET clients.
- Tests (`src/lib/safety.test.ts`) assert the flags are false, that no
  private-key/mnemonic config surface exists, and that no exported adapter name
  implies real trading.

## How autonomy could be added later — safely

The long-term goal is eventual autonomy, but **only after paper trading proves a
durable edge**. A responsible path would be, in order:

1. Accumulate a large sample of **resolved** paper trades across many markets and
   regimes (not a lucky week).
2. Show the **bot-filtered strategy beats blind copy** on per-trade efficiency
   *and* survives drawdowns, across categories.
3. Add a **separate, isolated execution service** — never in this dashboard —
   with its own audited keys held in a hardware/remote signer, hard position and
   loss limits, a kill switch, and human sign-off for the first live capital.
4. Start with trivial real size, compare live fills to paper assumptions, and only
   scale if reality matches simulation.

None of that lives here, and it should never be bolted onto this app.

## Risks this tool tries to make visible (and their limits)

- **Stale data.** Prices and liquidity move fast. A signal scored minutes ago may
  already be gone. The bot penalizes entries where price has already moved past a
  threshold, but no snapshot is truly real-time.
- **Low liquidity.** Thin markets can't absorb copy volume; displayed prices are
  not fillable size. The bot skips markets below a liquidity floor, but liquidity
  can evaporate after entry.
- **Wide spreads.** A wide bid/ask means you pay to get in and out. The bot skips
  wide-spread markets, but spreads widen exactly when you most want to exit.
- **Copy trading itself.** You are always **behind** the wallet you copy: later
  entry, worse price, and no idea why they entered or when they'll exit. Their
  edge may be information or timing you structurally cannot replicate.
- **Leaderboards are misleading.** They rank by realized PnL, which rewards
  variance and luck. A wallet at the top may be one lucky trade, a whale moving
  size you can't follow, or a strategy that only worked in one past market. The
  one-hit-wonder penalty and minimum-resolved-trades gate exist because of this,
  but they are heuristics, not guarantees.
- **Simulation gap.** Paper PnL assumes you got the price you saw. Real fills,
  fees, and slippage are worse. Treat paper results as an **optimistic upper
  bound**, not a promise.

## Why private keys must never be stored in the app

A dashboard and a set of cron scripts are a **large, internet-exposed attack
surface**. Storing a private key or seed phrase anywhere near it means a single
bug, dependency compromise, misconfigured env, or leaked log could drain funds
irreversibly. There is no "redact" that saves you after a key leaks.

This app is designed so that **there is nothing to steal**: no key input, no key
storage, no signer, no fund access. Secrets that *do* exist (an optional Telegram
token) are redacted from all logs and never rendered in the UI. If and when real
execution is ever built, keys belong in a **separate, isolated, audited signing
service** — never in this repository, this database, or this dashboard.
