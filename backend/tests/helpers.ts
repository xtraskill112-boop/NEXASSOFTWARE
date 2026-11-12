import request from 'supertest';
import bcrypt from 'bcrypt';
import { Prisma, type Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { signAccessToken } from '../src/lib/jwt';

export { prisma };

export function makeApp() {
  return createApp();
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, stock_movements, stock_levels, products, warehouses, users RESTART IDENTITY CASCADE',
  );
}

let userCounter = 0;

export async function createUser(role: Role, overrides: Partial<{ email: string; name: string; password: string; isActive: boolean }> = {}) {
  userCounter += 1;
  const password = overrides.password ?? 'Passw0rd!';
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `${role.toLowerCase()} user ${userCounter}`,
      email: overrides.email ?? `${role.toLowerCase()}${userCounter}@test.local`,
      role,
      isActive: overrides.isActive ?? true,
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  const token = signAccessToken({ sub: user.id, role: user.role, ver: user.tokenVersion });
  return { user, password, token, auth: { Authorization: `Bearer ${token}` } };
}

let warehouseCounter = 0;
export async function createWarehouse(overrides: Partial<{ code: string; name: string; isActive: boolean; capacity: number }> = {}) {
  warehouseCounter += 1;
  return prisma.warehouse.create({
    data: {
      code: overrides.code ?? `WH-${warehouseCounter}`,
      name: overrides.name ?? `Warehouse ${warehouseCounter}`,
      city: 'Bengaluru',
      capacity: overrides.capacity ?? 10000,
      isActive: overrides.isActive ?? true,
    },
  });
}

let productCounter = 0;
export async function createProduct(
  overrides: Partial<{ sku: string; name: string; category: string; unitPrice: number; reorderLevel: number; isActive: boolean }> = {},
) {
  productCounter += 1;
  return prisma.product.create({
    data: {
      sku: overrides.sku ?? `TEST-${String(productCounter).padStart(4, '0')}`,
      name: overrides.name ?? `Test Product ${productCounter}`,
      category: overrides.category ?? 'General',
      unit: 'pcs',
      unitPrice: new Prisma.Decimal(overrides.unitPrice ?? 100),
      reorderLevel: overrides.reorderLevel ?? 10,
      isActive: overrides.isActive ?? true,
    },
  });
}

export async function setStock(productId: string, warehouseId: string, quantity: number) {
  return prisma.stockLevel.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, quantity },
    update: { quantity },
  });
}

export async function getStock(productId: string, warehouseId: string) {
  const row = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  return row?.quantity ?? 0;
}

export { request };
