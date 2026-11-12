import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { stockKeys, useCategories, useWarehouses, qk } from '@/lib/queries';
import type { Product, ProductDetail } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button, IconButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';

const UNITS = ['pcs', 'pack', 'box', 'bag', 'bottle', 'jar', 'can', 'pouch', 'tube', 'kg', 'litre', 'carton'];

const schema = z.object({
  sku: z
    .string()
    .trim()
    .min(2, 'SKU must be at least 2 characters')
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_./]*$/, 'Letters, numbers, - _ . / only'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(160),
  category: z.string().trim().min(2, 'Category is required').max(80),
  unit: z.string().trim().min(1, 'Unit is required').max(20),
  unitPrice: z.coerce
    .number({ error: 'Enter a price' })
    .min(0, 'Price cannot be negative')
    .refine((v) => Math.round(v * 100) / 100 === v, 'At most 2 decimal places'),
  reorderLevel: z.coerce.number({ error: 'Enter a number' }).int('Whole number').min(0, 'Cannot be negative'),
  description: z.string().trim().max(1000).optional(),
  openingStock: z
    .array(z.object({ warehouseId: z.string().min(1, 'Select a warehouse'), quantity: z.coerce.number().int('Whole number').min(1, 'At least 1') }))
    .refine((rows) => new Set(rows.map((r) => r.warehouseId)).size === rows.length, 'Each warehouse can appear only once'),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function ProductFormModal({ open, onClose, product }: { open: boolean; onClose: () => void; product?: Product | ProductDetail | null }) {
  const isEdit = !!product;
  const toast = useToast();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: warehouses } = useWarehouses(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema) });
  const { fields, append, remove } = useFieldArray({ control, name: 'openingStock' });

  useEffect(() => {
    if (!open) return;
    reset(
      product
        ? {
            sku: product.sku,
            name: product.name,
            category: product.category,
            unit: product.unit,
            unitPrice: product.unitPrice,
            reorderLevel: product.reorderLevel,
            description: product.description ?? '',
            openingStock: [],
          }
        : { sku: '', name: '', category: '', unit: 'pcs', unitPrice: '' as unknown as number, reorderLevel: 10, description: '', openingStock: [] },
    );
  }, [open, product, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        sku: values.sku,
        name: values.name,
        category: values.category,
        unit: values.unit,
        unitPrice: values.unitPrice,
        reorderLevel: values.reorderLevel,
        description: values.description ? values.description : null,
      };
      return isEdit
        ? api.put<{ data: ProductDetail }>(`/products/${product!.id}`, payload)
        : api.post<{ data: ProductDetail }>('/products', { ...payload, openingStock: values.openingStock.length ? values.openingStock : undefined });
    },
    onSuccess: (res) => {
      stockKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.setQueryData(qk.product(res.data.id), res.data);
      toast.success(isEdit ? 'Product updated' : 'Product created', `${res.data.sku} · ${res.data.name}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors;
        Object.entries(fe).forEach(([path, message]) => setError(path as keyof FormInput, { message }));
        if (err.status === 409 && /SKU/i.test(err.message)) setError('sku', { message: err.message });
      }
      toast.error(isEdit ? 'Could not update product' : 'Could not create product', errorMessage(err));
    },
  });

  const usedWarehouses = new Set(fields.map((f) => f.warehouseId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={mutation.isPending}
      size="lg"
      title={isEdit ? `Edit product · ${product?.sku}` : 'Add new product'}
      description={isEdit ? 'Update catalogue details. Stock quantities change only through stock operations.' : 'Create a product in the catalogue, optionally with opening stock.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-5" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SKU" htmlFor="sku" required error={errors.sku?.message} hint="Unique code, stored in upper case">
            <Input id="sku" placeholder="KD-BEV-010" className="uppercase" invalid={!!errors.sku} {...register('sku')} />
          </Field>
          <Field label="Category" htmlFor="category" required error={errors.category?.message}>
            <Input id="category" list="category-options" placeholder="e.g. Beverages" invalid={!!errors.category} {...register('category')} />
            <datalist id="category-options">
              {categories?.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Product name" htmlFor="name" required error={errors.name?.message} className="sm:col-span-2">
            <Input id="name" placeholder="Filter Coffee Powder 500g" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Unit price (INR)" htmlFor="unitPrice" required error={errors.unitPrice?.message}>
            <Input id="unitPrice" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00" invalid={!!errors.unitPrice} {...register('unitPrice')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Unit" htmlFor="unit" required error={errors.unit?.message}>
              <Select id="unit" invalid={!!errors.unit} {...register('unit')}>
                {Array.from(new Set([...UNITS, product?.unit].filter(Boolean) as string[])).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reorder level" htmlFor="reorderLevel" required error={errors.reorderLevel?.message}>
              <Input id="reorderLevel" type="number" min="0" step="1" inputMode="numeric" invalid={!!errors.reorderLevel} {...register('reorderLevel')} />
            </Field>
          </div>
          <Field label="Description" htmlFor="description" error={errors.description?.message} className="sm:col-span-2">
            <Textarea id="description" rows={3} placeholder="Optional notes about the product, pack size, supplier…" {...register('description')} />
          </Field>
        </div>

        {!isEdit && (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Opening stock</p>
                <p className="text-xs text-ink-3">Recorded as Stock In movements with reference OPENING-STOCK.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus className="size-4" />}
                disabled={!warehouses || fields.length >= warehouses.length}
                onClick={() => {
                  const next = warehouses?.find((w) => !usedWarehouses.has(w.id));
                  append({ warehouseId: next?.id ?? '', quantity: 1 });
                }}
              >
                Add warehouse
              </Button>
            </div>
            {fields.length > 0 && (
              <div className="mt-4 space-y-3">
                {fields.map((f, idx) => (
                  <div key={f.id} className="flex items-start gap-3">
                    <Field className="flex-1" error={errors.openingStock?.[idx]?.warehouseId?.message}>
                      <Select aria-label="Warehouse" {...register(`openingStock.${idx}.warehouseId` as const)}>
                        {warehouses?.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} · {w.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field className="w-32" error={errors.openingStock?.[idx]?.quantity?.message}>
                      <Input type="number" min="1" step="1" aria-label="Quantity" {...register(`openingStock.${idx}.quantity` as const)} />
                    </Field>
                    <IconButton label="Remove row" onClick={() => remove(idx)} className="mt-1">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                ))}
                {errors.openingStock?.root?.message && <p className="text-xs font-medium text-[var(--status-critical)]">{errors.openingStock.root.message}</p>}
                {errors.openingStock?.message && <p className="text-xs font-medium text-[var(--status-critical)]">{errors.openingStock.message}</p>}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
