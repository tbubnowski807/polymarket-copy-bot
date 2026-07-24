// Small formatting helpers shared across the dashboard.

export function usd(n: number | null | undefined, digits = 2): string {
  const v = n ?? 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function pct(n: number | null | undefined, digits = 0): string {
  return `${((n ?? 0) * 100).toFixed(digits)}%`;
}

export function cents(n: number | null | undefined): string {
  return `${((n ?? 0) * 100).toFixed(1)}¢`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function pnlColor(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v > 0.0001) return "text-pos";
  if (v < -0.0001) return "text-neg";
  return "text-ink-500";
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - t.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
