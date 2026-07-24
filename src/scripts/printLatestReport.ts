// Prints ONLY the latest report's summary text to stdout (no log noise), so a
// cron wrapper can deliver a clean end-of-day / weekly report to Hermes.
import { prisma } from "@/lib/prisma";

async function main() {
  const type = (process.argv[2] as "daily" | "weekly") ?? "daily";
  const report = await prisma.dailyReport.findFirst({
    where: { type },
    orderBy: { createdAt: "desc" },
  });
  if (!report) {
    // Empty stdout => cron stays silent (nothing to report).
    process.exit(0);
  }
  process.stdout.write(report.summary + "\n");
  process.exit(0);
}

main().catch((e) => {
  // Write to stderr so a failure surfaces as a cron error alert, not content.
  process.stderr.write(`printLatestReport failed: ${e.message}\n`);
  process.exit(1);
});
