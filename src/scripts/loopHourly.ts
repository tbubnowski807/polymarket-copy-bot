// Convenience orchestration: the operational loop Hermes runs hourly.
// Order: monitor new trades -> score them -> update PnL -> review outcomes.
// (Leaderboard/wallet scans and rule updates run on their own cadence.)
import { log } from "@/lib/logger";
import { monitorTrades } from "./monitorTrades";
import { scoreTrades } from "./scoreTrades";
import { updatePnl } from "./updatePnl";
import { reviewOutcomes } from "./reviewOutcomes";

export async function loopHourly() {
  log.info("=== Hourly loop starting ===");
  const mon = await monitorTrades();
  const sc = await scoreTrades();
  const pnl = await updatePnl();
  const rev = await reviewOutcomes();
  log.info("=== Hourly loop done ===");
  return { mon, sc, pnl, rev };
}

if (require.main === module) {
  loopHourly()
    .then((r) => { log.info(`Loop summary: ${JSON.stringify(r)}`); process.exit(0); })
    .catch((e) => { log.error(`Hourly loop FAILED (real error): ${e.message}`); process.exit(1); });
}
