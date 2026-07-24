// Weekly report = daily report with a 7-day window.
import { buildDailyReport } from "./reportDaily";
import { log } from "@/lib/logger";

if (require.main === module) {
  const date = new Date().toISOString().slice(0, 10);
  buildDailyReport(date, "weekly")
    .then(() => process.exit(0))
    .catch((e) => { log.error(`Weekly report FAILED (real error): ${e.message}`); process.exit(1); });
}
