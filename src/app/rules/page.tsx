import { getRules } from "@/lib/queries";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { timeAgo, parseJson } from "@/lib/format";

export const dynamic = "force-dynamic";

function Threshold({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-edge/50 last:border-0">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="text-xs text-ink-100 tabular-nums font-mono">{String(value)}</span>
    </div>
  );
}

export default async function RulesPage() {
  const { rulesets, changes, active } = await getRules();
  const rules = active ? parseJson<any>(active.rulesJson, {}) : {};

  return (
    <div className="space-y-6">
      <PageHeader title="Rules" subtitle="Active scoring thresholds and the full auto-change history">
        {active && <Badge kind="track">Active v{active.version}</Badge>}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`Active ruleset · v${active?.version ?? "—"}`} subtitle="Copyability & decision thresholds">
          {rules.copyability ? (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] text-ink-500 uppercase mb-1">Copyability</div>
                <Threshold label="Max spread" value={rules.copyability.maxSpread} />
                <Threshold label="Min liquidity" value={rules.copyability.minLiquidity} />
                <Threshold label="Max price move since entry" value={rules.copyability.maxPriceMoveSinceEntry} />
                <Threshold label="Max entry timing" value={rules.copyability.maxEntryTiming} />
              </div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase mb-1">Decision thresholds</div>
                <Threshold label="Paper-copy threshold" value={rules.tradeDecision?.paperCopyThreshold} />
                <Threshold label="Watchlist threshold" value={rules.tradeDecision?.watchlistThreshold} />
                <Threshold label="Min wallet global score" value={rules.tradeDecision?.minWalletGlobalScore} />
              </div>
              <div>
                <div className="text-[11px] text-ink-500 uppercase mb-1">One-hit-wonder</div>
                <Threshold label="Max single-trade profit share" value={rules.oneHitWonder?.maxSingleTradeProfitShare} />
                <Threshold label="Min resolved trades" value={rules.oneHitWonder?.minResolvedTrades} />
                <Threshold label="Penalty weight" value={rules.oneHitWonder?.penaltyWeight} />
              </div>
            </div>
          ) : <EmptyState message="No active ruleset" hint="Run npm run seed or npm run scan:wallets" />}
        </Card>

        <Card title="Scoring weights" subtitle="How the global wallet score is composed">
          {rules.weights ? (
            <div className="space-y-1">
              {Object.entries(rules.weights).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-xs text-ink-500 w-40 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <div className="flex-1 h-1.5 bg-base-600 rounded-full overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${(Number(v) * 100 / 0.25) * 100 / 100}%` }} />
                  </div>
                  <span className="text-xs text-ink-300 tabular-nums w-10 text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No weights" />}
        </Card>
      </div>

      <Card title="Rule change history" subtitle="Every automatic change — logged with reason, evidence, before/after, expected improvement">
        {changes.length ? (
          <div className="space-y-3">
            {changes.map((c) => {
              const before = parseJson<Record<string, unknown>>(c.beforeJson, {});
              const after = parseJson<Record<string, unknown>>(c.afterJson, {});
              return (
                <div key={c.id} className="border border-edge rounded-lg p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-ink-100">{c.reason}</div>
                    <div className="flex items-center gap-2">
                      <Badge>by {c.changedBy}</Badge>
                      <span className="text-xs text-ink-700">{timeAgo(c.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-xs text-ink-500 mt-1">{c.evidenceSummary}</div>
                  <div className="flex items-center gap-3 mt-2 text-xs font-mono">
                    <span className="text-neg/80">before: {JSON.stringify(before)}</span>
                    <span className="text-ink-700">→</span>
                    <span className="text-pos/80">after: {JSON.stringify(after)}</span>
                  </div>
                  {c.expectedImprovement && <div className="text-[11px] text-accent/80 mt-1">Expected: {c.expectedImprovement}</div>}
                </div>
              );
            })}
          </div>
        ) : <EmptyState message="No rule changes yet" hint="Rules auto-adjust as resolved outcomes accumulate — run npm run update:rules" />}
      </Card>

      <Card title="Version history">
        <div className="flex flex-wrap gap-2">
          {rulesets.map((r) => (
            <Badge key={r.id} kind={r.active ? "track" : undefined}>v{r.version}{r.active ? " (active)" : ""}</Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
