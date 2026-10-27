import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, PriorityBadge, SlowBadge, TrendBadge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/states';
import { formatDate, money, number, percent } from '../../lib/format';
import type { RestockItem, SlowMovingItem, TopProduct, TrendItem } from '../../types/api';

export function TopProductsTable({ items, sortBy }: { items: TopProduct[]; sortBy: 'units' | 'revenue' }) {
  if (items.length === 0) {
    return <EmptyState title="No sales in this period" description="Best sellers appear once sales are recorded." />;
  }
  const max = Math.max(...items.map((i) => (sortBy === 'units' ? i.unitsSold : i.revenue)), 1);
  return (
    <ol className="divide-y divide-line">
      {items.map((p, idx) => {
        const value = sortBy === 'units' ? p.unitsSold : p.revenue;
        return (
          <li key={p.productId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="w-5 text-sm tabular-nums text-muted">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <Link to={`/products/${p.productId}`} className="block truncate text-sm font-medium hover:underline">
                {p.productName}
              </Link>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sage-100" aria-hidden>
                <div className="h-full rounded-full bg-sage-500" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </div>
            <div className="text-right text-sm tabular-nums">
              <p className="font-medium">{number(p.unitsSold)} units</p>
              <p className="text-xs text-muted">{money(p.revenue)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SlowMovingTable({ items, compact }: { items: SlowMovingItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} title="Nothing is moving slowly" description="Every product with stock has recent sales, or is too new to judge." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">Slow-moving products</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col">Reason</th>
            <th scope="col" className="text-right">Stock</th>
            {!compact && <th scope="col" className="text-right">Units / period</th>}
            {!compact && <th scope="col">Last sale</th>}
            <th scope="col" className="text-right">Stock value</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.productId}>
              <td>
                <Link to={`/products/${p.productId}`} className="font-medium hover:underline">
                  {p.productName}
                </Link>
                <p className="text-xs text-muted">{p.category}</p>
              </td>
              <td>
                <SlowBadge status={p.status} />
              </td>
              <td className="text-right tabular-nums">{p.totalStock}</td>
              {!compact && <td className="text-right tabular-nums">{p.unitsInPeriod}</td>}
              {!compact && <td className="whitespace-nowrap text-muted">{p.lastSoldAt ? `${formatDate(p.lastSoldAt)} (${p.daysSinceLastSale}d ago)` : 'Never sold'}</td>}
              <td className="text-right tabular-nums">{money(p.stockValueAtCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RestockTable({ items, compact }: { items: RestockItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <EmptyState icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} title="No restocking needed" description="All variants are above their reorder level with healthy stock cover." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">Restocking recommendations</caption>
        <thead>
          <tr>
            <th scope="col">Variant</th>
            <th scope="col">Priority</th>
            <th scope="col" className="text-right">Stock</th>
            {!compact && <th scope="col" className="text-right">Sold / day</th>}
            <th scope="col" className="text-right">Cover</th>
            <th scope="col" className="text-right">Suggested order</th>
            {!compact && <th scope="col" className="text-right">Est. cost</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.variantId}>
              <td>
                <Link to={`/products/${r.productId}`} className="font-medium hover:underline">
                  {r.productName}
                </Link>
                <p className="text-xs text-muted">
                  {r.size} / {r.color}
                </p>
                {!compact && (
                  <details className="mt-1 text-xs text-muted">
                    <summary className="cursor-pointer text-sage-700">How is this calculated?</summary>
                    <p className="mt-1 max-w-sm">
                      {r.explanation}
                      {r.dataStatus !== 'ok' && <span className="mt-1 block font-medium text-amber-700">{r.dataStatus === 'no_recent_sales' ? 'No recent sales: heuristic based on the reorder level only.' : 'Limited sales history: treat as a rough estimate.'}</span>}
                    </p>
                  </details>
                )}
              </td>
              <td>
                <PriorityBadge priority={r.priority} />
              </td>
              <td className="text-right tabular-nums">
                {r.currentStock} <span className="text-xs text-muted">/ {r.reorderThreshold}</span>
              </td>
              {!compact && <td className="text-right tabular-nums">{r.avgDailyUnits}</td>}
              <td className="text-right tabular-nums">{r.coverDays === null ? '—' : `${r.coverDays}d`}</td>
              <td className="text-right font-medium tabular-nums">+{r.suggestedQuantity}</td>
              {!compact && <td className="text-right tabular-nums">{money(r.estimatedCostToReorder)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMPONENT_META = [
  { key: 'velocity', label: 'Sales velocity', weight: '60%' },
  { key: 'growth', label: 'Sales growth', weight: '25%' },
  { key: 'urgency', label: 'Stock urgency', weight: '15%' },
] as const;

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sage-100" aria-hidden>
      <div className="h-full rounded-full bg-sage-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function TrendScoreTable({ items }: { items: TrendItem[] }) {
  if (items.length === 0) return <EmptyState title="No products to score" description="Add products and record sales to see trend scores." />;
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">Trend scores</caption>
        <thead>
          <tr>
            <th scope="col">Product</th>
            <th scope="col" className="w-24 text-right">Score</th>
            <th scope="col">Signal</th>
            <th scope="col" className="min-w-[16rem]">Components (0–100)</th>
            <th scope="col" className="text-right">Units (recent / prior)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.productId}>
              <td>
                <Link to={`/products/${t.productId}`} className="font-medium hover:underline">
                  {t.productName}
                </Link>
                <p className="text-xs text-muted">{t.category}</p>
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer text-sage-700">Why this score?</summary>
                  <p className="mt-1 max-w-sm">{t.explanation}</p>
                </details>
              </td>
              <td className="text-right font-display text-xl font-semibold tabular-nums">{t.score}</td>
              <td>
                <div className="flex flex-col items-start gap-1">
                  <TrendBadge label={t.label} />
                  {t.dataStatus === 'insufficient_history' && <Badge tone="warn">Limited history</Badge>}
                  {t.dataStatus === 'no_sales' && <Badge>No sales yet</Badge>}
                </div>
              </td>
              <td>
                <ul className="space-y-1.5">
                  {COMPONENT_META.map((c) => (
                    <li key={c.key} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs">
                      <span className="text-muted">
                        {c.label} <span className="text-[10px]">({c.weight})</span>
                      </span>
                      <ScoreBar value={t.components[c.key]} />
                      <span className="text-right tabular-nums">{t.components[c.key]}</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="text-right tabular-nums">
                {t.recentUnits} / {t.previousUnits}
                {t.growthPercent !== null && <p className="text-xs text-muted">{percent(t.growthPercent)}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
