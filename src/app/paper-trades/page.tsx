import { getPaperTrades } from "@/lib/queries";
import { Card, PageHeader, Badge, Table, Th, Td, EmptyState, Stat } from "@/components/ui";
import { usd, cents, shortAddr, pnlColor, timeAgo, parseJson } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PaperTradesPage() {
  const trades = await getPaperTrades();
  const totalPnl = trades.reduce((a, t) => a + t.realizedPnl + t.unrealizedPnl, 0);
  const open = trades.filter((t) => t.status === "open").length;
  const resolved = trades.filter((t) => t.status === "resolved");
  const wins = resolved.filter((t) => t.realizedPnl > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Paper Trades" subtitle="Simulated positions only — $5–$20 each. No real orders." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Paper PnL" value={<span className={pnlColor(totalPnl)}>{usd(totalPnl)}</span>} />
        <Stat label="Open" value={open} />
        <Stat label="Resolved" value={resolved.length} />
        <Stat label="Win Rate" value={resolved.length ? `${Math.round((wins / resolved.length) * 100)}%` : "—"} />
      </div>

      <Card title="Simulated trades" subtitle="Linked to the decision that created them">
        {trades.length ? (
          <Table>
            <thead><tr className="border-b border-edge">
              <Th>Opened</Th><Th>Wallet</Th><Th>Market</Th><Th>Outcome</Th><Th>Size</Th>
              <Th>Entry</Th><Th>Current</Th><Th>Unrealized</Th><Th>Realized</Th><Th>Status</Th><Th>Reason</Th>
            </tr></thead>
            <tbody>
              {trades.map((t) => {
                const reasons = parseJson<string[]>(t.decision.reasonsJson, []);
                return (
                  <tr key={t.id} className="border-b border-edge/50 hover:bg-base-700/40 align-top">
                    <Td className="text-xs text-ink-500 whitespace-nowrap">{timeAgo(t.openedAt)}</Td>
                    <Td><Link href={`/wallets/${t.walletAddress}`} className="text-accent hover:underline font-mono text-xs">{shortAddr(t.walletAddress)}</Link></Td>
                    <Td className="text-xs text-ink-300 max-w-[180px] truncate font-mono">{t.marketId}</Td>
                    <Td className="text-xs">{t.outcome}</Td>
                    <Td className="tabular-nums text-ink-300">{usd(t.simulatedPositionSize)}</Td>
                    <Td className="tabular-nums text-ink-300">{cents(t.entryPrice)}</Td>
                    <Td className="tabular-nums text-ink-300">{cents(t.currentPrice)}</Td>
                    <Td className={`tabular-nums ${pnlColor(t.unrealizedPnl)}`}>{t.status === "resolved" ? "—" : usd(t.unrealizedPnl)}</Td>
                    <Td className={`tabular-nums ${pnlColor(t.realizedPnl)}`}>{t.status === "resolved" ? usd(t.realizedPnl) : "—"}</Td>
                    <Td><Badge kind={t.status}>{t.status}</Badge></Td>
                    <Td className="text-[11px] text-ink-500 max-w-[200px]">{reasons[0] ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState message="No paper trades yet" hint="Run npm run score:trades to create copies from strong signals" />}
      </Card>
    </div>
  );
}
