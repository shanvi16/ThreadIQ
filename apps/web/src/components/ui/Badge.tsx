import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { MovementType, ProductStatus, RestockPriority, SlowStatus, StockLevel, TrendLabel } from '../../types/api';

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-paper text-ink-soft ring-line-strong',
  good: 'bg-sage-100 text-sage-800 ring-sage-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-100',
  bad: 'bg-clay-50 text-clay-700 ring-clay-100',
  info: 'bg-white text-sage-700 ring-sage-300',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

export const StockBadge = ({ level }: { level: StockLevel | 'low' | 'out' }) =>
  level === 'out' ? <Badge tone="bad">Out of stock</Badge> : level === 'low' ? <Badge tone="warn">Low stock</Badge> : <Badge tone="good">In stock</Badge>;

export const StatusBadge = ({ status }: { status: ProductStatus }) =>
  status === 'active' ? <Badge tone="good">Active</Badge> : <Badge>Archived</Badge>;

const movementTone: Record<MovementType, Tone> = { receipt: 'good', adjustment: 'info', sale: 'neutral', return: 'warn' };
export const MovementBadge = ({ type }: { type: MovementType }) => (
  <Badge tone={movementTone[type]}>{type.charAt(0).toUpperCase() + type.slice(1)}</Badge>
);

const priorityTone: Record<RestockPriority, Tone> = { critical: 'bad', high: 'warn', medium: 'info' };
export const PriorityBadge = ({ priority }: { priority: RestockPriority }) => (
  <Badge tone={priorityTone[priority]}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>
);

const trendTone: Record<TrendLabel, Tone> = { hot: 'bad', rising: 'good', steady: 'info', cooling: 'neutral', inactive: 'neutral' };
export const TrendBadge = ({ label }: { label: TrendLabel }) => (
  <Badge tone={trendTone[label]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Badge>
);

const slowText: Record<SlowStatus, string> = {
  no_sales_history: 'No sales history',
  no_recent_sales: 'No recent sales',
  low_velocity: 'Low velocity',
};
export const SlowBadge = ({ status }: { status: SlowStatus }) => (
  <Badge tone={status === 'low_velocity' ? 'warn' : 'bad'}>{slowText[status]}</Badge>
);
