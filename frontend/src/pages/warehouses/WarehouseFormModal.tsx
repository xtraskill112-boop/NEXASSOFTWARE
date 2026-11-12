import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '@/lib/api';
import { stockKeys } from '@/lib/queries';
import type { Warehouse } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'At least 2 characters')
    .max(20)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_]*$/, 'Letters, numbers, - and _ only'),
  name: z.string().trim().min(2, 'At least 2 characters').max(120),
  city: z.string().trim().min(2, 'City is required').max(80),
  address: z.string().trim().max(255).optional(),
  capacity: z
    .union([z.literal(''), z.coerce.number().int('Whole number').min(1, 'At least 1')])
    .optional(),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function WarehouseFormModal({ open, onClose, warehouse }: { open: boolean; onClose: () => void; warehouse?: Warehouse | null }) {
  const isEdit = !!warehouse;
  const toast = useToast();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset(
      warehouse
        ? { code: warehouse.code, name: warehouse.name, city: warehouse.city, address: warehouse.address ?? '', capacity: warehouse.capacity ?? '' }
        : { code: '', name: '', city: '', address: '', capacity: '' },
    );
  }, [open, warehouse, reset]);

  const mutation = useMutation({
    mutationFn: (v: FormValues) => {
      const payload = { code: v.code, name: v.name, city: v.city, address: v.address || null, capacity: v.capacity === '' || v.capacity === undefined ? null : v.capacity };
      return isEdit ? api.put<{ data: Warehouse }>(`/warehouses/${warehouse!.id}`, payload) : api.post<{ data: Warehouse }>('/warehouses', payload);
    },
    onSuccess: (res) => {
      stockKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(isEdit ? 'Warehouse updated' : 'Warehouse created', `${res.data.code} · ${res.data.name}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        Object.entries(err.fieldErrors).forEach(([p, m]) => setError(p as keyof FormInput, { message: m }));
        if (err.status === 409 && /code/i.test(err.message)) setError('code', { message: err.message });
      }
      toast.error(isEdit ? 'Could not update warehouse' : 'Could not create warehouse', errorMessage(err));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={mutation.isPending}
      title={isEdit ? `Edit warehouse · ${warehouse?.code}` : 'Add warehouse'}
      description="Warehouse codes appear on stock movements and reports."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="warehouse-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create warehouse'}
          </Button>
        </>
      }
    >
      <form id="warehouse-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Code" htmlFor="wh-code" required error={errors.code?.message}>
          <Input id="wh-code" className="uppercase" placeholder="HBL-NTH" invalid={!!errors.code} {...register('code')} />
        </Field>
        <Field label="City" htmlFor="wh-city" required error={errors.city?.message}>
          <Input id="wh-city" placeholder="Hubballi" invalid={!!errors.city} {...register('city')} />
        </Field>
        <Field label="Warehouse name" htmlFor="wh-name" required error={errors.name?.message} className="sm:col-span-2">
          <Input id="wh-name" placeholder="Hubballi North Warehouse" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Address" htmlFor="wh-address" error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="wh-address" rows={2} {...register('address')} />
        </Field>
        <Field label="Capacity (units)" htmlFor="wh-capacity" error={errors.capacity?.message} hint="Used for utilisation. Leave blank if not tracked.">
          <Input id="wh-capacity" type="number" min="1" step="1" invalid={!!errors.capacity} {...register('capacity')} />
        </Field>
      </form>
    </Modal>
  );
}
