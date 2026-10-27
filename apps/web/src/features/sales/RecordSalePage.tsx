import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { VariantPicker, type VariantSelection } from '../../components/VariantPicker';
import { Button } from '../../components/ui/Button';
import { Card, Section } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime, moneyExact } from '../../lib/format';
import { ApiError, errorMessage } from '../../lib/http';
import { newIdempotencyKey } from '../../lib/ids';
import type { Sale } from '../../types/api';
import { useCreateSale } from './api';

const lineSchema = z
  .object({
    productId: z.string(),
    variantId: z.string(),
    name: z.string(),
    sku: z.string(),
    size: z.string(),
    color: z.string(),
    unitPrice: z.number(),
    stock: z.number(),
    quantity: z.number({ invalid_type_error: 'Enter a number' }).int('Whole numbers only').min(1, 'At least 1'),
  })
  .refine((l) => l.quantity <= l.stock, (l) => ({ path: ['quantity'], message: `Only ${l.stock} in stock` }));

const saleSchema = z
  .object({
    lines: z.array(lineSchema).min(1, 'Add at least one item to the sale'),
    discount: z.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Discount cannot be negative'),
  })
  .superRefine((v, ctx) => {
    const subtotal = v.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    if (v.discount > subtotal) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discount'], message: 'Discount cannot exceed the subtotal' });
  });
type SaleForm = z.infer<typeof saleSchema>;

