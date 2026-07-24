"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", icon: "◎" },
  { href: "/wallets", label: "Wallet Rankings", icon: "≡" },
  { href: "/signals", label: "Trade Signals", icon: "⚡" },
  { href: "/paper-trades", label: "Paper Trades", icon: "▤" },
  { href: "/journal", label: "Decision Journal", icon: "❏" },
  { href: "/performance", label: "Performance", icon: "▲" },
  { href: "/rules", label: "Rules", icon: "⚙" },
  { href: "/reports", label: "Reports", icon: "✉" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-edge bg-base-800 flex flex-col">
      <div className="p-5 border-b border-edge">
        <div className="text-sm font-semibold text-ink-100">Polymarket</div>
        <div className="text-xs text-ink-500">Copy Bot · Paper</div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-base-600 text-ink-100"
                  : "text-ink-500 hover:text-ink-100 hover:bg-base-700"
              }`}
            >
              <span className="w-4 text-center text-ink-700">{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-edge text-[10px] leading-relaxed text-ink-700">
        Operated by Hermes Agent.<br />No real trades. No keys.
      </div>
    </aside>
  );
}
