import { getReports } from "@/lib/queries";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { usd, pct, shortAddr, parseJson } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await getReports();

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="End-of-day and weekly summaries Hermes generates and sends to Telegram" />
      {reports.length ? (
        <div className="space-y-4">
          {reports.map((r) => {
            const best = parseJson<{ address: string; pnl: number }[]>(r.bestWalletsJson, []);
            const worst = parseJson<{ address: string; pnl: number }[]>(r.worstWalletsJson, []);
            const ruleChanges = parseJson<{ reason: string; expected?: string }[]>(r.ruleChangesJson, []);
            return (
              <Card key={r.id} title={`${r.type === "weekly" ? "Weekly" : "End-of-Day"} · ${r.date}`}
                right={<Badge kind={r.sentToTelegram ? "track" : "watch"}>{r.sentToTelegram ? "Sent to Telegram" : "Generated"}</Badge>}>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  <Metric label="Paper PnL" value={usd(r.paperPnl)} />
                  <Metric label="Win Rate" value={pct(r.winRate)} />
                  <Metric label="Open" value={String(r.openPositions)} />
                  <Metric label="Signals" value={`${r.copiedSignals}/${r.watchedSignals}/${r.skippedSignals}`} sub="copy/watch/skip" />
                  <Metric label="New Signals" value={String(r.newSignals)} />
                </div>

                <pre className="text-xs text-ink-300 whitespace-pre-wrap bg-base-900 rounded-lg p-3 border border-edge">{r.summary}</pre>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-[11px] text-ink-500 uppercase mb-1">Best wallets today</div>
                    {best.length ? best.map((w) => (
                      <div key={w.address} className="flex justify-between text-xs py-0.5">
                        <span className="font-mono text-ink-300">{shortAddr(w.address)}</span>
                        <span className="text-pos tabular-nums">{usd(w.pnl)}</span>
                      </div>
                    )) : <span className="text-xs text-ink-700">—</span>}
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-500 uppercase mb-1">Worst wallets today</div>
                    {worst.length ? worst.map((w) => (
                      <div key={w.address} className="flex justify-between text-xs py-0.5">
                        <span className="font-mono text-ink-300">{shortAddr(w.address)}</span>
                        <span className="text-neg tabular-nums">{usd(w.pnl)}</span>
                      </div>
                    )) : <span className="text-xs text-ink-700">—</span>}
                  </div>
                </div>

                {ruleChanges.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] text-ink-500 uppercase mb-1">Rule changes</div>
                    <ul className="text-xs text-ink-300 list-disc ml-4">
                      {ruleChanges.map((c, i) => <li key={i}>{c.reason}{c.expected ? ` — ${c.expected}` : ""}</li>)}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : <EmptyState message="No reports yet" hint="Run npm run report:daily" />}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-500 uppercase">{label}</div>
      <div className="text-sm text-ink-100 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-ink-700">{sub}</div>}
    </div>
  );
}
