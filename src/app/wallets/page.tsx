import { getWallets, getScanMeta } from "@/lib/queries";
import { Card, PageHeader, Badge, DemoTag, Table, Th, Td, ScoreBar, EmptyState } from "@/components/ui";
import { pct, shortAddr, parseJson, pnlColor } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WalletsPage() {
  const wallets = await getWallets();
  const scan = await getScanMeta();
  const isDemo = scan ? parseJson<{ demo?: boolean }>(scan.rawSummaryJson, {}).demo === true : false;

  return (
    <div className="space-y-6">
      <PageHeader title="Wallet Rankings" subtitle={`Top leaderboard scan · ${wallets.length} wallets profiled`}>
        {isDemo && <DemoTag />}
      </PageHeader>

      <Card title="Global ranking" subtitle="Ranked by global score (ROI, consistency, copyability, category edge, one-hit-wonder penalty)">
        {wallets.length ? (
          <Table>
            <thead>
              <tr className="border-b border-edge">
                <Th>#</Th><Th>Wallet</Th><Th>Label</Th><Th>ROI 30d</Th>
                <Th>Consistency</Th><Th>Copyability</Th><Th>1-hit penalty</Th>
                <Th>Best category</Th><Th>Global</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w, i) => (
                <tr key={w.address} className="border-b border-edge/50 hover:bg-base-700/40">
                  <Td className="text-ink-500 tabular-nums">{i + 1}</Td>
                  <Td>
                    <Link href={`/wallets/${w.address}`} className="text-accent hover:underline font-mono text-xs">
                      {shortAddr(w.address)}
                    </Link>
                  </Td>
                  <Td className="text-ink-300 text-xs">{w.label ?? "—"}</Td>
                  <Td className={`tabular-nums ${pnlColor(w.roi30d)}`}>{pct(w.roi30d, 1)}</Td>
                  <Td className="w-28"><ScoreBar value={w.consistencyScore} /></Td>
                  <Td className="w-28"><ScoreBar value={w.copyabilityScore} /></Td>
                  <Td className="tabular-nums text-ink-300">{w.oneHitWonderPenalty > 0 ? `-${w.oneHitWonderPenalty.toFixed(2)}` : "—"}</Td>
                  <Td className="text-xs text-ink-300">{w.bestCategory ?? "—"}</Td>
                  <Td className="w-28"><ScoreBar value={w.globalScore} /></Td>
                  <Td><Badge kind={w.status}>{w.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState message="No wallets scanned yet" hint="Run npm run scan:leaderboard && npm run scan:wallets" />}
      </Card>
      <p className="text-xs text-ink-700">Click any wallet to see its full profile, reason for status, and paper performance.</p>
    </div>
  );
}
