import { getSignals } from "@/lib/queries";
import { Card, PageHeader, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { usd, cents, shortAddr, pnlColor, timeAgo, parseJson } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const rows = await getSignals();

  return (
    <div className="space-y-6">
      <PageHeader title="Trade Signals" subtitle="New wallet trades scored for copy-worthiness" />
      <Card title="Scored signals" subtitle="Most recent 100 · decision = paper_copy / watchlist / skip">
        {rows.length ? (
          <Table>
            <thead><tr className="border-b border-edge">
              <Th>When</Th><Th>Wallet</Th><Th>Market</Th><Th>Entry</Th><Th>Current</Th><Th>Move</Th>
              <Th>Spread</Th><Th>Liquidity</Th><Th>TTR</Th><Th>Score</Th><Th>Decision</Th><Th>Reason / Risk</Th>
            </tr></thead>
            <tbody>
              {rows.map(({ d, snap }) => {
                const entry = d.observedTrade.walletEntryPrice;
                const current = snap?.yesPrice ?? d.observedTrade.detectedPrice;
                const move = current - entry;
                const reasons = parseJson<string[]>(d.reasonsJson, []);
                const risks = parseJson<string[]>(d.risksJson, []);
                return (
                  <tr key={d.id} className="border-b border-edge/50 hover:bg-base-700/40 align-top">
                    <Td className="text-xs text-ink-500 whitespace-nowrap">{timeAgo(d.createdAt)}</Td>
                    <Td><Link href={`/wallets/${d.walletAddress}`} className="text-accent hover:underline font-mono text-xs">{shortAddr(d.walletAddress)}</Link></Td>
                    <Td className="text-xs text-ink-300 max-w-[220px] truncate">{d.observedTrade.marketQuestion}</Td>
                    <Td className="tabular-nums text-ink-300">{cents(entry)}</Td>
                    <Td className="tabular-nums text-ink-300">{cents(current)}</Td>
                    <Td className={`tabular-nums ${pnlColor(move)}`}>{move >= 0 ? "+" : ""}{cents(move)}</Td>
                    <Td className="tabular-nums text-ink-500">{snap?.spread != null ? cents(snap.spread) : "—"}</Td>
                    <Td className="tabular-nums text-ink-500">{snap?.liquidity != null ? usd(snap.liquidity, 0) : "—"}</Td>
                    <Td className="tabular-nums text-ink-500">{snap?.timeToResolution != null ? `${Math.round(snap.timeToResolution)}h` : "—"}</Td>
                    <Td className="tabular-nums text-ink-100">{d.copyScore.toFixed(2)}</Td>
                    <Td><Badge kind={d.decision}>{d.decision}</Badge></Td>
                    <Td className="max-w-[240px]">
                      <div className="text-[11px] text-pos/80">{reasons[0]}</div>
                      {risks[0] && <div className="text-[11px] text-neg/80">{risks[0]}</div>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState message="No signals yet" hint="Run npm run monitor:trades && npm run score:trades" />}
      </Card>
    </div>
  );
}
