import { cn } from '../lib/cn';
import { formatDate } from '../lib/format';
import { RANGE_PRESETS } from '../lib/dateRange';

interface Props {
  days: number;
  onChange: (days: number) => void;
}

export function RangePicker({ days, onChange }: Props) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          aria-pressed={days === p.days}
          onClick={() => onChange(p.days)}
          className={cn('rounded-md px-3 py-1.5 font-medium', days === p.days ? 'bg-sage-700 text-white' : 'text-ink-soft hover:bg-sage-50')}
        >
          Last {p.label}
        </button>
      ))}
    </div>
  );
}

/** "Period: 27 Sep 2026 – 26 Oct 2026 (UTC)" */
export function PeriodLabel({ from, to }: { from: string; to: string }) {
  return (
    <span>
      Period: <strong className="font-medium text-ink-soft">{formatDate(`${from}T00:00:00Z`)}</strong> – <strong className="font-medium text-ink-soft">{formatDate(`${to}T00:00:00Z`)}</strong> (UTC days)
    </span>
  );
}