export function RecordSalePage() {
  const toast = useToast();
  const createSale = useCreateSale();
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [picked, setPicked] = useState<VariantSelection | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [addQty, setAddQty] = useState(1);
  const [completed, setCompleted] = useState<{ sale: Sale; replayed: boolean } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<SaleForm>({ resolver: zodResolver(saleSchema), defaultValues: { lines: [], discount: 0 } });
  const { fields, append, update, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const discountRaw = useWatch({ control, name: 'discount' });

  const subtotal = lines.reduce((s, l) => s + (Number(l?.unitPrice) || 0) * (Number(l?.quantity) || 0), 0);
  const discount = Number.isFinite(discountRaw) ? Number(discountRaw) : 0;
  const total = Math.max(0, subtotal - Math.max(0, discount));

  const addLine = () => {
    if (!picked) return;
    const { product, variant } = picked;
    const qty = Number.isInteger(addQty) && addQty >= 1 ? addQty : 1;
    const existing = getValues('lines').findIndex((l) => l.variantId === variant.id);
    if (existing >= 0) {
      const line = getValues(`lines.${existing}`);
      update(existing, { ...line, quantity: Math.min(line.quantity + qty, variant.stock) });
    } else {
      append({
        productId: product.id,
        variantId: variant.id,
        name: product.name,
        sku: variant.sku,
        size: variant.size,
        color: variant.color,
        unitPrice: product.sellingPrice,
        stock: variant.stock,
        quantity: Math.min(qty, variant.stock),
      });
    }
    setPicked(null);
    setPickerKey((k) => k + 1);
    setAddQty(1);
  };

  const onSubmit = async (values: SaleForm) => {
    try {
      const res = await createSale.mutateAsync({
        idempotencyKey,
        items: values.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        discount: values.discount,
      });
      setCompleted({ sale: res.data, replayed: res.meta.replayed });
      toast.success(res.meta.replayed ? `Sale ${res.data.saleNumber} was already recorded` : `Sale ${res.data.saleNumber} recorded`);
    } catch (err) {
      toast.error(errorMessage(err));
      // A definitive rejection (nothing was deducted) lets the cashier fix the cart and resubmit with a fresh key.
      // Network/5xx failures keep the key so a retry can never double-deduct stock.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) setIdempotencyKey(newIdempotencyKey());
    }
  };

  const startNew = () => {
    reset({ lines: [], discount: 0 });
    setIdempotencyKey(newIdempotencyKey());
    setCompleted(null);
  };

  if (completed) {
    const { sale } = completed;
    return (
      <>
        <PageHeader title="Record sale" />
        <Card className="mx-auto max-w-2xl">
          <div className="flex flex-col items-center border-b border-line px-6 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-sage-600" aria-hidden />
            <h2 className="mt-3 text-xl font-semibold">{completed.replayed ? 'Sale was already recorded' : 'Sale recorded'}</h2>
            <p className="mt-1 text-sm text-muted">
              {sale.saleNumber} · {formatDateTime(sale.createdAt)}
            </p>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{moneyExact(sale.total)}</p>
            <p className="text-xs text-muted">Stock has been deducted for {sale.unitsSold} unit{sale.unitsSold === 1 ? '' : 's'}.</p>
          </div>
          <ul className="divide-y divide-line px-6">
            {sale.items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-4 py-3 text-sm">
                <span>
                  {i.quantity} × {i.productName} <span className="text-muted">({i.size} / {i.color})</span>
                </span>
                <span className="tabular-nums">{moneyExact(i.lineTotal)}</span>
              </li>
            ))}
            {sale.discount > 0 && (
              <li className="flex justify-between py-3 text-sm text-muted">
                <span>Discount</span>
                <span className="tabular-nums">−{moneyExact(sale.discount)}</span>
              </li>
            )}
          </ul>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
            <Link to={`/sales/${sale.id}`}>
              <Button variant="secondary">View sale</Button>
            </Link>
            <Button onClick={startNew} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Record another sale
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Record sale" description="Add items, then record the sale. Stock is deducted automatically. This records a transaction; it does not process payment." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Add an item">
            <VariantPicker key={pickerKey} onChange={setPicked} isVariantDisabled={(v) => v.stock === 0} />
            {picked && (
              <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-sage-50 p-3">
                <p className="flex-1 text-sm">
                  <span className="font-medium">{picked.product.name}</span> · {picked.variant.size} / {picked.variant.color}
                  <br />
                  <span className="text-muted">
                    Unit price {moneyExact(picked.product.sellingPrice)} · {picked.variant.stock} in stock
                  </span>
                </p>
                <div className="w-24">
                  <label htmlFor="add-qty" className="mb-1 block text-sm font-medium text-ink-soft">
                    Quantity
                  </label>
                  <input id="add-qty" type="number" min={1} max={picked.variant.stock} className="input" value={Number.isNaN(addQty) ? '' : addQty} onChange={(e) => setAddQty(e.target.valueAsNumber)} />
                </div>
                <Button onClick={addLine} icon={<Plus className="h-4 w-4" aria-hidden />}>
                  Add to sale
                </Button>
              </div>
            )}
          </Section>

          <Section title="Items in this sale" bodyClassName="p-0">
            {fields.length === 0 ? (
              <EmptyState icon={<ShoppingBag className="h-5 w-5" aria-hidden />} title="No items yet" description="Search for a product above and add a variant to start the sale." />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <caption className="sr-only">Sale items</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" className="text-right">Unit price</th>
                      <th scope="col" className="w-32">Qty</th>
                      <th scope="col" className="text-right">Line total</th>
                      <th scope="col"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, i) => {
                      const qtyErr = errors.lines?.[i]?.quantity?.message ?? errors.lines?.[i]?.message;
                      const q = Number(lines[i]?.quantity) || 0;
                      return (
                        <tr key={f.id}>
                          <td>
                            <p className="font-medium">{f.name}</p>
                            <p className="text-xs text-muted">
                              {f.size} / {f.color} · <span className="font-mono">{f.sku}</span> · {f.stock} in stock
                            </p>
                          </td>
                          <td className="text-right tabular-nums">{moneyExact(f.unitPrice)}</td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              max={f.stock}
                              aria-label={`Quantity for ${f.name} ${f.size} ${f.color}`}
                              aria-invalid={Boolean(qtyErr)}
                              className={`input w-24 py-1 ${qtyErr ? 'input-error' : ''}`}
                              {...register(`lines.${i}.quantity`, { valueAsNumber: true })}
                            />
                            {qtyErr && (
                              <p role="alert" className="mt-1 text-xs text-clay-700">
                                {qtyErr}
                              </p>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{moneyExact(f.unitPrice * q)}</td>
                          <td className="text-right">
                            <Button variant="ghost" size="sm" aria-label={`Remove ${f.name} ${f.size} ${f.color}`} icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => remove(i)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {errors.lines?.message && (
              <p role="alert" className="px-5 pb-4 text-sm text-clay-700">
                {errors.lines.message}
              </p>
            )}
          </Section>
        </div>

        <aside>
          <Card className="sticky top-4 p-5">
            <h2 className="text-base font-semibold">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{moneyExact(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">
                  <label htmlFor="discount">Discount (₹)</label>
                </dt>
                <dd className="w-32">
                  <TextField
                    label=""
                    aria-label="Discount in rupees"
                    id="discount"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    className="py-1 text-right"
                    error={errors.discount?.message}
                    {...register('discount', { valueAsNumber: true })}
                  />
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{moneyExact(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">Prices and totals are recalculated by the server when you record the sale.</p>
            <Button type="submit" className="mt-5 w-full" loading={createSale.isPending} disabled={fields.length === 0}>
              Record sale
            </Button>
          </Card>
        </aside>
      </form>
    </>
  );
}
