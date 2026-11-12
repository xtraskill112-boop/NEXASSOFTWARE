import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Role, User } from '@/lib/types';
import { useToast } from '@/context/ToastContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';

export const passwordRule = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const roleDescriptions: Record<Role, string> = {
  ADMIN: 'Full access including users, warehouses and permanent deletes.',
  MANAGER: 'Manage products, all stock operations incl. transfers, reports and audit logs.',
  STAFF: 'View inventory, record stock in and stock out, view reports.',
};

const baseSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(120),
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']),
});
const createSchema = baseSchema.extend({ password: passwordRule });

type CreateValues = z.infer<typeof createSchema>;

export function UserFormModal({ open, onClose, user, currentUserId }: { open: boolean; onClose: () => void; user?: User | null; currentUserId?: string }) {
  const isEdit = !!user;
  const toast = useToast();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(isEdit ? (baseSchema as unknown as typeof createSchema) : createSchema) });

  useEffect(() => {
    if (open) reset(user ? { name: user.name, email: user.email, role: user.role, password: '' } : { name: '', email: '', role: 'STAFF', password: '' });
  }, [open, user, reset]);

  const mutation = useMutation({
    mutationFn: (v: CreateValues) =>
      isEdit ? api.put<{ data: User }>(`/users/${user!.id}`, { name: v.name, email: v.email, role: v.role }) : api.post<{ data: User }>('/users', v),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.audit });
      toast.success(isEdit ? 'User updated' : 'User created', `${res.data.name} · ${res.data.email}`);
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        Object.entries(err.fieldErrors).forEach(([p, m]) => setError(p as keyof CreateValues, { message: m }));
        if (err.status === 409 && /email/i.test(err.message)) setError('email', { message: err.message });
      }
      toast.error(isEdit ? 'Could not update user' : 'Could not create user', errorMessage(err));
    },
  });

  const role = watch('role');
  const isSelf = user?.id === currentUserId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={mutation.isPending}
      title={isEdit ? 'Edit user' : 'Invite new user'}
      description={isEdit ? 'Changing a role signs the user out of existing sessions.' : 'The user signs in with the email and initial password you set.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="u-name" required error={errors.name?.message}>
          <Input id="u-name" autoComplete="off" invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Email" htmlFor="u-email" required error={errors.email?.message}>
          <Input id="u-email" type="email" autoComplete="off" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Role" htmlFor="u-role" required error={errors.role?.message} hint={isSelf ? 'You cannot change your own role.' : role ? roleDescriptions[role] : undefined}>
          {isSelf ? (
            <>
              <input type="hidden" {...register('role')} />
              <Input id="u-role" value={user?.role === 'ADMIN' ? 'Admin' : user?.role === 'MANAGER' ? 'Manager' : 'Staff'} readOnly disabled />
            </>
          ) : (
            <Select id="u-role" {...register('role')}>
              <option value="STAFF">Staff</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </Select>
          )}
        </Field>
        {!isEdit && (
          <Field label="Initial password" htmlFor="u-password" required error={errors.password?.message} hint="Min. 8 characters with letters and numbers.">
            <Input id="u-password" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

const resetSchema = z
  .object({ password: passwordRule, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  useEffect(() => {
    if (user) reset({ password: '', confirm: '' });
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (password: string) => api.post(`/users/${user!.id}/reset-password`, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.audit });
      toast.success('Password reset', `${user!.name} must sign in again with the new password.`);
      onClose();
    },
    onError: (err) => toast.error('Could not reset password', errorMessage(err)),
  });

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      locked={mutation.isPending}
      size="sm"
      title="Reset password"
      description={user ? `Set a new password for ${user.name}. Their active sessions will be signed out.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reset-form" loading={mutation.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={handleSubmit((v) => mutation.mutate(v.password))} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="r-pass" required error={errors.password?.message}>
          <Input id="r-pass" type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="r-confirm" required error={errors.confirm?.message}>
          <Input id="r-confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} />
        </Field>
      </form>
    </Modal>
  );
}
