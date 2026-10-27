import { Boxes, PackagePlus, PlusCircle, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MovementBadge, StockBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, QueryBoundary } from '../../components/ui/states';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import type { LowStockRow, MovementType } from '../../types/api';
import { useLowStock, useMovements } from './api';
import { StockActionModal, type StockMode, type StockTarget } from './StockActionModal';

type Tab = 'alerts' | 'history';

interface ActiveAction {
  mode: StockMode;
  target?: StockTarget;
}

const targetOf = (r: LowStockRow): StockTarget => ({
  productId: r.productId,
  productName: r.productName,
  variantId: r.variantId,
  variantLabel: `${r.size} / ${r.color} (${r.variantSku})`,
  stock: r.stock,
});

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>('alerts');
  const [action, setAction] = useState<ActiveAction | null>(null);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock alerts and the full audit trail of every stock change."
        actions={
          <>
            <Button variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />} onClick={() => setAction({ mode: 'adjustment' })}>
              Adjust stock
            </Button>
            <Button icon={<PackagePlus className="h-4 w-4" aria-hidden />} onClick={() => setAction({ mode: 'receipt' })}>
              Receive stock
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label="Inventory views" className="mb-4 inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-sm">
        {(
          [
            ['alerts', 'Low & out of stock'],
            ['history', 'Movement history'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={cn('rounded-md px-3.5 py-1.5 font-medium', tab === key ? 'bg-sage-700 text-white' : 'text-ink-soft hover:bg-sage-50')}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'alerts' ? <AlertsTable onAction={(mode, target) => setAction({ mode, target })} /> : <MovementsTable />}
        </div>
      </Card>

      {action && <StockActionModal open onClose={() => setAction(null)} mode={action.mode} target={action.target} />}
    </>
  );
}

function AlertsTable({ onAction }: { onAction: (mode: StockMode, target: StockTarget) => void }) {
  const [level, setLevel] = useState<'all' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [level]);
  const { data, isLoading, error, refetch } = useLowStock({ level, page, limit: 15 });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4">
        <p className="max-w-xl text-sm text-muted">
          A variant is <strong className="font-medium text-ink-soft">low</strong> when its stock is at or below its reorder level, and <strong className="font-medium text-ink-soft">out</strong> at zero.
        </p>
        <SelectField label="Show" value={level} onChange={(e) => setLevel(e.target.value as typeof level)} wrapperClassName="w-44">
          <option value="all">Low and out of stock</option>
          <option value="low">Low stock only</option>
          <option value="out">Out of stock only</option>
        </SelectField>
      </div>
      <QueryBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={data?.data.length === 0}
        empty={<EmptyState icon={<Boxes className="h-5 w-5" aria-hidden />} title="No stock alerts" description="Every active variant is above its reorder level." />}
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <caption className="sr-only">Low and out of stock variants</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Variant</th>
                <th scope="col" className="text-right">Stock</th>
                <th scope="col" className="text-right">Reorder level</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((r) => (
                <tr key={r.variantId}>
                  <td>
                    <Link to={`/products/${r.productId}`} className="font-medium hover:underline">
                      {r.productName}
                    </Link>
                    <p className="text-xs text-muted">{r.category}</p>
                  </td>
                  <td>
                    {r.size} / {r.color}
                    <p className="font-mono text-xs text-muted">{r.variantSku}</p>
                  </td>
                  <td className="text-right font-medium tabular-nums">{r.stock}</td>
                  <td className="text-right tabular-nums">{r.reorderThreshold}</td>
                  <td>
                    <StockBadge level={r.level} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" icon={<PlusCircle className="h-4 w-4" aria-hidden />} onClick={() => onAction('receipt', targetOf(r))} aria-label={`Restock ${r.productName} ${r.variantSku}`}>
                        Restock
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onAction('adjustment', targetOf(r))} aria-label={`Adjust ${r.productName} ${r.variantSku}`}>
                        Adjust
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pagination meta={data.meta} onPage={setPage} />}
      </QueryBoundary>
    </>
  );
}

function MovementsTable() {
  const [type, setType] = useState<MovementType | ''>('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [type]);
  const { data, isLoading, error, refetch } = useMovements({ page, limit: 15, type });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4">
        <p className="max-w-xl text-sm text-muted">Every receipt, adjustment, sale deduction and return, newest first. Stock is never overwritten silently.</p>
        <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as MovementType | '')} wrapperClassName="w-44">
          <option value="">All movements</option>
          <option value="receipt">Receipts</option>
          <option value="adjustment">Adjustments</option>
          <option value="sale">Sales</option>
          <option value="return">Returns</option>
        </SelectField>
      </div>
      <QueryBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={data?.data.length === 0}
        empty={<EmptyState title="No movements found" description="Try a different type filter." />}
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <caption className="sr-only">Stock movement history</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Product</th>
                <th scope="col">Variant</th>
                <th scope="col">Type</th>
                <th scope="col" className="text-right">Change</th>
                <th scope="col" className="text-right">Balance</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                  <td>
                    <Link to={`/products/${m.productId}`} className="hover:underline">
                      {m.productName}
                    </Link>
                  </td>
                  <td className="font-mono text-xs">{m.variantSku}</td>
                  <td>
                    <MovementBadge type={m.type} />
                  </td>
                  <td className={cn('text-right font-medium tabular-nums', m.quantityChange > 0 ? 'text-sage-700' : 'text-clay-700')}>{m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}</td>
                  <td className="text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="max-w-xs truncate" title={m.reason}>
                    {m.reason}
                    {m.reversed && <span className="ml-1 text-xs text-muted">(reversed)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <Pagination meta={data.meta} onPage={setPage} />}
      </QueryBoundary>
    </>
  );
}
