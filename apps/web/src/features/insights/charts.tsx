import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, moneyExact, shortDay } from '../../lib/format';
import type { CategoryPerformanceItem, RevenuePoint } from '../../types/api';

const SAGE = '#556C4D';
const SAGE_LIGHT = '#C6D3BF';
const GRID = '#E6E1D7';
const AXIS = { fontSize: 12, fill: '#6B6A64' };

const compactMoney = (n: number) => (n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);

export function RevenueChart({ points, interval }: { points: RevenuePoint[]; interval: 'day' | 'week' }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`Revenue per ${interval}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SAGE} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SAGE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDay} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis tickFormatter={compactMoney} tick={AXIS} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            formatter={(value: number, name: string) => (name === 'revenue' ? [moneyExact(value), interval === 'week' ? 'Revenue (week)' : 'Revenue'] : [value, name])}
            labelFormatter={(label: string) => (interval === 'week' ? `Week of ${shortDay(label)}` : shortDay(label))}
            contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke={SAGE} strokeWidth={2} fill="url(#revFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ items }: { items: CategoryPerformanceItem[] }) {
  const data = items.filter((i) => i.revenue > 0 || i.unitsSold > 0);
  return (
    <div className="w-full" style={{ height: Math.max(200, data.length * 40 + 30) }} role="img" aria-label="Revenue by category">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tickFormatter={compactMoney} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis type="category" dataKey="category" tick={AXIS} tickLine={false} axisLine={false} width={92} />
          <Tooltip
            cursor={{ fill: '#F1F4EF' }}
            formatter={(value: number, name: string) => (name === 'revenue' ? [money(value), 'Revenue'] : [value, name])}
            contentStyle={{ borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 }}
          />
          <Bar dataKey="revenue" fill={SAGE} radius={[0, 4, 4, 0]} barSize={20} activeBar={{ fill: SAGE_LIGHT }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
