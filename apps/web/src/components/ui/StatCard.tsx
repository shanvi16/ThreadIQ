import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Card } from './Card';
import { Skeleton } from './states';

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'warn' | 'bad';
  loading?: boolean;
}

const toneClass = { default: 'text-ink', warn: 'text-amber-700', bad: 'text-clay-700' };

export function StatCard({ label, value, hint, icon, tone = 'default', loading }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="text-sage-600">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className={cn('mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-3xl', toneClass[tone])}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
