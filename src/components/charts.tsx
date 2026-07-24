"use client";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

const AXIS = { stroke: "#5b6273", fontSize: 11 };
const GRID = "#20242e";

export function PnlAreaChart({ data }: { data: { t: string; pnl: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#39d98a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#39d98a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "#111318", border: "1px solid #2a2f3a", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#8b93a7" }}
          formatter={(v: number) => [`$${Number(v).toFixed(2)}`, "PnL"]}
        />
        <ReferenceLine y={0} stroke="#5b6273" strokeDasharray="3 3" />
        <Area type="monotone" dataKey="pnl" stroke="#39d98a" strokeWidth={2} fill="url(#pnlFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CompareLineChart({ data }: { data: { t: string; bot: number; blind: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "#111318", border: "1px solid #2a2f3a", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number, n: string) => [`$${Number(v).toFixed(2)}`, n === "bot" ? "Bot-filtered" : "Blind copy"]}
        />
        <Line type="monotone" dataKey="bot" stroke="#39d98a" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="blind" stroke="#f0b429" strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "#111318", border: "1px solid #2a2f3a", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`$${Number(v).toFixed(2)}`, "PnL"]}
          cursor={{ fill: "#20242e55" }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Bar key={i} dataKey="value" fill={d.value >= 0 ? "#39d98a" : "#f6465d"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WinRateBarChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
        <Tooltip
          contentStyle={{ background: "#111318", border: "1px solid #2a2f3a", borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [`${Number(v).toFixed(0)}%`, "Win rate"]}
          cursor={{ fill: "#20242e55" }}
        />
        <Bar dataKey="value" fill="#5b8cff" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
