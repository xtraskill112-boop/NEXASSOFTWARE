import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Category, LowStockReport, Warehouse } from './types';

export const qk = {
  dashboard: ['dashboard'] as const,
  products: ['products'] as const,
  product: (id: string) => ['products', 'detail', id] as const,
  categories: ['products', 'categories'] as const,
  warehouses: ['warehouses'] as const,
  warehouse: (id: string) => ['warehouses', id] as const,
  movements: ['movements'] as const,
  stockLevels: ['stock-levels'] as const,
  lowStock: ['reports', 'low-stock'] as const,
  audit: ['audit-logs'] as const,
  users: ['users'] as const,
};

/** Every stock-affecting mutation should invalidate these keys. */
export const stockKeys = [qk.dashboard, qk.products, qk.warehouses, qk.movements, qk.stockLevels, qk.lowStock, qk.audit];

export function useWarehouses(includeInactive = true) {
  return useQuery({
    queryKey: [...qk.warehouses, { includeInactive }],
    queryFn: () => api.get<{ data: Warehouse[] }>('/warehouses', { includeInactive }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories,
    queryFn: () => api.get<{ data: Category[] }>('/products/categories').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useLowStockAlerts(enabled = true) {
  return useQuery({
    queryKey: [...qk.lowStock, 'alerts'],
    queryFn: () => api.get<LowStockReport>('/reports/low-stock'),
    refetchInterval: 60_000,
    enabled,
  });
}
