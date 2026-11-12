import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateTime, initials } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card, PageHeader } from '@/components/ui/Common';
import { RoleBadge } from '@/components/ui/Badge';
import { passwordRule } from './users/UserModals';
import type { Permission } from '@/lib/types';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Current password is required'), newPassword: passwordRule, confirm: z.string() })
  .refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: 'Choose a password different from the current one', path: ['newPassword'] });
type Values = z.infer<typeof schema>;

const permissionLabels: Record<Permission, string> = {
  'dashboard:view': 'View dashboard',
  'products:view': 'View products',
  'products:create': 'Create products',
  'products:update': 'Edit products',
  'products:deactivate': 'Activate / deactivate products',
  'products:delete': 'Permanently delete products',
  'warehouses:view': 'View warehouses',
  'warehouses:manage': 'Manage warehouses',
  'inventory:view': 'View stock & movements',
  'inventory:stock-in': 'Record stock in',
  'inventory:stock-out': 'Record stock out',
  'inventory:transfer': 'Transfer between warehouses',
  'reports:view': 'View reports',
  'audit:view': 'View audit logs',
  'users:manage': 'Manage users',
};

export function ProfilePage() {
  const { user, replaceToken } = useAuth();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  const mutation = useMutation({
    mutationFn: (v: Values) => api.post<{ token: string }>('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: (res) => {
      replaceToken(res.token);
      reset();
      toast.success('Password changed', 'Other sessions have been signed out.');
    },
    onError: (err) => {
      if (err instanceof ApiError) Object.entries(err.fieldErrors).forEach(([p, m]) => setError(p as keyof Values, { message: m }));
      toast.error('Could not change password', errorMessage(err));
    },
  });

  if (!user) return null;

  return (
    <div>
      <PageHeader title="My Profile" description="Your account details, permissions and password." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4">
              <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-semibold text-white">{initials(user.name)}</span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-ink">{user.name}</p>
                <p className="truncate text-sm text-ink-3">{user.email}</p>
                <div className="mt-1.5">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Last sign-in</dt>
                <dd className="text-right text-ink-2">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-3">Member since</dt>
                <dd className="text-right text-ink-2">{formatDateTime(user.createdAt)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Your permissions" subtitle="Granted by your role">
            <ul className="space-y-2">
              {user.permissions.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm text-ink-2">
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--status-good)]" /> {permissionLabels[p] ?? p}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="lg:col-span-2" title="Change password" subtitle="Use at least 8 characters with letters and numbers.">
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="max-w-md space-y-4" noValidate>
            <Field label="Current password" htmlFor="cur" required error={errors.currentPassword?.message}>
              <Input id="cur" type="password" autoComplete="current-password" invalid={!!errors.currentPassword} {...register('currentPassword')} />
            </Field>
            <Field label="New password" htmlFor="new" required error={errors.newPassword?.message}>
              <Input id="new" type="password" autoComplete="new-password" invalid={!!errors.newPassword} {...register('newPassword')} />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm" required error={errors.confirm?.message}>
              <Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} />
            </Field>
            <Button type="submit" loading={mutation.isPending} icon={<KeyRound className="size-4" />}>
              Update password
            </Button>
          </form>
          <div className="mt-6 flex items-start gap-2.5 rounded-lg bg-surface-2 p-3.5 text-xs leading-relaxed text-ink-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-2" />
            Passwords are hashed with bcrypt and never stored in plain text. Changing your password signs out all your other sessions.
          </div>
        </Card>
      </div>
    </div>
  );
}
