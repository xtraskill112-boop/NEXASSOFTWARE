export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';
export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER';
export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type Permission =
  | 'dashboard:view'
  | 'products:view'
  | 'products:create'
  | 'products:update'
  | 'products:deactivate'
  | 'products:delete'
  | 'warehouses:view'
  | 'warehouses:manage'
  | 'inventory:view'
  | 'inventory:stock-in'
  | 'inventory:stock-out'
  | 'inventory:transfer'
  | 'reports:view'
  | 'audit:view'
  | 'users:manage';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionUser extends User {
  permissions: Permission[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantity: number;
  city?: string;
  warehouseActive?: boolean;
  updatedAt?: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unitPrice: number;
  reorderLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalStock: number;
  stockValue: number;
  stockStatus: StockStatus;
  stockByWarehouse: WarehouseStock[];
}

export interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  value?: number;
  product: { id: string; sku: string; name: string; unit: string };
  fromWarehouse: { id: string; code: string; name: string } | null;
  toWarehouse: { id: string; code: string; name: string } | null;
  performedBy: { id: string; name: string; role: Role };
}

export interface ProductDetail extends Product {
  recentMovements: Movement[];
}

export interface Category {
  name: string;
  productCount: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string | null;
  capacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalUnits: number;
  skuCount: number;
  stockValue: number;
  lowStockCount: number;
  utilization: number | null;
}

export interface WarehouseDetail extends Warehouse {
  recentMovements: Movement[];
}

export interface StockLevelRow {
  id: string;
  quantity: number;
  updatedAt: string;
  value: number;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    unitPrice: number;
    reorderLevel: number;
    isActive: boolean;
  };
  warehouse: { id: string; code: string; name: string };
}

export interface StockOperationResult {
  movement: Movement;
  stockLevels: { warehouseId: string; warehouseCode: string; quantity: number }[];
}

export interface DashboardSummary {
  kpis: {
    totalSkus: number;
    inactiveProducts: number;
    totalInventory: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalStockValue: number;
    warehouseCount: number;
    todayMovements: number;
    activeUsers: number;
  };
  warehouses: {
    id: string;
    code: string;
    name: string;
    city: string;
    capacity: number | null;
    totalUnits: number;
    skuCount: number;
    stockValue: number;
    lowStockCount: number;
    utilization: number | null;
  }[];
  movementTrend: { date: string; stockIn: number; stockOut: number; transfer: number }[];
  categoryBreakdown: { category: string; productCount: number; units: number; value: number }[];
  lowStockItems: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    reorderLevel: number;
    totalStock: number;
    status: StockStatus;
  }[];
  recentActivities: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    description: string;
    createdAt: string;
    user: { id: string; name: string; role: Role } | null;
  }[];
  timezone: string;
  generatedAt: string;
}

export interface LowStockItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  reorderLevel: number;
  quantity: number;
  shortfall: number;
  suggestedReorderQty: number;
  estimatedReorderCost: number;
  status: 'LOW_STOCK' | 'OUT_OF_STOCK';
  stockByWarehouse: WarehouseStock[];
}

export interface LowStockReport {
  scope: { type: 'ALL_WAREHOUSES' | 'WAREHOUSE'; warehouse: { id: string; code: string; name: string } | null };
  summary: { totalItems: number; outOfStock: number; lowStock: number; estimatedReorderCost: number };
  data: LowStockItem[];
  generatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  description: string;
  user: { id: string; name: string; email: string; role: Role } | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
