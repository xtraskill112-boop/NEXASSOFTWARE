import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { KeyRound, Pencil, Power, PowerOff, UserPlus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { Paginated, User } from '@/lib/types';
import { formatDateTime, initials, timeAgo } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { ActiveBadge, RoleBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';
import { ResetPasswordModal, UserFormModal } from './UserModals';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);

  const query = { search: debounced, role, status, page, pageSize: 20 };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...qk.users, query],
    queryFn: () => api.get<Paginated<User>>('/users', query),
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch<{ data: User }>(`/users/${id}/status`, { isActive }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.audit });
      toast.success(res.data.isActive ? 'User activated' : 'User deactivated', res.data.email);
    },
    onError: (err) => toast.error('Status change failed', errorMessage(err)),
  });

  const toggle = async (u: User) => {
    const ok = await confirm({
      title: u.isActive ? 'Deactivate user?' : 'Activate user?',
      message: u.isActive ? `${u.name} will be signed out immediately and will not be able to sign in until re-activated.` : `${u.name} will be able to sign in again.`,
      confirmLabel: u.isActive ? 'Deactivate' : 'Activate',
      tone: u.isActive ? 'danger' : 'primary',
    });
    if (ok) statusMutation.mutate({ id: u.id, isActive: !u.isActive });
  };

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Control who can access StockSense and what they can do."
        actions={
          <Button
            icon={<UserPlus className="size-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add user
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { role: 'Admin', text: 'Everything, incl. users, warehouses & permanent deletes' },
          { role: 'Manager', text: 'Products, stock in/out/transfer, reports, audit logs' },
          { role: 'Staff', text: 'View inventory, stock in & stock out, reports' },
        ].map((r) => (
          <div key={r.role} className="card p-4">
            <p className="text-sm font-semibold text-ink">{r.role}</p>
            <p className="mt-1 text-xs text-ink-3">{r.text}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name or email…"
            className="sm:max-w-xs sm:flex-1"
          />
          <div className="grid grid-cols-2 gap-3 sm:w-80">
            <Select
              aria-label="Role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="STAFF">Staff</option>
            </Select>
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="No users found" />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-70')}>
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last sign-in</Th>
                  <Th>Created</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id} className={clsx('hover:bg-surface-2', !u.isActive && 'opacity-60')}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-ink-2">{initials(u.name)}</span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {u.name} {isMe && <span className="text-xs font-normal text-ink-3">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-ink-3">{u.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <RoleBadge role={u.role} />
                      </Td>
                      <Td>
                        <ActiveBadge active={u.isActive} />
                      </Td>
                      <Td className="text-xs text-ink-2" >
                        <span title={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : undefined}>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span>
                      </Td>
                      <Td className="text-xs text-ink-3">{formatDateTime(u.createdAt)}</Td>
                      <Td align="right">
                        <div className="flex justify-end gap-0.5">
                          <IconButton
                            label="Edit user"
                            onClick={() => {
                              setEditing(u);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton label="Reset password" onClick={() => setResetting(u)}>
                            <KeyRound className="size-4" />
                          </IconButton>
                          <IconButton label={u.isActive ? 'Deactivate user' : 'Activate user'} disabled={isMe || statusMutation.isPending} onClick={() => toggle(u)}>
                            {u.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                          </IconButton>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination meta={data.pagination} onPageChange={setPage} itemLabel="users" />
          </div>
        )}
      </div>

      <UserFormModal open={formOpen} onClose={() => setFormOpen(false)} user={editing} currentUserId={me?.id} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
