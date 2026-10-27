import { Plus, Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, QueryBoundary } from '../../components/ui/states';
import { useDebounce } from '../../hooks/useDebounce';
import { formatDateTime, moneyExact } from '../../lib/format';
import { useSales } from './api';

export function SalesHistoryPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), 300);
  useEffect(() => setPage(1), [from, to, q]);

  const invalidRange = Boolean(from && to && from > to);
  const { data, isLoading, error, refetch } = useSales({ page, limit: 15, from: invalidRange ? undefined : from, to: invalidRange ? undefined : to, q });
  const filtered = Boolean(from || to || q);

  return (
    <>
      <PageHeader
        title="Sales history"
        description="Every recorded sale, newest first."
        actions={
          <Link to="/sales/new">
            <Button icon={<Plus className="h-4 w-4" aria-hidden />}>Record sale</Button>
          </Link>
        }
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <TextField label="From" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} min={from || undefined} error={invalidRange ? '"From" must not be after "To"' : undefined} onChange={(e) => setTo(e.target.value)} />
          <div>
            <label htmlFor="sale-search" className="mb-1 block text-sm font-medium text-ink-soft">
              Sale number
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
              <input id="sale-search" className="input pl-9" placeholder="TIQ-2026…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        <QueryBoundary
          isLoading={isLoading}
          error={error}
          onRetry={() => refetch()}
          isEmpty={data?.data.length === 0}
          empty={
            <EmptyState
              icon={<Receipt className="h-5 w-5" aria-hidden />}
              title={filtered ? 'No sales match your filters' : 'No sales recorded yet'}
              description={filtered ? 'Try widening the date range.' : 'Recorded sales will appear here.'}
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFrom('');
                      setTo('');
                      setSearch('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Link to="/sales/new">
                    <Button>Record your first sale</Button>
                  </Link>
                )
              }
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="tbl">
              <caption className="sr-only">Sales</caption>
              <thead>
                <tr>
                  <th scope="col">Sale</th>
                  <th scope="col">Date</th>
                  <th scope="col">Items</th>
                  <th scope="col" className="text-right">Units</th>
                  <th scope="col" className="text-right">Discount</th>
                  <th scope="col" className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map((s) => (
                  <tr key={s.id} className="row-link cursor-pointer" onClick={() => navigate(`/sales/${s.id}`)}>
                    <td>
                      <Link to={`/sales/${s.id}`} className="font-mono text-xs font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.saleNumber}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</td>
                    <td className="max-w-xs truncate">{s.items.map((i) => i.productName).join(', ')}</td>
                    <td className="text-right tabular-nums">{s.unitsSold}</td>
                    <td className="text-right tabular-nums text-muted">{s.discount > 0 ? moneyExact(s.discount) : '—'}</td>
                    <td className="text-right font-medium tabular-nums">{moneyExact(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <Pagination meta={data.meta} onPage={setPage} />}
        </QueryBoundary>
      </Card>
    </>
  );
}
