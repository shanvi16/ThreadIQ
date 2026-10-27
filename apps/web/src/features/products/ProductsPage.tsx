import { Archive, ArchiveRestore, Eye, Pencil, Plus, Search, Shirt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatusBadge, StockBadge } from '../../components/ui/Badge';
import { SelectField, TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { QueryBoundary, EmptyState } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { useDebounce } from '../../hooks/useDebounce';
import { errorMessage } from '../../lib/http';
import { moneyExact, number } from '../../lib/format';
import { CATEGORIES, SIZES, type Category, type Product, type Size } from '../../types/api';
import { useProducts, useSetProductStatus, type ProductFilters } from './api';

const SORTS = {
  newest: { label: 'Newest first', sortBy: 'createdAt', order: 'desc' },
  name: { label: 'Name A–Z', sortBy: 'name', order: 'asc' },
  priceLow: { label: 'Price: low to high', sortBy: 'sellingPrice', order: 'asc' },
  priceHigh: { label: 'Price: high to low', sortBy: 'sellingPrice', order: 'desc' },
} as const;
type SortKey = keyof typeof SORTS;

export function ProductsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [size, setSize] = useState<Size | ''>('');
  const [color, setColor] = useState('');
  const [status, setStatus] = useState<ProductFilters['status']>('active');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<Product | null>(null);

  const q = useDebounce(search.trim(), 300);
  const debouncedColor = useDebounce(color.trim(), 300);
  useEffect(() => setPage(1), [q, category, size, debouncedColor, status, sort]);

  const { data, isLoading, isFetching, error, refetch } = useProducts({
    page,
    limit: 10,
    q,
    category,
    size,
    color: debouncedColor,
    status,
    sortBy: SORTS[sort].sortBy,
    order: SORTS[sort].order,
  });
  const setStatusMutation = useSetProductStatus();

  const changeStatus = async (product: Product, next: 'active' | 'archived') => {
    try {
      await setStatusMutation.mutateAsync({ id: product.id, status: next });
      toast.success(next === 'archived' ? `"${product.name}" archived` : `"${product.name}" restored`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirm(null);
    }
  };

  const filtersActive = Boolean(q || category || size || debouncedColor || status !== 'active');
  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setSize('');
    setColor('');
    setStatus('active');
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue of garments and their variants."
        actions={
          <Link to="/products/new">
            <Button icon={<Plus className="h-4 w-4" aria-hidden />}>Add product</Button>
          </Link>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="product-search" className="mb-1 block text-sm font-medium text-ink-soft">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
              <input id="product-search" className="input pl-9" placeholder="Name, SKU or brand" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as Category | '')}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          <SelectField label="Size" value={size} onChange={(e) => setSize(e.target.value as Size | '')}>
            <option value="">Any size</option>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectField>
          <TextField label="Colour" placeholder="e.g. Sage" value={color} onChange={(e) => setColor(e.target.value)} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as ProductFilters['status'])}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </SelectField>
          <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} wrapperClassName="sm:col-span-2 lg:col-span-2">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className={isFetching && !isLoading ? 'opacity-70 transition-opacity' : ''}>
          <QueryBoundary
            isLoading={isLoading}
            error={error}
            onRetry={() => refetch()}
            isEmpty={data?.data.length === 0}
            empty={
              <EmptyState
                icon={<Shirt className="h-5 w-5" aria-hidden />}
                title={filtersActive ? 'No products match your filters' : 'No products yet'}
                description={filtersActive ? 'Try a different search or clear the filters.' : 'Add your first product to start tracking stock.'}
                action={
                  filtersActive ? (
                    <Button variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Link to="/products/new">
                      <Button icon={<Plus className="h-4 w-4" aria-hidden />}>Add product</Button>
                    </Link>
                  )
                }
              />
            }
          >
            <div className="overflow-x-auto">
              <table className="tbl">
                <caption className="sr-only">Products</caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="text-right">Price</th>
                    <th scope="col" className="text-right">Stock</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map((p) => (
                    <tr key={p.id} className="row-link">
                      <td>
                        <Link to={`/products/${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted">
                          {p.brand} · {p.variants.length} variant{p.variants.length === 1 ? '' : 's'}
                        </p>
                      </td>
                      <td className="font-mono text-xs">{p.sku}</td>
                      <td>{p.category}</td>
                      <td className="text-right tabular-nums">{moneyExact(p.sellingPrice)}</td>
                      <td className="text-right">
                        <span className="tabular-nums">{number(p.totalStock)}</span>
                        <div className="mt-0.5 flex justify-end gap-1">
                          {p.outOfStockVariants > 0 && <StockBadge level="out" />}
                          {p.lowStockVariants > 0 && <StockBadge level="low" />}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <Link to={`/products/${p.id}`} aria-label={`View ${p.name}`}>
                            <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" aria-hidden />}>View</Button>
                          </Link>
                          <Link to={`/products/${p.id}/edit`} aria-label={`Edit ${p.name}`}>
                            <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />}>Edit</Button>
                          </Link>
                          {p.status === 'active' ? (
                            <Button variant="ghost" size="sm" aria-label={`Archive ${p.name}`} icon={<Archive className="h-4 w-4" aria-hidden />} onClick={() => setConfirm(p)}>
                              Archive
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" aria-label={`Restore ${p.name}`} icon={<ArchiveRestore className="h-4 w-4" aria-hidden />} onClick={() => changeStatus(p, 'active')}>
                              Restore
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && <Pagination meta={data.meta} onPage={setPage} />}
          </QueryBoundary>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Archive this product?"
        message={
          <>
            <strong>{confirm?.name}</strong> will be hidden from the active catalogue and can no longer be sold. Its sales history and stock movements are kept, and you can restore it
            later.
          </>
        }
        confirmLabel="Archive product"
        loading={setStatusMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && changeStatus(confirm, 'archived')}
      />
    </>
  );
}
