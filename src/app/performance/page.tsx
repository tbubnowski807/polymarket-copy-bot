import { getPerformance } from "@/lib/queries";
import { Card, PageHeader, Stat, Table, Th, Td, EmptyState, Badge } from "@/components/ui";
import { PnlAreaChart, CategoryBarChart, WinRateBarChart } from "@/components/charts";
import { usd, shortAddr, pnlColor } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const p = await getPerformance();
  const b = p.bench;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="Paper PnL, benchmark vs blind copy, missed winners & avoided losers" />

      {b && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Bot avg $/trade" value={<span className={pnlColor(b.botFilteredPnl)}>{usd(b.botAvgPnlPerTrade ?? 0)}</span>} sub={`${b.botCopyCount ?? 0} copies`} />
          <Stat label="Blind avg $/trade" value={usd(b.blindAvgPnlPerTrade ?? 0)} sub={`${b.blindCopyCount ?? 0} would-be copies`} />
          <Stat label="Avoided Losers" value={b.avoidedLosers} sub="good skips" />
          <Stat label="Missed Winners" value={b.missedWinners} sub="skipped would-be wins" />
        </div>
      )}

      {b && (
        <Card title="Bot-filtered vs blind leaderboard copy" subtitle="The bot's edge is efficiency: better PnL per trade by skipping late/illiquid/weak setups">
          <div className="flex items-center gap-3">
            <Badge kind={b.botBeatsBlind ? "track" : "skip"}>{b.botBeatsBlind ? "Bot WINS on efficiency" : "Bot trails blind"}</Badge>
            <span className="text-sm text-ink-500">
              Late entries avoided: {b.lateEntriesAvoided} · Spread losses avoided: {b.spreadLossesAvoided} · Bad copies: {b.badCopies}
            </span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Paper PnL over time" subtitle="Net simulated PnL, hourly buckets">
          {p.pnlSeries.length ? <PnlAreaChart data={p.pnlSeries} /> : <EmptyState message="No PnL snapshots yet" />}
        </Card>
        <Card title="Win rate by cohort">
          {p.winRateSeries.length ? <WinRateBarChart data={p.winRateSeries} /> : <EmptyState message="No resolved trades yet" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Category performance" subtitle="Paper PnL by market category">
          {p.categoryPerf.length ? <CategoryBarChart data={p.categoryPerf} /> : <EmptyState message="No category data yet" />}
        </Card>
        <Card title="Wallet performance" subtitle="Paper PnL by tracked wallet">
          {p.walletPerf.length ? (
            <Table>
              <thead><tr className="border-b border-edge"><Th>Wallet</Th><Th>Paper PnL</Th></tr></thead>
              <tbody>
                {p.walletPerf.slice(0, 12).map((w) => (
                  <tr key={w.address} className="border-b border-edge/50">
                    <Td><Link href={`/wallets/${w.address}`} className="text-accent hover:underline font-mono text-xs">{shortAddr(w.address)}</Link></Td>
                    <Td className={`tabular-nums ${pnlColor(w.pnl)}`}>{usd(w.pnl)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState message="No wallet performance yet" />}
        </Card>
      </div>
    </div>
  );
}
