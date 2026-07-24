import { pnlColor } from "@/lib/format";

export function Card({ title, subtitle, children, className = "", right }: {
  title?: string; subtitle?: string; children: React.ReactNode; className?: string; right?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-edge bg-base-800 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
          <div>
            {title && <div className="text-sm font-medium text-ink-100">{title}</div>}
            {subtitle && <div className="text-xs text-ink-500 mt-0.5">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "default" }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode;
  tone?: "default" | "pnl";
}) {
  const valueClass =
    tone === "pnl" && typeof value === "number" ? pnlColor(value) : "text-ink-100";
  return (
    <div className="rounded-xl border border-edge bg-base-800 p-4">
      <div className="text-xs text-ink-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 tabular-nums ${valueClass}`}>{value}</div>
      {sub != null && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: {
  title: string; subtitle?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-100">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  track: "bg-pos/15 text-pos border-pos/30",
  watch: "bg-warn/15 text-warn border-warn/30",
  ignore: "bg-ink-700/20 text-ink-500 border-ink-700/40",
  paper_copy: "bg-pos/15 text-pos border-pos/30",
  watchlist: "bg-warn/15 text-warn border-warn/30",
  skip: "bg-ink-700/20 text-ink-500 border-ink-700/40",
  open: "bg-accent/15 text-accent border-accent/30",
  closed: "bg-ink-700/20 text-ink-500 border-ink-700/40",
  resolved: "bg-pos/15 text-pos border-pos/30",
  demo: "bg-warn/15 text-warn border-warn/30",
};

export function Badge({ children, kind }: { children: React.ReactNode; kind?: string }) {
  const style = (kind && STATUS_STYLES[kind]) || "bg-base-600 text-ink-300 border-edge";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] border ${style}`}>
      {children}
    </span>
  );
}

export function DemoTag() {
  return <Badge kind="demo">DEMO</Badge>;
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-sm text-ink-300">{message}</div>
      {hint && <div className="text-xs text-ink-500 mt-2">{hint}</div>}
    </div>
  );
}

export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const pctv = Math.max(0, Math.min(100, value * 100));
  const color = value >= 0.6 ? "bg-pos" : value >= 0.4 ? "bg-warn" : "bg-neg";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-base-600 overflow-hidden min-w-[40px]">
        <div className={`h-full ${color}`} style={{ width: `${pctv}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-300 w-8 text-right">{value.toFixed(2)}</span>
      {label && <span className="text-xs text-ink-500">{label}</span>}
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium text-ink-500 px-3 py-2 ${className}`}>{children}</th>;
}
export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
