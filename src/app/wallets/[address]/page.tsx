import { getWallet } from "@/lib/queries";
import { Card, PageHeader, Badge, Stat, Table, Th, Td, ScoreBar, EmptyState } from "@/components/ui";
import { usd, pct, cents, shortAddr, pnlColor, timeAgo, parseJson } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WalletProfilePage({ params }: { params: { address: string } }) {
  const data = await getWallet(params.address);
  if (!data) return notFound();
  const { wallet, observed, paperTrades, paperPnl } = data;
  const cats = parseJson<Record<string, number>>(wallet.categoryStrengthsJson, {});
  const isDemo = wallet.address.startsWith("0xDEMO");

  // Copyability verdict.
  const verdict =
    wallet.status === "track" ? "Copyable" :
    wallet.averageEntryTiming > 0.75 ? "Too late (enters late in market life)" :
    wallet.averageLiquidity < 2000 ? "Too illiquid" :
    wallet.copyabilityScore < 0.4 ? "Hard to copy" :
    wallet.bestCategory ? `Category-specific (${wallet.bestCategory})` : "Watch only";

  return (
    <div className="space-y-6">
      <PageHeader title="Wallet Profile" subtitle={wallet.label ?? "Unlabeled wallet"}>
        <div className="flex items-center gap-2">
          {isDemo && <Badge kind="demo">DEMO</Badge>}
          <Badge kind={wallet.status}>{wallet.status}</Badge>
        </div>
      </PageHeader>

      <div className="flex items-center gap-2 text-sm">
        <Link href="/wallets" className="text-accent hover:underline">← Rankings</Link>
        <span className="text-ink-700">/</span>
        <span className="font-mono text-xs text-ink-300">{wallet.address}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="ROI 30d" value={<span className={pnlColor(wallet.roi30d)}>{pct(wallet.roi30d, 1)}</span>} />
        <Stat label="Trades 30d" value={wallet.tradeCount30d} sub={`${wallet.resolvedTradeCount30d} resolved`} />
        <Stat label="Win Rate" value={pct(wallet.winRate30d)} sub="resolved markets" />
        <Stat label="Avg Trade Size" value={usd(wallet.averageTradeSize)} />
        <Stat label="Global Score" value={wallet.globalScore.toFixed(2)} />
        <Stat label="Copyability" value={wallet.copyabilityScore.toFixed(2)} />
        <Stat label="1-Hit Penalty" value={wallet.oneHitWonderPenalty > 0 ? `-${wallet.oneHitWonderPenalty.toFixed(2)}` : "0.00"} />
        <Stat label="Paper PnL (if copied)" value={<span className={pnlColor(paperPnl)}>{usd(paperPnl)}</span>} sub={`${paperTrades.length} paper trades`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Copyability verdict" subtitle="Whether the bot can realistically follow this wallet">
          <div className="space-y-3">
            <div className="text-lg font-semibold text-ink-100">{verdict}</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-ink-500">Avg liquidity</div><div className="text-ink-100">{usd(wallet.averageLiquidity, 0)}</div></div>
              <div><div className="text-xs text-ink-500">Avg spread</div><div className="text-ink-100">{cents(wallet.averageSpread)}</div></div>
              <div><div className="text-xs text-ink-500">Avg entry timing</div><div className="text-ink-100">{pct(wallet.averageEntryTiming)} into market life</div></div>
              <div><div className="text-xs text-ink-500">Consistency</div><div className="text-ink-100">{wallet.consistencyScore.toFixed(2)}</div></div>
            </div>
            {wallet.copyabilityNotes && <p className="text-xs text-ink-500 pt-2 border-t border-edge">{wallet.copyabilityNotes}</p>}
            {wallet.riskNotes && <p className="text-xs text-warn/80">{wallet.riskNotes}</p>}
            {wallet.statusReason && <p className="text-xs text-ink-500 pt-2 border-t border-edge"><span className="text-ink-300">Status reason:</span> {wallet.statusReason}</p>}
          </div>
        </Card>

        <Card title="Category strengths" subtitle="Win-rate + profit weighted, per category">
          {Object.keys(cats).length ? (
            <div className="space-y-2">
              {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                <div key={c} className="flex items-center gap-3">
                  <span className="text-xs text-ink-300 w-24">{c}</span>
                  <div className="flex-1"><ScoreBar value={v} /></div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No category data" />}
        </Card>
      </div>

      <Card title="Recent trades" subtitle="Last 20 observed trades">
        {observed.length ? (
          <Table>
            <thead><tr className="border-b border-edge">
              <Th>When</Th><Th>Market</Th><Th>Category</Th><Th>Outcome</Th><Th>Side</Th><Th>Entry</Th><Th>Size</Th>
            </tr></thead>
            <tbody>
              {observed.map((t) => (
                <tr key={t.id} className="border-b border-edge/50">
                  <Td className="text-xs text-ink-500">{timeAgo(t.timestamp)}</Td>
                  <Td className="text-xs text-ink-300 max-w-[280px] truncate">{t.marketQuestion}</Td>
                  <Td className="text-xs text-ink-500">{t.marketCategory ?? "—"}</Td>
                  <Td className="text-xs">{t.outcome}</Td>
                  <Td><Badge>{t.side}</Badge></Td>
                  <Td className="tabular-nums text-ink-300">{cents(t.walletEntryPrice)}</Td>
                  <Td className="tabular-nums text-ink-300">{usd(t.size, 0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState message="No observed trades for this wallet" />}
      </Card>
    </div>
  );
}
