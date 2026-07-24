# Hermes Operator Guide

This is **Layer 1**: the Hermes Agent that operates the bot. The dashboard
(Layer 2) only visualizes what these operations produce.

Hermes never trades. It runs read-only scans, updates the paper-trading state,
lets the system improve its own rules, and reports. All of that is just running
the npm scripts on a schedule and summarizing the results.

---

## Operator system prompt

Use this as the Hermes Agent's operating instruction:

```
You operate a Polymarket copy-trading RESEARCH bot that is PAPER TRADING ONLY.

Hard rules (never violate):
- Never place real trades, sign transactions, spend money, or handle private keys.
- If an API fails, report the real error and stop that step. Never fabricate data.
- Demo data is acceptable only when clearly labeled as demo.
- Redact any secrets in what you send.

Your job each cycle:
1. Run the scheduled scans (leaderboard, wallet profiles).
2. Run the hourly loop (monitor new trades, score them, update paper PnL,
   review resolved outcomes).
3. Run the automatic rule updater. Do NOT ask for approval to change
   paper-trading rules — but confirm every change was logged with a reason.
4. Once per day, generate and send the end-of-day report.
5. Once per week, generate and send the weekly summary.

Telegram discipline — send ONLY:
- the daily end-of-day report (always, once/day),
- a very high-confidence paper trade (confidence > 0.85),
- a major rule change,
- a significant wallet upgrade/downgrade,
- a drawdown warning (paper PnL down materially day-over-day).
Stay quiet otherwise.

When you report, answer three things: are we profitable on paper, which wallets
are worth copying, and what did the bot learn today.
```

## Recommended cadence

| Frequency | Command(s) | Why |
|-----------|-----------|-----|
| Daily (pre-market) | `scan:leaderboard` → `scan:wallets` | Refresh wallet universe + scores |
| Hourly | `loop:hourly` (monitor → score → PnL → review) | Detect/copy new trades, mark paper PnL |
| Daily (after close) | `update:rules` → `report:daily` | Learn from the day, then report |
| Weekly | `report:weekly` | Weekly performance summary |

Run everything from the project directory with the environment configured. Each
script exits non-zero and prints the **real error** on failure — Hermes should
surface that, not paper over it.

## What Hermes should watch for

- **Profitability on paper** — is total paper PnL positive and is win rate holding?
- **Copy candidates** — how many `paper_copy` decisions today, and from which
  tracked wallets?
- **Learning** — did `update:rules` produce a new `RuleSet` version? What changed,
  with what evidence and expected improvement?
- **Bot vs blind** — is the bot-filtered strategy beating blind leaderboard copy
  on per-trade efficiency?
- **Drawdown** — flag a material day-over-day drop in paper PnL.

## Hermes cron examples

These jobs are **already installed** as Hermes cron jobs (wrapper scripts live in
`~/.hermes/scripts/`). Manage them with the `cronjob` tool (`action='list'`,
`'pause'`, `'resume'`, `'run'`, `'remove'`).

| Job | Schedule | Script | Delivery |
|-----|----------|--------|----------|
| Polybot — Daily Wallet Scan | `0 8 * * *` | `polybot-scan.sh` | silent (local) |
| Polybot — Hourly Loop | `0 * * * *` | `polybot-hourly.sh` | silent (local) |
| Polybot — End-of-Day Report | `0 22 * * *` | `polybot-daily.sh` | origin chat |
| Polybot — Weekly Summary | `15 22 * * 0` | `polybot-weekly.sh` | origin chat |

All wrappers run with `DATA_MODE=live` so the bot never fabricates data on a
schedule (a real API failure surfaces as a cron error alert). The two operational
jobs are silent watchdogs — they only speak up on failure. The report jobs
deliver clean report text to the chat.

The wrapper scripts:

```
~/.hermes/scripts/polybot-scan.sh     # scan:leaderboard + scan:wallets
~/.hermes/scripts/polybot-hourly.sh   # loop:hourly (monitor→score→pnl→review)
~/.hermes/scripts/polybot-daily.sh    # update:rules + report:daily + print
~/.hermes/scripts/polybot-weekly.sh   # report:weekly + print
```


### Equivalent system crontab

```cron
0  8 * * *  cd /path/to/polymarket-copy-bot && npm run scan:leaderboard && npm run scan:wallets >> logs/scan.log 2>&1
0  * * * *  cd /path/to/polymarket-copy-bot && npm run loop:hourly            >> logs/loop.log 2>&1
0 22 * * *  cd /path/to/polymarket-copy-bot && npm run update:rules && npm run report:daily >> logs/report.log 2>&1
15 22 * * 0 cd /path/to/polymarket-copy-bot && npm run report:weekly          >> logs/weekly.log 2>&1
```

> Telegram alerts are sent by the report scripts only when `TELEGRAM_BOT_TOKEN`
> and `TELEGRAM_CHAT_ID` are set. With them unset, reports are written to the DB
> and printed to stdout — nothing leaves the machine.
