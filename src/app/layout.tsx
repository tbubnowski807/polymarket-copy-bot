import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { SafetyBanner } from "@/components/SafetyBanner";

export const metadata: Metadata = {
  title: "Polymarket Copy Bot — Paper Trading Research",
  description: "Hermes-operated Polymarket copy-trading research. Paper trading only. No real trades.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base-900 text-ink-100 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <SafetyBanner />
            <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
