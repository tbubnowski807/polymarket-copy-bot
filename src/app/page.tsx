import { getOverview, getScanMeta } from "@/lib/queries";
import { Card, Stat, PageHeader, Badge, DemoTag, EmptyState } from "@/components/ui";
import { PnlAreaChart } from "@/components/charts";
import { usd, pct, pnlColor, timeAgo, parseJson } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const o = await getOverview();
  const scan = await getScanMeta();
  const isDemo = scan ? parseJson<{ demo?: boolean }>(scan.rawSummaryJson, {}).demo === true : false;

  const answers = [
    { q: "Are we profitable on paper?", a: o.totalPnl >= 0 ? "Yes" : "Not yet",
      detail: `${usd(o.totalPnl)} total · ${pct(o.winRate)} win rate`, ok: o.totalPnl >= 0 },
    { q: "Which wallets are worth copying?", a: `${o.trackedWallets} tracked`,
      detail: `${o.copyCandidatesToday} copy candidate(s) today`, ok: o.trackedWallets > 0 },
    { q: "What did the bot learn today?", a: o.latestRuleChanges.length ? `${o.latestRuleChanges.length} rule change(s)` : "No changes",
      detail: o.latestRuleChanges[0]?.reason ?? "Rules stable — no evidence to adjust", ok: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="Hermes-operated Polymarket copy-trading research — paper trading only">
        {isDemo && <DemoTag />}
      </PageHeader>

      {/* The three questions the dashboard must answer immediately. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {answers.map((a) => (
          <div key={a.q} className="rounded-xl border border-edge bg-base-800 p-4">
            <div className="text-xs text-ink-500">{a.q}</div>
            <div className={`text-xl font-semibold mt-2 ${a.ok ? "text-ink-100" : "text-warn"}`}>{a.a}</div>
            <div className="text-xs text-ink-500 mt-1">{a.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Paper PnL" value={<span className={pnlColor(o.totalPnl)}>{usd(o.totalPnl)}</span>} sub={<>realized {usd(o.realizedPnl)} · unrealized {usd(o.unrealizedPnl)}</>} />
        <Stat label="Win Rate" value={pct(o.winRate)} sub={`${o.closedCount} closed trades`} />
        <Stat label="Open Positions" value={o.openPositions} sub="simulated, live" />
        <Stat label="Tracked Wallets" value={o.trackedWallets} sub="status = track" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Paper PnL over time" subtitle="Net simulated PnL, hourly buckets" className="lg:col-span-2">
          {o.pnlSeries.length ? <PnlAreaChart data={o.pnlSeries} /> : <EmptyState message="No PnL snapshots yet" hint="Run npm run paper:update-pnl" />}
        </Card>

        <div className="space-y-4">
          <Card title="End-of-day report">
            {o.latestReport ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-300">{o.latestReport.date}</span>
                  <Badge kind={o.latestReport.sentToTelegram ? "track" : "watch"}>
                    {o.latestReport.sentToTelegram ? "Sent to Telegram" : "Generated (not sent)"}
                  </Badge>
                </div>
                <div className="text-xs text-ink-500">
                  {o.latestReport.copiedSignals} copied · {o.latestReport.watchedSignals} watched · {o.latestReport.skippedSignals} skipped
                </div>
                <Link href="/reports" className="text-xs text-accent hover:underline">View reports →</Link>
              </div>
            ) : <EmptyState message="No report yet" hint="Run npm run report:daily" />}
          </Card>

          <Card title="Copy candidates today">
            <div className="text-3xl font-semibold text-ink-100 tabular-nums">{o.copyCandidatesToday}</div>
            <Link href="/signals" className="text-xs text-accent hover:underline">View signals →</Link>
          </Card>
        </div>
      </div>

      <Card title="Latest rule changes" subtitle="What the bot learned — full history on the Rules page"
        right={<Link href="/rules" className="text-xs text-accent hover:underline">All rules →</Link>}>
        {o.latestRuleChanges.length ? (
          <div className="space-y-2">
            {o.latestRuleChanges.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-4 py-2 border-b border-edge last:border-0">
                <div>
                  <div className="text-sm text-ink-100">{c.reason}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{c.evidenceSummary}</div>
                </div>
                <span className="text-xs text-ink-700 whitespace-nowrap">{timeAgo(c.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : <EmptyState message="No automatic rule changes yet" hint="Rules adjust once enough resolved outcomes accumulate" />}
      </Card>
    </div>
  );
}
