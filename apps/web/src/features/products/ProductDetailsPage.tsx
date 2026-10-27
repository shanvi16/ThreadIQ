import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, ArrowLeft, Check, PackagePlus, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { MovementBadge, StatusBadge, StockBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, Section } from '../../components/ui/Card';
import { SelectField, TextField } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, QueryBoundary, Skeleton } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { formatDate, formatDateTime, moneyExact } from '../../lib/format';
import { errorMessage } from '../../lib/http';
import { SIZES, type Product, type Variant } from '../../types/api';
import { useMovements } from '../inventory/api';
import { StockActionModal, type StockMode, type StockTarget } from '../inventory/StockActionModal';
import { useAddVariant, useProduct, useSetProductStatus, useSetReorderThreshold } from './api';
import { variantSchema, variantConflicts, type VariantValues } from './schemas';

export function ProductDetailsPage() {
  const { id } = useParams();
  const toast = useToast();
  const { data: product, isLoading, error, refetch } = useProduct(id);
  const setStatus = useSetProductStatus();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [stockAction, setStockAction] = useState<{ mode: StockMode; target: StockTarget } | null>(null);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !product) {
    return (
      <Card>
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </Card>
    );
  }

  const toggleStatus = async (next: 'active' | 'archived') => {
    try {
      await setStatus.mutateAsync({ id: product.id, status: next });
      toast.success(next === 'archived' ? 'Product archived' : 'Product restored');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirmArchive(false);
    }
  };

  const target = (v: Variant): StockTarget => ({
    productId: product.id,
    productName: product.name,
    variantId: v.id,
    variantLabel: `${v.size} / ${v.color} (${v.sku})`,
    stock: v.stock,
  });
  const margin = product.sellingPrice > 0 ? Math.round(((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100) : 0;

  return (
    <>
      <Link to="/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All products
      </Link>
      <PageHeader
        title={product.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{product.sku}</span> · {product.brand} · {product.category} <StatusBadge status={product.status} />
          </span>
        }
        actions={
          <>
            <Link to={`/products/${product.id}/edit`}>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden />}>
                Edit
              </Button>
            </Link>
            {product.status === 'active' ? (
              <Button variant="secondary" icon={<Archive className="h-4 w-4" aria-hidden />} onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            ) : (
              <Button variant="secondary" icon={<ArchiveRestore className="h-4 w-4" aria-hidden />} loading={setStatus.isPending} onClick={() => toggleStatus('active')}>
                Restore
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Selling price" value={moneyExact(product.sellingPrice)} />
        <Fact label="Cost price" value={moneyExact(product.costPrice)} hint={`${margin}% gross margin`} />
        <Fact label="Total stock" value={String(product.totalStock)} hint={`${product.variants.length} variant${product.variants.length === 1 ? '' : 's'}`} />
        <Fact label="Added" value={formatDate(product.createdAt)} hint={`Updated ${formatDate(product.updatedAt)}`} />
      </div>
      {product.description && <p className="mb-6 max-w-3xl text-sm text-ink-soft">{product.description}</p>}

      <Section
        title="Variants & stock"
        description="Stock changes are recorded as movements: receive deliveries or adjust with a reason."
        className="mb-6"
        bodyClassName="p-0"
        action={
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAddingVariant(true)}>
            Add variant
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <caption className="sr-only">Variants</caption>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Size</th>
                <th scope="col">Colour</th>
                <th scope="col" className="text-right">Stock</th>
                <th scope="col">Level</th>
                <th scope="col">Reorder level</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td className="font-mono text-xs">{v.sku}</td>
                  <td>{v.size}</td>
                  <td>{v.color}</td>
                  <td className="text-right font-medium tabular-nums">{v.stock}</td>
                  <td>
                    <StockBadge level={v.stockLevel} />
                  </td>
                  <td>
                    <ThresholdEditor productId={product.id} variant={v} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" icon={<PackagePlus className="h-4 w-4" aria-hidden />} onClick={() => setStockAction({ mode: 'receipt', target: target(v) })}>
                        Receive
                      </Button>
                      <Button variant="ghost" size="sm" icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />} onClick={() => setStockAction({ mode: 'adjustment', target: target(v) })}>
                        Adjust
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <RecentMovements productId={product.id} />

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this product?"
        message={<>It will be hidden from the active catalogue and can no longer be sold. History is preserved and you can restore it at any time.</>}
        confirmLabel="Archive product"
        loading={setStatus.isPending}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => toggleStatus('archived')}
      />
      <AddVariantModal product={product} open={addingVariant} onClose={() => setAddingVariant(false)} />
      {stockAction && <StockActionModal open onClose={() => setStockAction(null)} mode={stockAction.mode} target={stockAction.target} />}
    </>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/** Inline editor for a variant's reorder threshold. */
function ThresholdEditor({ productId, variant }: { productId: string; variant: Variant }) {
  const toast = useToast();
  const mutation = useSetReorderThreshold(productId);
  const [value, setValue] = useState(String(variant.reorderThreshold));
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000;
  const changed = valid && parsed !== variant.reorderThreshold;

  const save = async () => {
    try {
      await mutation.mutateAsync({ variantId: variant.id, reorderThreshold: parsed });
      toast.success(`Reorder level for ${variant.sku} set to ${parsed}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) void save();
      }}
    >
      <input
        aria-label={`Reorder level for ${variant.sku}`}
        aria-invalid={!valid}
        type="number"
        min={0}
        step={1}
        className={`input w-20 py-1 ${valid ? '' : 'input-error'}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {changed && (
        <Button type="submit" variant="ghost" size="sm" loading={mutation.isPending} aria-label={`Save reorder level for ${variant.sku}`} icon={<Check className="h-4 w-4" aria-hidden />}>
          Save
        </Button>
      )}
    </form>
  );
}

function AddVariantModal({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const add = useAddVariant(product.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<VariantValues>({ resolver: zodResolver(variantSchema), defaultValues: { sku: '', size: 'M', color: '', stock: 0, reorderThreshold: 5 } });

  const onSubmit = async (values: VariantValues) => {
    const conflict = variantConflicts([...product.variants, values]).get(product.variants.length);
    if (conflict) return setError('sku', { message: conflict });
    try {
      await add.mutateAsync(values);
      toast.success(`Variant ${values.sku.toUpperCase()} added`);
      reset();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add variant" description={`New size/colour for ${product.name}. Opening stock is recorded as a receipt.`}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-3 sm:grid-cols-2">
        <TextField label="Variant SKU" required wrapperClassName="sm:col-span-2" error={errors.sku?.message} {...register('sku')} />
        <SelectField label="Size" required error={errors.size?.message} {...register('size')}>
          {SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectField>
        <TextField label="Colour" required error={errors.color?.message} {...register('color')} />
        <TextField label="Opening stock" required type="number" min={0} error={errors.stock?.message} {...register('stock', { valueAsNumber: true })} />
        <TextField label="Reorder level" required type="number" min={0} error={errors.reorderThreshold?.message} {...register('reorderThreshold', { valueAsNumber: true })} />
        <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending}>
            Add variant
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecentMovements({ productId }: { productId: string }) {
  const { data, isLoading, error, refetch } = useMovements({ page: 1, limit: 8, productId });
  return (
    <Section
      title="Recent stock movements"
      bodyClassName="p-0"
      action={
        <Link to="/inventory" className="text-sm text-sage-700 hover:underline">
          Full history
        </Link>
      }
    >
      <QueryBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={data?.data.length === 0}
        empty={<EmptyState title="No stock movements yet" description="Receipts, adjustments and sales will appear here." />}
      >
        <div className="overflow-x-auto">
          <table className="tbl">
            <caption className="sr-only">Recent stock movements</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
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
                  <td className="font-mono text-xs">{m.variantSku}</td>
                  <td>
                    <MovementBadge type={m.type} />
                  </td>
                  <td className={`text-right font-medium tabular-nums ${m.quantityChange > 0 ? 'text-sage-700' : 'text-clay-700'}`}>{m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}</td>
                  <td className="text-right tabular-nums">{m.balanceAfter}</td>
                  <td className="max-w-xs truncate">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryBoundary>
    </Section>
  );
}
