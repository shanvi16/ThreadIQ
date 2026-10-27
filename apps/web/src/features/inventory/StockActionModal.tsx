import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { VariantPicker, type VariantSelection } from '../../components/VariantPicker';
import { Button } from '../../components/ui/Button';
import { TextField, SelectField } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/http';
import { useAdjustStock, useReceiveStock } from './api';

export type StockMode = 'receipt' | 'adjustment';

export interface StockTarget {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  stock: number;
}

const schema = z.object({
  direction: z.enum(['increase', 'decrease']),
  quantity: z.number({ invalid_type_error: 'Enter a whole number' }).int('Must be a whole number').min(1, 'Must be at least 1').max(1_000_000, 'Too large'),
  reason: z.string().trim().max(300, 'At most 300 characters'),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  mode: StockMode;
  /** When omitted the modal shows a product/variant picker. */
  target?: StockTarget;
}

export function StockActionModal({ open, onClose, mode: initialMode, target }: Props) {
  const toast = useToast();
  const receive = useReceiveStock();
  const adjust = useAdjustStock();
  const [mode, setMode] = useState<StockMode>(initialMode);
  const [picked, setPicked] = useState<VariantSelection | null>(null);

  const current: StockTarget | null =
    target ??
    (picked
      ? {
          productId: picked.product.id,
          productName: picked.product.name,
          variantId: picked.variant.id,
          variantLabel: `${picked.variant.size} / ${picked.variant.color} (${picked.variant.sku})`,
          stock: picked.variant.stock,
        }
      : null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { direction: 'increase', quantity: 1, reason: '' } });

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPicked(null);
      reset({ direction: 'increase', quantity: 1, reason: '' });
    }
  }, [open, initialMode, reset]);

  const pending = receive.isPending || adjust.isPending;

  const onSubmit = async (values: FormValues) => {
    if (!current) return;
    try {
      if (mode === 'receipt') {
        await receive.mutateAsync({
          productId: current.productId,
          variantId: current.variantId,
          quantity: values.quantity,
          reason: values.reason || undefined,
        });
        toast.success(`Received ${values.quantity} × ${current.productName}`);
      } else {
        if (!values.reason) {
          setError('reason', { message: 'A reason is required for adjustments' });
          return;
        }
        const change = values.direction === 'decrease' ? -values.quantity : values.quantity;
        if (current.stock + change < 0) {
          setError('quantity', { message: `Stock cannot go below zero (currently ${current.stock})` });
          return;
        }
        await adjust.mutateAsync({ productId: current.productId, variantId: current.variantId, quantityChange: change, reason: values.reason });
        toast.success(`Stock adjusted by ${change > 0 ? '+' : ''}${change} for ${current.productName}`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'receipt' ? 'Receive stock' : 'Adjust stock'}
      description={mode === 'receipt' ? 'Add newly delivered units to a variant.' : 'Correct stock with a recorded reason (damage, recount, …).'}
      size={target ? 'md' : 'lg'}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div role="group" aria-label="Action" className="inline-flex rounded-lg border border-line-strong p-0.5 text-sm">
          {(['receipt', 'adjustment'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 font-medium ${mode === m ? 'bg-sage-700 text-white' : 'text-ink-soft hover:bg-sage-50'}`}
            >
              {m === 'receipt' ? 'Receive' : 'Adjust'}
            </button>
          ))}
        </div>

        {target ? (
          <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm">
            <span className="font-medium">{target.productName}</span> — {target.variantLabel}. Current stock: <strong>{target.stock}</strong>
          </p>
        ) : (
          <>
            <VariantPicker onChange={setPicked} />
            {current && (
              <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm">
                Current stock: <strong>{current.stock}</strong>
              </p>
            )}
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {mode === 'adjustment' && (
            <SelectField label="Direction" {...register('direction')}>
              <option value="increase">Increase stock</option>
              <option value="decrease">Decrease stock</option>
            </SelectField>
          )}
          <TextField
            label="Quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            error={errors.quantity?.message}
            {...register('quantity', { valueAsNumber: true })}
          />
          <TextField
            label={mode === 'receipt' ? 'Note (optional)' : 'Reason'}
            required={mode === 'adjustment'}
            wrapperClassName="sm:col-span-2"
            placeholder={mode === 'receipt' ? 'e.g. Supplier delivery #4411' : 'e.g. Damaged in storage'}
            error={errors.reason?.message}
            {...register('reason')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} disabled={!current}>
            {mode === 'receipt' ? 'Receive stock' : 'Save adjustment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
