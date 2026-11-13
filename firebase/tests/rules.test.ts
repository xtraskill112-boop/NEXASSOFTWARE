/**
 * Firestore security rules tests (run against the Firestore emulator):
 *   npm run test:rules
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;

const P = 'prod-1';
const W1 = 'wh-1';
const W2 = 'wh-2';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-stocksense',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});

after(async () => {
  await env.cleanup();
});

const user = (role: string, isActive = true, name = `${role} user`) => ({ name, email: `${name.replace(/\s/g, '').toLowerCase()}@test.local`, role, isActive, lastLoginAt: null, createdAt: null, updatedAt: null });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/setup'), { adminUid: 'admin', createdAt: null });
    await setDoc(doc(db, 'users/admin'), user('ADMIN'));
    await setDoc(doc(db, 'users/admin2'), user('ADMIN', true, 'second admin'));
    await setDoc(doc(db, 'users/manager'), user('MANAGER'));
    await setDoc(doc(db, 'users/staff'), user('STAFF'));
    await setDoc(doc(db, 'users/inactive'), user('STAFF', false, 'gone user'));
    await setDoc(doc(db, `warehouses/${W1}`), { code: 'BLR', name: 'Bengaluru', city: 'Bengaluru', address: null, capacity: 1000, isActive: true, createdAt: null, updatedAt: null });
    await setDoc(doc(db, `warehouses/${W2}`), { code: 'MYS', name: 'Mysuru', city: 'Mysuru', address: null, capacity: 1000, isActive: true, createdAt: null, updatedAt: null });
    await setDoc(doc(db, `products/${P}`), { sku: 'KD-1', name: 'Coffee', description: null, category: 'Beverages', unit: 'pack', unitPrice: 100, reorderLevel: 10, isActive: true, createdAt: null, updatedAt: null });
    await setDoc(doc(db, 'product_skus/KD-1'), { productId: P });
    await setDoc(doc(db, `stock_levels/${P}_${W1}`), { productId: P, warehouseId: W1, quantity: 10, lastMovementId: 'seed', updatedAt: null });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

/** Builds the standard stock-operation batch: movement + balance change(s) + audit entry. */
function stockBatch(
  db: Firestore,
  uid: string,
  m: { id: string; type: 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER'; quantity: number; from?: string | null; to?: string | null },
  levels: { warehouseId: string; quantity: number }[],
  opts: { skipMovement?: boolean } = {},
) {
  const b = writeBatch(db);
  if (!opts.skipMovement) {
    b.set(doc(db, `movements/${m.id}`), {
      type: m.type, productId: P, fromWarehouseId: m.from ?? null, toWarehouseId: m.to ?? null, quantity: m.quantity,
      reference: 'REF-1', notes: null, performedById: uid, createdAt: serverTimestamp(),
    });
  }
  for (const l of levels) {
    b.set(doc(db, `stock_levels/${P}_${l.warehouseId}`), { productId: P, warehouseId: l.warehouseId, quantity: l.quantity, lastMovementId: m.id, updatedAt: serverTimestamp() });
  }
  b.set(doc(db, `audit_logs/${m.id}-audit`), { userId: uid, action: m.type, entityType: 'StockMovement', entityId: m.id, details: { quantity: m.quantity }, ipAddress: null, userAgent: null, createdAt: serverTimestamp() });
  return b;
}

describe('authentication & account state', () => {
  it('denies all data access to signed-out visitors (except the setup flag)', async () => {
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, `products/${P}`)));
    await assertFails(getDocs(collection(anon, 'stock_levels')));
    await assertSucceeds(getDoc(doc(anon, 'config/setup')));
  });

  it('denies deactivated users, but lets them read their own profile', async () => {
    await assertFails(getDoc(doc(as('inactive'), `products/${P}`)));
    await assertSucceeds(getDoc(doc(as('inactive'), 'users/inactive')));
  });

  it('allows active users to read catalogue and stock', async () => {
    await assertSucceeds(getDoc(doc(as('staff'), `products/${P}`)));
    await assertSucceeds(getDocs(collection(as('staff'), 'stock_levels')));
  });
});

