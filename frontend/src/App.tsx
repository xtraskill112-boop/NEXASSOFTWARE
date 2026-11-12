import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth, RequirePermission } from '@/routes/guards';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductsPage } from '@/pages/products/ProductsPage';
import { WarehousesPage } from '@/pages/warehouses/WarehousesPage';
import { WarehouseDetailPage } from '@/pages/warehouses/WarehouseDetailPage';
import { StockOperationsPage } from '@/pages/inventory/StockOperationsPage';
import { MovementsPage } from '@/pages/inventory/MovementsPage';
import { LowStockReportPage } from '@/pages/reports/LowStockReportPage';
import { AuditLogsPage } from '@/pages/audit/AuditLogsPage';
import { UsersPage } from '@/pages/users/UsersPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<RequirePermission permission="dashboard:view"><DashboardPage /></RequirePermission>} />
        <Route path="products" element={<RequirePermission permission="products:view"><ProductsPage /></RequirePermission>} />
        <Route path="warehouses" element={<RequirePermission permission="warehouses:view"><WarehousesPage /></RequirePermission>} />
        <Route path="warehouses/:id" element={<RequirePermission permission="warehouses:view"><WarehouseDetailPage /></RequirePermission>} />
        <Route
          path="inventory/operations"
          element={<RequirePermission anyOf={['inventory:stock-in', 'inventory:stock-out', 'inventory:transfer']}><StockOperationsPage /></RequirePermission>}
        />
        <Route path="inventory/movements" element={<RequirePermission permission="inventory:view"><MovementsPage /></RequirePermission>} />
        <Route path="reports/low-stock" element={<RequirePermission permission="reports:view"><LowStockReportPage /></RequirePermission>} />
        <Route path="audit-logs" element={<RequirePermission permission="audit:view"><AuditLogsPage /></RequirePermission>} />
        <Route path="users" element={<RequirePermission permission="users:manage"><UsersPage /></RequirePermission>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
