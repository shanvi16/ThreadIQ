import { Search } from 'lucide-react';
import { useState } from 'react';
import { useProducts } from '../features/products/api';
import { useDebounce } from '../hooks/useDebounce';
import type { Product, Variant } from '../types/api';
import { Field } from './ui/Field';

export interface VariantSelection {
  product: Product;
  variant: Variant;
}

interface Props {
  onChange: (selection: VariantSelection | null) => void;
  /** Hide variants that cannot be picked, e.g. zero stock when selling. */
  isVariantDisabled?: (variant: Variant) => boolean;
}

/** Search active products, then choose one of their variants. */
export function VariantPicker({ onChange, isVariantDisabled }: Props) {
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const q = useDebounce(search.trim(), 250);
  const { data, isLoading, error } = useProducts({ page: 1, limit: 50, q, status: 'active', sortBy: 'name', order: 'asc' });

  const options = data?.data ?? [];
  const list = product && !options.some((p) => p.id === product.id) ? [product, ...options] : options;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Find product" hint="Search by name, SKU or brand">
        {({ id, describedBy }) => (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <input id={id} aria-describedby={describedBy} className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. linen" />
          </div>
        )}
      </Field>

      <Field label="Product" error={error ? 'Could not load products' : undefined}>
        {({ id, invalid }) => (
          <select
            id={id}
            aria-invalid={invalid}
            className="input"
            value={product?.id ?? ''}
            disabled={isLoading}
            onChange={(e) => {
              setProduct(list.find((p) => p.id === e.target.value) ?? null);
              onChange(null);
            }}
          >
            <option value="">{isLoading ? 'Loading…' : list.length === 0 ? 'No matching products' : 'Select a product'}</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Variant">
        {({ id }) => (
          <select
            id={id}
            className="input"
            disabled={!product}
            defaultValue=""
            key={product?.id ?? 'none'}
            onChange={(e) => {
              const variant = product?.variants.find((v) => v.id === e.target.value);
              onChange(product && variant ? { product, variant } : null);
            }}
          >
            <option value="">{product ? 'Select size / colour' : 'Pick a product first'}</option>
            {product?.variants.map((v) => (
              <option key={v.id} value={v.id} disabled={isVariantDisabled?.(v)}>
                {v.size} / {v.color} — {v.stock} in stock
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}