describe('first-time setup', () => {
  it('lets the first account become ADMIN exactly once', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'config/setup'));
    });
    const db = as('founder');
    const b = writeBatch(db);
    b.set(doc(db, 'users/founder'), user('ADMIN', true, 'founder'));
    b.set(doc(db, 'config/setup'), { adminUid: 'founder', createdAt: serverTimestamp() });
    await assertSucceeds(b.commit());

    const late = as('latecomer');
    const b2 = writeBatch(late);
    b2.set(doc(late, 'users/latecomer'), user('ADMIN', true, 'latecomer'));
    b2.set(doc(late, 'config/setup'), { adminUid: 'latecomer', createdAt: serverTimestamp() });
    await assertFails(b2.commit());
  });

  it('does not let a signed-in stranger self-register as ADMIN after setup', async () => {
    await assertFails(setDoc(doc(as('stranger'), 'users/stranger'), user('ADMIN', true, 'stranger')));
    await assertFails(setDoc(doc(as('stranger'), 'users/stranger'), user('STAFF', true, 'stranger')));
  });
});

describe('role-based access', () => {
  const newProduct = (db: Firestore, id: string, sku: string, withIndex = true) => {
    const b = writeBatch(db);
    b.set(doc(db, `products/${id}`), { sku, name: 'New Product', description: null, category: 'Misc', unit: 'pcs', unitPrice: 5, reorderLevel: 1, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (withIndex) b.set(doc(db, `product_skus/${sku}`), { productId: id });
    return b;
  };

  it('blocks STAFF from creating products', async () => {
    await assertFails(newProduct(as('staff'), 'p-staff', 'ST-1').commit());
  });

  it('lets MANAGER create products only together with a unique SKU index entry', async () => {
    await assertSucceeds(newProduct(as('manager'), 'p-new', 'NEW-1').commit());
    await assertFails(newProduct(as('manager'), 'p-no-index', 'NEW-2', false).commit());
    await assertFails(newProduct(as('manager'), 'p-dup', 'KD-1').commit()); // SKU already taken
  });

  it('rejects invalid product data', async () => {
    const db = as('manager');
    const b = writeBatch(db);
    b.set(doc(db, 'products/p-bad'), { sku: 'BAD-1', name: 'Bad', description: null, category: 'Misc', unit: 'pcs', unitPrice: -1, reorderLevel: 1, isActive: true, createdAt: null, updatedAt: null });
    b.set(doc(db, 'product_skus/BAD-1'), { productId: 'p-bad' });
    await assertFails(b.commit());
  });

  it('restricts warehouse management and user management to ADMIN', async () => {
    const mk = (db: Firestore) => {
      const b = writeBatch(db);
      b.set(doc(db, 'warehouses/wh-new'), { code: 'HBL', name: 'Hubballi', city: 'Hubballi', address: null, capacity: null, isActive: true, createdAt: null, updatedAt: null });
      b.set(doc(db, 'warehouse_codes/HBL'), { warehouseId: 'wh-new' });
      return b;
    };
    await assertFails(mk(as('manager')).commit());
    await assertSucceeds(mk(as('admin')).commit());
    await assertFails(setDoc(doc(as('manager'), 'users/newbie'), user('STAFF', true, 'newbie')));
    await assertSucceeds(setDoc(doc(as('admin'), 'users/newbie'), user('STAFF', true, 'newbie')));
  });

  it('prevents privilege escalation and admin self-lockout', async () => {
    await assertFails(updateDoc(doc(as('staff'), 'users/staff'), { role: 'ADMIN' }));
    await assertFails(updateDoc(doc(as('inactive'), 'users/inactive'), { isActive: true }));
    await assertFails(updateDoc(doc(as('admin'), 'users/admin'), { role: 'STAFF' }));
    await assertFails(updateDoc(doc(as('admin'), 'users/admin'), { isActive: false }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/staff'), { role: 'MANAGER' }));
    await assertSucceeds(updateDoc(doc(as('admin2'), 'users/admin'), { role: 'MANAGER' }));
    await assertSucceeds(updateDoc(doc(as('staff'), 'users/staff'), { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('limits audit log reading to ADMIN and MANAGER', async () => {
    await assertFails(getDocs(collection(as('staff'), 'audit_logs')));
    await assertSucceeds(getDocs(collection(as('manager'), 'audit_logs')));
  });
});

describe('stock integrity', () => {
  it('allows STAFF stock in with a matching ledger movement', async () => {
    await assertSucceeds(stockBatch(as('staff'), 'staff', { id: 'm-in', type: 'STOCK_IN', quantity: 5, to: W1 }, [{ warehouseId: W1, quantity: 15 }]).commit());
  });

  it('allows stock out down to exactly zero', async () => {
    await assertSucceeds(stockBatch(as('staff'), 'staff', { id: 'm-out', type: 'STOCK_OUT', quantity: 10, from: W1 }, [{ warehouseId: W1, quantity: 0 }]).commit());
  });

  it('never allows a negative balance', async () => {
    await assertFails(stockBatch(as('staff'), 'staff', { id: 'm-neg', type: 'STOCK_OUT', quantity: 11, from: W1 }, [{ warehouseId: W1, quantity: -1 }]).commit());
  });

  it('rejects balance changes without a new ledger movement', async () => {
    await assertFails(stockBatch(as('staff'), 'staff', { id: 'm-ghost', type: 'STOCK_IN', quantity: 5, to: W1 }, [{ warehouseId: W1, quantity: 15 }], { skipMovement: true }).commit());
    await assertFails(updateDoc(doc(as('admin'), `stock_levels/${P}_${W1}`), { quantity: 999 }));
  });

  it('rejects a balance change that does not match the movement quantity', async () => {
    await assertFails(stockBatch(as('staff'), 'staff', { id: 'm-mismatch', type: 'STOCK_OUT', quantity: 2, from: W1 }, [{ warehouseId: W1, quantity: 9 }]).commit());
  });

  it('rejects a movement without its balance change', async () => {
    await assertFails(stockBatch(as('staff'), 'staff', { id: 'm-orphan', type: 'STOCK_IN', quantity: 5, to: W1 }, []).commit());
  });

  it('rejects movements recorded on behalf of another user', async () => {
    await assertFails(stockBatch(as('staff'), 'manager', { id: 'm-spoof', type: 'STOCK_IN', quantity: 5, to: W1 }, [{ warehouseId: W1, quantity: 15 }]).commit());
  });

  it('allows transfers only for MANAGER/ADMIN, moving stock between both balances', async () => {
    const transfer = (uid: string, id: string) =>
      stockBatch(as(uid), uid, { id, type: 'TRANSFER', quantity: 4, from: W1, to: W2 }, [{ warehouseId: W1, quantity: 6 }, { warehouseId: W2, quantity: 4 }]).commit();
    await assertFails(transfer('staff', 'm-tr-staff'));
    await assertSucceeds(transfer('manager', 'm-tr-mgr'));
  });

  it('blocks stock operations on inactive products', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `products/${P}`), { isActive: false });
    });
    await assertFails(stockBatch(as('staff'), 'staff', { id: 'm-inactive', type: 'STOCK_IN', quantity: 1, to: W1 }, [{ warehouseId: W1, quantity: 11 }]).commit());
  });

  it('keeps the ledger and audit log immutable', async () => {
    await assertSucceeds(stockBatch(as('manager'), 'manager', { id: 'm-keep', type: 'STOCK_IN', quantity: 1, to: W1 }, [{ warehouseId: W1, quantity: 11 }]).commit());
    await assertFails(updateDoc(doc(as('admin'), 'movements/m-keep'), { quantity: 100 }));
    await assertFails(deleteDoc(doc(as('admin'), 'movements/m-keep')));
    await assertFails(updateDoc(doc(as('admin'), 'audit_logs/m-keep-audit'), { action: 'NOTHING' }));
    await assertFails(deleteDoc(doc(as('admin'), 'audit_logs/m-keep-audit')));
  });

  it('only accepts audit entries written by the acting user', async () => {
    await assertFails(
      setDoc(doc(as('staff'), 'audit_logs/fake'), { userId: 'admin', action: 'PRODUCT_DELETED', entityType: 'Product', entityId: P, details: null, ipAddress: null, userAgent: null, createdAt: serverTimestamp() }),
    );
  });
});
