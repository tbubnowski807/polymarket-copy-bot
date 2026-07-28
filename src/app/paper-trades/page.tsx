import { getPaperTrades } from "@/lib/queries";
import { Card, PageHeader, Badge, Table, Th, Td, EmptyState, Stat } from "@/components/ui";
import { usd, cents, shortAddr, pnlColor, timeAgo, parseJson } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

function holdingTime(openedAt: Date, closedAt: Date | null): string {
  if (!closedAt) return "—";
  const mins = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
}

export default async function PaperTradesPage() {
  const { openTrades, closedTrades, totals } = await getPaperTrades();

  return (
    <div className="space-y-6">
      <PageHeader title="Paper Trades" subtitle="Simulated positions only — $5–$20 each. No real orders." />

      {/* Realized vs unrealized split — the two numbers now clearly separated. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Realized PnL (closed)"
          value={<span className={pnlColor(totals.realizedPnl)}>{usd(totals.realizedPnl)}</span>}
          sub={`${totals.closedCount} closed trades`}
        />
        <Stat
          label="Unrealized PnL (open)"
          value={<span className={pnlColor(totals.unrealizedPnl)}>{usd(totals.unrealizedPnl)}</span>}
          sub={`${totals.openCount} open positions`}
        />
        <Stat
          label="Total (real + on-paper)"
          value={<span className={pnlColor(totals.totalPnl)}>{usd(totals.totalPnl)}</span>}
        />
        <Stat
          label="Win Rate (closed only)"
          value={totals.closedCount ? `${Math.round(totals.winRate * 100)}%` : "—"}
          sub={`${totals.wins}/${totals.closedCount} winners`}
        />
      </div>

      <p className="text-xs text-ink-500">
        <span className="text-ink-300">Realized</span> = locked-in results from finished trades. {" "}
        <span className="text-ink-300">Unrealized</span> = paper-only swings on positions still open — these can still change.
        Win rate is measured on <span className="text-ink-300">closed trades only</span>.
      </p>

      {/* ACTIVE POSITIONS — the simple "what am I in right now" list. */}
      <Card title="Active positions" subtitle={`${openTrades.length} open — the trades you're currently in`}>
        {openTrades.length ? (
          <Table>
            <thead><tr className="border-b border-edge">
              <Th>Opened</Th><Th>Wallet</Th><Th>Market</Th><Th>Outcome</Th><Th>Size</Th>
              <Th>Entry</Th><Th>Now</Th><Th>Unrealized</Th><Th>Slippage</Th>
            </tr></thead>
            <tbody>
              {openTrades.map((t) => (
                <tr key={t.id} className="border-b border-edge/50 hover:bg-base-700/40">
                  <Td className="text-xs text-ink-500 whitespace-nowrap">{timeAgo(t.openedAt)}</Td>
                  <Td><Link href={`/wallets/${t.walletAddress}`} className="text-accent hover:underline font-mono text-xs">{shortAddr(t.walletAddress)}</Link></Td>
                  <Td className="text-xs text-ink-300 max-w-[240px] truncate">{t.decision?.observedTrade?.marketQuestion ?? t.marketId}</Td>
                  <Td className="text-xs">{t.outcome}</Td>
                  <Td className="tabular-nums text-ink-300">{usd(t.simulatedPositionSize)}</Td>
                  <Td className="tabular-nums text-ink-300">{cents(t.entryPrice)}</Td>
                  <Td className="tabular-nums text-ink-300">{cents(t.currentPrice)}</Td>
                  <Td className={`tabular-nums ${pnlColor(t.unrealizedPnl)}`}>{usd(t.unrealizedPnl)}</Td>
                  <Td className={`tabular-nums text-xs ${t.slippage != null && t.slippage > 0 ? "text-neg" : "text-ink-500"}`}>
                    {t.slippage != null ? `${t.slippage > 0 ? "+" : ""}${(t.slippage * 100).toFixed(1)}¢` : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState message="No open positions right now" hint="New copies appear here as tracked wallets place fresh BUYs" />}
      </Card>

      {/* CLOSED TRADE LOG — entry/exit/reason/holding time/wallet. */}
      <Card title="Closed trade log" subtitle={`${totals.closedCount} finished — resolved or sold early`}>
        {closedTrades.length ? (
          <Table>
            <thead><tr className="border-b border-edge">
              <Th>Closed</Th><Th>Wallet</Th><Th>Market</Th><Th>Outcome</Th><Th>Size</Th>
              <Th>Entry</Th><Th>Exit</Th><Th>Reason</Th><Th>Held</Th><Th>Slippage</Th><Th>Realized</Th>
            </tr></thead>
            <tbody>
              {closedTrades.map((t) => (
                <tr key={t.id} className="border-b border-edge/50 hover:bg-base-700/40">
                  <Td className="text-xs text-ink-500 whitespace-nowrap">{timeAgo(t.closedAt ?? t.resolvedAt)}</Td>
                  <Td><Link href={`/wallets/${t.walletAddress}`} className="text-accent hover:underline font-mono text-xs">{shortAddr(t.walletAddress)}</Link></Td>
                  <Td className="text-xs text-ink-300 max-w-[220px] truncate">{t.decision?.observedTrade?.marketQuestion ?? t.marketId}</Td>
                  <Td className="text-xs">{t.outcome}</Td>
                  <Td className="tabular-nums text-ink-300">{usd(t.simulatedPositionSize)}</Td>
                  <Td className="tabular-nums text-ink-300">{cents(t.entryPrice)}</Td>
                  <Td className="tabular-nums text-ink-300">{t.exitPrice != null ? cents(t.exitPrice) : "—"}</Td>
                  <Td>
                    <Badge kind={t.exitReason === "resolved" ? "resolved" : "closed"}>
                      {t.exitReason === "resolved" ? "resolved" : t.exitReason === "sold_early" ? "sold early" : "closed"}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-ink-500">{holdingTime(t.openedAt, t.closedAt ?? t.resolvedAt)}</Td>
                  <Td className={`tabular-nums text-xs ${t.slippage != null && t.slippage > 0 ? "text-neg" : "text-ink-500"}`}>
                    {t.slippage != null ? `${t.slippage > 0 ? "+" : ""}${(t.slippage * 100).toFixed(1)}¢` : "—"}
                  </Td>
                  <Td className={`tabular-nums ${pnlColor(t.realizedPnl)}`}>{usd(t.realizedPnl)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState message="No closed trades yet" hint="Positions show here once resolved or sold early" />}
      </Card>
    </div>
  );
}
