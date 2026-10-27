import { Info } from 'lucide-react';
import { useState } from 'react';
import { PeriodLabel, RangePicker } from '../../components/RangePicker';
import { Badge } from '../../components/ui/Badge';
import { Section } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryBoundary, Skeleton } from '../../components/ui/states';
import { StatCard } from '../../components/ui/StatCard';
import { cn } from '../../lib/cn';
import { useDateRange } from '../../lib/dateRange';
import { money, moneyExact, number } from '../../lib/format';
import type { RestockPriority, SlowStatus } from '../../types/api';
import { useCategoryPerformance, useOverview, useRestock, useRevenueTrend, useSlowMoving, useTopProducts, useTrendScores } from './api';
import { CategoryChart, RevenueChart } from './charts';
import { RestockTable, SlowMovingTable, TopProductsTable, TrendScoreTable } from './tables';

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line-strong p-0.5 text-xs">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={cn('rounded-md px-2.5 py-1 font-medium', value === o.value ? 'bg-sage-700 text-white' : 'text-ink-soft hover:bg-sage-50')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const { days, setDays, from, to } = useDateRange(30);
  const range = { from, to };
  const [interval, setInterval] = useState<'day' | 'week'>('day');
  const [topSort, setTopSort] = useState<'units' | 'revenue'>('units');
  const [slowStatus, setSlowStatus] = useState<SlowStatus | ''>('');
  const [priority, setPriority] = useState<RestockPriority | ''>('');

  const overview = useOverview(range);
  const trend = useRevenueTrend(range, interval);
  const categories = useCategoryPerformance(range);
  const top = useTopProducts(range, topSort, 10);
  const scores = useTrendScores(50);
  const slow = useSlowMoving(50, slowStatus || undefined);
  const restock = useRestock(100, priority || undefined);

  const o = overview.data;
  const noSales = trend.data ? trend.data.points.every((p) => p.revenue === 0) : false;

  return (
    <>
      <PageHeader
        title="Analytics & trends"
        description={<PeriodLabel from={from} to={to} />}
        actions={<RangePicker days={days} onChange={setDays} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Revenue" value={money(o?.revenue ?? 0)} hint="Gross sales − discounts" loading={overview.isLoading} />
        <StatCard label="Gross sales" value={money(o?.grossSales ?? 0)} loading={overview.isLoading} />
        <StatCard label="Discounts" value={money(o?.discounts ?? 0)} loading={overview.isLoading} />
        <StatCard label="Orders" value={number(o?.salesCount ?? 0)} hint={`${number(o?.unitsSold ?? 0)} units sold`} loading={overview.isLoading} />
        <StatCard label="Avg. order value" value={moneyExact(o?.averageOrderValue ?? 0)} loading={overview.isLoading} />
      </div>
      {overview.error && <p role="alert" className="mb-4 text-sm text-clay-700">Could not load KPIs: {overview.error.message}</p>}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section
          title="Revenue trend"
          description="Net revenue per day or per week (Monday start)"
          action={<Toggle label="Interval" value={interval} onChange={setInterval} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }]} />}
        >
          <QueryBoundary isLoading={trend.isLoading} error={trend.error} onRetry={() => trend.refetch()} skeleton={<Skeleton className="h-64 w-full" />} isEmpty={noSales} empty={<EmptyState title="No sales in this period" description="Record a sale or choose a longer period." />}>
            {trend.data && <RevenueChart points={trend.data.points} interval={trend.data.interval} />}
          </QueryBoundary>
        </Section>

        <Section title="Category performance" description="Revenue in the period and current stock by category" bodyClassName="p-0 sm:p-0">
          <QueryBoundary isLoading={categories.isLoading} error={categories.error} onRetry={() => categories.refetch()} skeleton={<Skeleton className="m-5 h-64" />}>
            {categories.data && (
              <>
                <div className="px-4 pt-4">
                  <CategoryChart items={categories.data.items} />
                </div>
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <caption className="sr-only">Category performance</caption>
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col" className="text-right">Revenue</th>
                        <th scope="col" className="text-right">Units sold</th>
                        <th scope="col" className="text-right">Stock units</th>
                        <th scope="col" className="text-right">Stock value (cost)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.data.items.map((c) => (
                        <tr key={c.category}>
                          <td>{c.category}</td>
                          <td className="text-right tabular-nums">{money(c.revenue)}</td>
                          <td className="text-right tabular-nums">{c.unitsSold}</td>
                          <td className="text-right tabular-nums">{c.stockUnits ?? '—'}</td>
                          <td className="text-right tabular-nums">{c.stockValueAtCost === null ? '—' : money(c.stockValueAtCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!categories.data.inventoryAvailable && <p className="px-5 py-3 text-xs text-amber-700">Stock figures are unavailable because the Catalog Service could not be reached.</p>}
              </>
            )}
          </QueryBoundary>
        </Section>
      </div>

      <Section
        title="Best sellers"
        description="Top products in the selected period"
        className="mb-6"
        bodyClassName="p-0"
        action={<Toggle label="Rank by" value={topSort} onChange={setTopSort} options={[{ value: 'units', label: 'Units' }, { value: 'revenue', label: 'Revenue' }]} />}
      >
        <QueryBoundary isLoading={top.isLoading} error={top.error} onRetry={() => top.refetch()}>
          {top.data && <TopProductsTable items={top.data.items} sortBy={topSort} />}
        </QueryBoundary>
      </Section>

      <Section
        title="Trend scores"
        description={scores.data ? `Last ${scores.data.windowDays} days vs the ${scores.data.windowDays} days before` : undefined}
        className="mb-6"
        bodyClassName="p-0"
        action={<Badge tone="info">Rule-based heuristic</Badge>}
      >
        <div className="flex gap-2 border-b border-line bg-sage-50/60 px-4 py-3 text-xs text-ink-soft sm:px-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" aria-hidden />
          <p>
            Score (0–100) = <strong>60%</strong> sales velocity (units/day vs a baseline of {scores.data?.baselineUnitsPerDay ?? 2}/day) + <strong>25%</strong> sales growth vs the previous window + <strong>15%</strong> stock urgency
            (low stock cover relative to demand). It is a transparent scoring rule, <strong>not</strong> machine learning or a statistical forecast. Products younger than two windows are flagged “Limited history”.
          </p>
        </div>
        <QueryBoundary isLoading={scores.isLoading} error={scores.error} onRetry={() => scores.refetch()}>
          {scores.data && <TrendScoreTable items={scores.data.items} />}
        </QueryBoundary>
      </Section>

      <div className="grid gap-6">
        <Section
          title="Slow-moving products"
          description={slow.data ? `Products with stock and little or no sales in the last ${slow.data.lookbackDays} days (≤ ${slow.data.maxUnitsPerDay} units/day counts as low velocity)` : undefined}
          bodyClassName="p-0"
          action={
            <SelectField label="" aria-label="Filter slow-moving reason" value={slowStatus} onChange={(e) => setSlowStatus(e.target.value as SlowStatus | '')} className="py-1 text-xs">
              <option value="">All reasons</option>
              <option value="no_sales_history">No sales history</option>
              <option value="no_recent_sales">No recent sales</option>
              <option value="low_velocity">Low velocity</option>
            </SelectField>
          }
        >
          {slow.data && (
            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-xs sm:px-5">
              <Badge tone="bad">{slow.data.summary.noSalesHistory} no sales history</Badge>
              <Badge tone="bad">{slow.data.summary.noRecentSales} no recent sales</Badge>
              <Badge tone="warn">{slow.data.summary.lowVelocity} low velocity</Badge>
              <Badge>{slow.data.summary.outOfStock} out of stock (not slow, just unavailable)</Badge>
              <Badge>{slow.data.summary.tooNewToJudge} too new to judge</Badge>
            </div>
          )}
          <QueryBoundary isLoading={slow.isLoading} error={slow.error} onRetry={() => slow.refetch()}>
            {slow.data && <SlowMovingTable items={slow.data.items} />}
          </QueryBoundary>
        </Section>

        <Section
          title="Restocking recommendations"
          description={restock.data ? `Estimates from average daily sales over ${restock.data.windowDays} days. Flagged when below the reorder level or under ${restock.data.coverThresholdDays} days of stock cover; target ${restock.data.targetCoverDays} days of demand.` : undefined}
          bodyClassName="p-0"
          action={
            <SelectField label="" aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as RestockPriority | '')} className="py-1 text-xs">
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </SelectField>
          }
        >
          <QueryBoundary isLoading={restock.isLoading} error={restock.error} onRetry={() => restock.refetch()}>
            {restock.data && (
              <>
                <RestockTable items={restock.data.items} />
                <p className="border-t border-line px-5 py-3 text-xs text-muted">{restock.data.note}</p>
              </>
            )}
          </QueryBoundary>
        </Section>
      </div>
    </>
  );
}
