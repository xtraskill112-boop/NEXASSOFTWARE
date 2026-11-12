import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, FilterX } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import type { AuditLog, Paginated } from '@/lib/types';
import { formatDateTime, humanizeAction, roleLabel } from '@/lib/format';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Table, TableSkeleton, Td, Th } from '@/components/ui/Common';

function actionTone(action: string): 'good' | 'critical' | 'warning' | 'info' | 'brand' | 'neutral' {
  if (action === 'AUTH_LOGIN_FAILED' || action === 'STOCK_OPERATION_REJECTED') return 'warning';
  if (action.endsWith('DELETED') || action.endsWith('DEACTIVATED') || action === 'STOCK_OUT') return 'critical';
  if (action.endsWith('CREATED') || action.endsWith('ACTIVATED') || action === 'STOCK_IN') return 'good';
  if (action.startsWith('STOCK')) return 'info';
  if (action.startsWith('AUTH')) return 'neutral';
  return 'brand';
}

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debounced = useDebounce(search);

  const filters = useQuery({
    queryKey: [...qk.audit, 'filters'],
    queryFn: () => api.get<{ data: { actions: string[]; entityTypes: string[] } }>('/audit-logs/filters').then((r) => r.data),
    staleTime: 300_000,
  });

  const query = {
    search: debounced,
    action,
    entityType,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : '',
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : '',
    page,
    pageSize: 25,
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [...qk.audit, 'list', query],
    queryFn: () => api.get<Paginated<AuditLog>>('/audit-logs', query),
    placeholderData: keepPreviousData,
  });

  const set = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const hasFilters = !!(debounced || action || entityType || from || to);

  return (
    <div>
      <PageHeader title="Audit Logs" description="Complete trail of sign-ins, catalogue changes, user administration and every stock operation." />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
          <SearchInput value={search} onChange={set(setSearch)} placeholder="User, action, entity id, IP…" className="xl:max-w-xs xl:flex-1" />
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
            <Select aria-label="Action" value={action} onChange={(e) => set(setAction)(e.target.value)}>
              <option value="">All actions</option>
              {filters.data?.actions.map((a) => (
                <option key={a} value={a}>
                  {humanizeAction(a)}
                </option>
              ))}
            </Select>
            <Select aria-label="Entity" value={entityType} onChange={(e) => set(setEntityType)(e.target.value)}>
              <option value="">All entities</option>
              {filters.data?.entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => set(setFrom)(e.target.value)} />
            <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => set(setTo)(e.target.value)} />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="size-4" />}
              onClick={() => {
                setSearch('');
                setAction('');
                setEntityType('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : !data?.data.length ? (
          <EmptyState title="No audit entries found" description="Try adjusting the filters." />
        ) : (
          <div className={clsx('transition-opacity', isFetching && 'opacity-70')}>
            <Table minWidth={980}>
              <thead>
                <tr>
                  <Th className="w-8" />
                  <Th>Timestamp</Th>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Description</Th>
                  <Th>Entity</Th>
                  <Th>IP address</Th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => {
                  const open = expanded === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr className={clsx('cursor-pointer hover:bg-surface-2', open && 'bg-surface-2')} onClick={() => setExpanded(open ? null : log.id)}>
                        <Td>
                          <button type="button" aria-label={open ? 'Hide details' : 'Show details'} aria-expanded={open} className="text-ink-3">
                            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        </Td>
                        <Td className="text-xs whitespace-nowrap text-ink-2">{formatDateTime(log.createdAt)}</Td>
                        <Td className="whitespace-nowrap">
                          {log.user ? (
                            <>
                              <p className="text-sm text-ink">{log.user.name}</p>
                              <p className="text-xs text-ink-3">{roleLabel[log.user.role]}</p>
                            </>
                          ) : (
                            <span className="text-sm text-ink-3">Anonymous</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={actionTone(log.action)}>{humanizeAction(log.action)}</Badge>
                        </Td>
                        <Td className="max-w-[320px] text-sm text-ink-2">
                          <span className="line-clamp-2">{log.description}</span>
                        </Td>
                        <Td className="text-xs text-ink-3">
                          {log.entityType}
                          {log.entityId && <span className="block max-w-[140px] truncate font-mono">{log.entityId}</span>}
                        </Td>
                        <Td className="font-mono text-xs text-ink-3">{log.ipAddress ?? '—'}</Td>
                      </tr>
                      {open && (
                        <tr className="bg-surface-2">
                          <td colSpan={7} className="border-b border-line px-5 pt-1 pb-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                              <div className="lg:col-span-2">
                                <p className="mb-1.5 text-xs font-semibold tracking-wider text-ink-3 uppercase">Details</p>
                                <pre className="scrollbar-thin max-h-64 overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-ink-2">
                                  {JSON.stringify(log.details ?? {}, null, 2)}
                                </pre>
                              </div>
                              <dl className="space-y-2 text-xs">
                                <div>
                                  <dt className="text-ink-3">Log ID</dt>
                                  <dd className="font-mono text-ink-2">{log.id}</dd>
                                </div>
                                {log.user && (
                                  <div>
                                    <dt className="text-ink-3">User email</dt>
                                    <dd className="text-ink-2">{log.user.email}</dd>
                                  </div>
                                )}
                                <div>
                                  <dt className="text-ink-3">User agent</dt>
                                  <dd className="break-words text-ink-2">{log.userAgent ?? '—'}</dd>
                                </div>
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Table>
            <Pagination meta={data.pagination} onPageChange={setPage} itemLabel="entries" />
          </div>
        )}
      </div>
    </div>
  );
}
