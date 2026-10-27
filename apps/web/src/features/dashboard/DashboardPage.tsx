import { AlertTriangle, Banknote, Boxes, PackageX, Receipt, Shirt, ShoppingBag, TrendingUp, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PeriodLabel, RangePicker } from '../../components/RangePicker';
import { Button } from '../../components/ui/Button';
import { Section } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, QueryBoundary, Skeleton } from '../../components/ui/states';
import { StatCard } from '../../components/ui/StatCard';
import { cn } from '../../lib/cn';
import { useDateRange } from '../../lib/dateRange';
import { formatDateTime, money, moneyExact, number } from '../../lib/format';
import { useCategoryPerformance, useOverview, useRestock, useRevenueTrend, useSlowMoving, useTopProducts } from '../insights/api';
import { CategoryChart, RevenueChart } from '../insights/charts';
import { RestockTable, SlowMovingTable, TopProductsTable } from '../insights/tables';
import { useSales } from '../sales/api';

export function DashboardPage() {
  const { days, setDays, from, to } = useDateRange(30);
  const range = { from, to };
  const [interval, setInterval] = useState<'day' | 'week'>('day');

  const overview = useOverview(range);
  const trend = useRevenueTrend(range, interval);
  const categories = useCategoryPerformance(range);
  const top = useTopProducts(range, 'units', 5);
  const slow = useSlowMoving(5);
  const restock = useRestock(6);
  const recent = useSales({ page: 1, limit: 5 });

  const o = overview.data;
  const inv = o?.inventory ?? null;
  const loading = overview.isLoading;
  const dash = <span className="text-muted">—</span>;
  const noSalesInRange = trend.data ? trend.data.points.every((p) => p.revenue === 0) : false;

  return (
    <>
      <PageHeader title="Dashboard" description={<PeriodLabel from={from} to={to} />} actions={<RangePicker days={days} onChange={setDays} />} />

      {overview.error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-clay-100 bg-clay-50 px-4 py-3 text-sm text-clay-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Could not load dashboard figures: {overview.error.message}{' '}
            <button type="button" className="font-medium underline" onClick={() => overview.refetch()}>
              Retry
            </button>
          </p>
        </div>
      )}
      {o && !o.inventoryAvailable && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>The Catalog Service is unreachable, so inventory figures are unavailable. Sales figures are still shown.</p>
        </div>
      )}

      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active products" value={inv ? inv.activeProducts : dash} icon={<Shirt className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Units in stock" value={inv ? number(inv.totalUnits) : dash} icon={<Boxes className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Inventory value" value={inv ? money(inv.inventoryValueAtCost) : dash} hint="At cost price" icon={<Warehouse className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Revenue" value={money(o?.revenue ?? 0)} hint={o ? `${money(o.grossSales)} gross − ${money(o.discounts)} discounts` : undefined} icon={<Banknote className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Units sold" value={number(o?.unitsSold ?? 0)} hint={`${number(o?.salesCount ?? 0)} orders`} icon={<ShoppingBag className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Avg. order value" value={moneyExact(o?.averageOrderValue ?? 0)} icon={<Receipt className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Low-stock variants" value={inv ? inv.lowStockVariants : dash} tone={inv && inv.lowStockVariants > 0 ? 'warn' : 'default'} hint="At or below reorder level" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} loading={loading} />
        <StatCard label="Out-of-stock variants" value={inv ? inv.outOfStockVariants : dash} tone={inv && inv.outOfStockVariants > 0 ? 'bad' : 'default'} hint="Zero units available" icon={<PackageX className="h-5 w-5" aria-hidden />} loading={loading} />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Section
          title="Revenue"
          description={interval === 'day' ? 'Net revenue per day' : 'Net revenue per week (Monday start)'}
          className="lg:col-span-3"
          action={
            <div role="group" aria-label="Interval" className="inline-flex rounded-lg border border-line-strong p-0.5 text-xs">
              {(['day', 'week'] as const).map((i) => (
                <button key={i} type="button" aria-pressed={interval === i} onClick={() => setInterval(i)} className={cn('rounded-md px-2.5 py-1 font-medium', interval === i ? 'bg-sage-700 text-white' : 'text-ink-soft hover:bg-sage-50')}>
                  {i === 'day' ? 'Daily' : 'Weekly'}
                </button>
              ))}
            </div>
          }
        >
          <QueryBoundary
            isLoading={trend.isLoading}
            error={trend.error}
            onRetry={() => trend.refetch()}
            skeleton={<Skeleton className="h-64 w-full" />}
            isEmpty={noSalesInRange}
            empty={<EmptyState icon={<TrendingUp className="h-5 w-5" aria-hidden />} title="No sales in this period" description="Revenue will chart here once sales are recorded." action={<Link to="/sales/new"><Button>Record a sale</Button></Link>} />}
          >
            {trend.data && <RevenueChart points={trend.data.points} interval={trend.data.interval} />}
          </QueryBoundary>
        </Section>

        <Section title="Sales by category" description="Net revenue in the period" className="lg:col-span-2">
          <QueryBoundary
            isLoading={categories.isLoading}
            error={categories.error}
            onRetry={() => categories.refetch()}
            skeleton={<Skeleton className="h-64 w-full" />}
            isEmpty={categories.data ? categories.data.items.every((c) => c.revenue === 0 && c.unitsSold === 0) : false}
            empty={<EmptyState title="No category sales yet" description="Sales by category appear after the first sale in this period." />}
          >
            {categories.data && <CategoryChart items={categories.data.items} />}
          </QueryBoundary>
        </Section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Best sellers" description="Most units sold in the period" bodyClassName="p-0" action={<Link to="/analytics" className="text-sm text-sage-700 hover:underline">All analytics</Link>}>
          <QueryBoundary isLoading={top.isLoading} error={top.error} onRetry={() => top.refetch()}>
            {top.data && <TopProductsTable items={top.data.items} sortBy="units" />}
          </QueryBoundary>
        </Section>

        <Section title="Recent sales" bodyClassName="p-0" action={<Link to="/sales" className="text-sm text-sage-700 hover:underline">View all</Link>}>
          <QueryBoundary isLoading={recent.isLoading} error={recent.error} onRetry={() => recent.refetch()} isEmpty={recent.data?.data.length === 0} empty={<EmptyState title="No sales yet" description="Recorded sales will appear here." action={<Link to="/sales/new"><Button>Record a sale</Button></Link>} />}>
            <ul className="divide-y divide-line">
              {recent.data?.data.map((s) => (
                <li key={s.id}>
                  <Link to={`/sales/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sage-50 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium">{s.saleNumber}</p>
                      <p className="truncate text-xs text-muted">{s.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">{moneyExact(s.total)}</p>
                      <p className="text-xs text-muted">{formatDateTime(s.createdAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </QueryBoundary>
        </Section>
      </div>

      <div className="grid gap-6">
        <Section
          title="Restocking recommendations"
          description="Estimates based on recent average sales and reorder levels"
          bodyClassName="p-0"
          action={<Link to="/analytics" className="text-sm text-sage-700 hover:underline">See reasoning</Link>}
        >
          <QueryBoundary isLoading={restock.isLoading} error={restock.error} onRetry={() => restock.refetch()}>
            {restock.data && <RestockTable items={restock.data.items} compact />}
          </QueryBoundary>
        </Section>

        <Section
          title="Slow-moving products"
          description={slow.data ? `No or very few sales in the last ${slow.data.lookbackDays} days while stock remains` : undefined}
          bodyClassName="p-0"
          action={<Link to="/analytics" className="text-sm text-sage-700 hover:underline">All analytics</Link>}
        >
          <QueryBoundary isLoading={slow.isLoading} error={slow.error} onRetry={() => slow.refetch()}>
            {slow.data && <SlowMovingTable items={slow.data.items} compact />}
          </QueryBoundary>
        </Section>
      </div>
    </>
  );
}
