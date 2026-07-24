import { getJournal } from "@/lib/queries";
import { Card, PageHeader, Badge, EmptyState, ScoreBar } from "@/components/ui";
import { shortAddr, timeAgo, parseJson, usd } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const decisions = await getJournal();

  return (
    <div className="space-y-6">
      <PageHeader title="Decision Journal" subtitle="Every copy / watchlist / skip decision with full score breakdown, reasons, risks, and hindsight verdict" />
      {decisions.length ? (
        <div className="space-y-3">
          {decisions.map((d) => {
            const reasons = parseJson<string[]>(d.reasonsJson, []);
            const risks = parseJson<string[]>(d.risksJson, []);
            const review = d.reviews[0];
            const lessons = review ? parseJson<string[]>(review.lessonsJson, []) : [];
            const breakdown: [string, number][] = [
              ["Wallet", d.walletQualityScore], ["ROI", d.roiScore], ["Consistency", d.consistencyScore],
              ["Copyability", d.copyabilityScore], ["Category", d.categoryFitScore], ["Timing", d.entryTimingScore],
              ["Spread", d.spreadScore], ["Liquidity", d.liquidityScore], ["Thesis", d.thesisScore],
            ];
            return (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge kind={d.decision}>{d.decision}</Badge>
                      <span className="text-sm text-ink-100 tabular-nums">score {d.copyScore.toFixed(2)}</span>
                      <span className="text-xs text-ink-500">conf {d.confidence.toFixed(2)}</span>
                      {d.simulatedPositionSize > 0 && <span className="text-xs text-ink-500">· sim size {usd(d.simulatedPositionSize)}</span>}
                      {review && (
                        <Badge kind={review.wasDecisionGood ? "track" : "skip"}>
                          {review.wasDecisionGood ? "Good decision" : "Bad decision"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-ink-300 mt-1 truncate">{d.observedTrade.marketQuestion}</div>
                    <Link href={`/wallets/${d.walletAddress}`} className="text-xs text-accent hover:underline font-mono">{shortAddr(d.walletAddress)}</Link>
                  </div>
                  <span className="text-xs text-ink-700 whitespace-nowrap">{timeAgo(d.createdAt)}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                  <div className="md:col-span-1 space-y-1">
                    {breakdown.map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-500 w-20">{k}</span>
                        <div className="flex-1"><ScoreBar value={v} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    {reasons.length > 0 && (
                      <div><div className="text-[11px] text-ink-500 uppercase">Reasons</div>
                        <ul className="text-xs text-pos/80 list-disc ml-4">{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                    )}
                    {risks.length > 0 && (
                      <div><div className="text-[11px] text-ink-500 uppercase">Risks</div>
                        <ul className="text-xs text-neg/80 list-disc ml-4">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
                    )}
                    {lessons.length > 0 && (
                      <div><div className="text-[11px] text-ink-500 uppercase">What the bot learned</div>
                        <ul className="text-xs text-ink-300 list-disc ml-4">{lessons.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState message="No decisions recorded yet" hint="Run npm run score:trades" />}
    </div>
  );
}
