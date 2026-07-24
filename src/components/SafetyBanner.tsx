export function SafetyBanner() {
  return (
    <div className="w-full bg-warn/10 border-b border-warn/30 px-6 py-1.5 text-[11px] text-warn flex items-center gap-2">
      <span className="font-semibold">PAPER TRADING ONLY</span>
      <span className="text-warn/70">
        · Simulated positions only · No real trades, no signing, no keys, no money spent · Not financial advice
      </span>
    </div>
  );
}
