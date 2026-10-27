import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Section } from '../../components/ui/Card';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, Skeleton } from '../../components/ui/states';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/http';
import { CATEGORIES, SIZES } from '../../types/api';
import { useCreateProduct, useProduct, useUpdateProduct } from './api';
import { createProductSchema, editProductSchema, type CreateProductValues, type EditProductValues } from './schemas';

const emptyVariant = { sku: '', size: 'M' as const, color: '', stock: 0, reorderThreshold: 5 };

export function ProductFormPage() {
  const { id } = useParams();
  return id ? <EditProduct id={id} /> : <CreateProduct />;
}

/* ---------------------------------------------------------------- create */

function CreateProduct() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateProduct();

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreateProductValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: { name: '', sku: '', brand: '', category: undefined, description: '', sellingPrice: undefined, costPrice: undefined, variants: [{ ...emptyVariant }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });

  const generateSkus = () => {
    const base = getValues('sku').trim().toUpperCase();
    if (!base) return toast.error('Enter the product SKU first, then generate variant SKUs.');
    getValues('variants').forEach((v, i) => {
      if (!v.sku.trim() && v.color.trim()) {
        const colour = v.color.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
        setValue(`variants.${i}.sku`, `${base}-${v.size}-${colour}`, { shouldValidate: true });
      }
    });
  };

  const onSubmit = async (values: CreateProductValues) => {
    try {
      const product = await create.mutateAsync(values);
      toast.success(`"${product.name}" created`);
      navigate(`/products/${product.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const variantsError = errors.variants?.root?.message ?? (errors.variants as { message?: string } | undefined)?.message;

  return (
    <>
      <PageHeader title="Add product" description="Create a product and its sizes/colours. Initial stock is recorded as a receipt." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Section title="Product details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" required error={errors.name?.message} {...register('name')} />
            <TextField label="Product SKU" required hint="Unique style code, e.g. SH-LINEN-01" error={errors.sku?.message} {...register('sku')} />
            <TextField label="Brand" required error={errors.brand?.message} {...register('brand')} />
            <SelectField label="Category" required error={errors.category?.message} defaultValue="" {...register('category')}>
              <option value="" disabled>
                Select a category
              </option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            <TextField label="Selling price (₹)" required type="number" inputMode="decimal" step="0.01" min={0} error={errors.sellingPrice?.message} {...register('sellingPrice', { valueAsNumber: true })} />
            <TextField label="Cost price (₹)" required type="number" inputMode="decimal" step="0.01" min={0} error={errors.costPrice?.message} {...register('costPrice', { valueAsNumber: true })} />
            <TextAreaField label="Description" wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
          </div>
        </Section>

        <Section
          title="Variants"
          description="Each size/colour combination has its own SKU, stock and reorder level."
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={<Wand2 className="h-4 w-4" aria-hidden />} onClick={generateSkus}>
                Generate SKUs
              </Button>
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => append({ ...emptyVariant })}>
                Add variant
              </Button>
            </div>
          }
        >
          {variantsError && (
            <p role="alert" className="mb-3 text-sm text-clay-700">
              {variantsError}
            </p>
          )}
          <ul className="space-y-4">
            {fields.map((field, i) => {
              const e = errors.variants?.[i];
              return (
                <li key={field.id} className="rounded-lg border border-line p-3">
                  <div className="grid gap-3 sm:grid-cols-6">
                    <TextField label="Variant SKU" required wrapperClassName="sm:col-span-2" error={e?.sku?.message} {...register(`variants.${i}.sku`)} />
                    <SelectField label="Size" required error={e?.size?.message} {...register(`variants.${i}.size`)}>
                      {SIZES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </SelectField>
                    <TextField label="Colour" required error={e?.color?.message} {...register(`variants.${i}.color`)} />
                    <TextField label="Stock" required type="number" inputMode="numeric" min={0} error={e?.stock?.message} {...register(`variants.${i}.stock`, { valueAsNumber: true })} />
                    <TextField label="Reorder level" required type="number" inputMode="numeric" min={0} error={e?.reorderThreshold?.message} {...register(`variants.${i}.reorderThreshold`, { valueAsNumber: true })} />
                  </div>
                  {fields.length > 1 && (
                    <div className="mt-2 flex justify-end">
                      <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => remove(i)} aria-label={`Remove variant ${i + 1}`}>
                        Remove
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="flex justify-end gap-2">
          <Link to="/products">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" loading={create.isPending}>
            Create product
          </Button>
        </div>
      </form>
    </>
  );
}

/* ---------------------------------------------------------------- edit */

function EditProduct({ id }: { id: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: product, isLoading, error, refetch } = useProduct(id);
  const update = useUpdateProduct(id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditProductValues>({ resolver: zodResolver(editProductSchema) });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        sellingPrice: product.sellingPrice,
        costPrice: product.costPrice,
      });
    }
  }, [product, reset]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error || !product) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;

  const onSubmit = async (values: EditProductValues) => {
    try {
      await update.mutateAsync(values);
      toast.success('Product updated');
      navigate(`/products/${id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title={`Edit ${product.name}`} description="Update product details. Stock is managed from the Inventory page so every change is recorded." />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Section title="Product details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" required error={errors.name?.message} {...register('name')} />
            <TextField label="Product SKU" value={product.sku} readOnly disabled hint="SKUs cannot be changed after creation." onChange={() => undefined} />
            <TextField label="Brand" required error={errors.brand?.message} {...register('brand')} />
            <SelectField label="Category" required error={errors.category?.message} {...register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectField>
            <TextField label="Selling price (₹)" required type="number" inputMode="decimal" step="0.01" min={0} error={errors.sellingPrice?.message} {...register('sellingPrice', { valueAsNumber: true })} />
            <TextField label="Cost price (₹)" required type="number" inputMode="decimal" step="0.01" min={0} error={errors.costPrice?.message} {...register('costPrice', { valueAsNumber: true })} />
            <TextAreaField label="Description" wrapperClassName="sm:col-span-2" error={errors.description?.message} {...register('description')} />
          </div>
          <p className="mt-4 text-xs text-muted">Changing the price does not alter past sales: they keep the price they were sold at.</p>
        </Section>
        <div className="flex justify-end gap-2">
          <Link to={`/products/${id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" loading={update.isPending} disabled={!isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </>
  );
}
