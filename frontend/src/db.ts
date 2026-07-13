import Dexie, { type EntityTable, type Transaction } from 'dexie';
import type { Item, Variant, Sale, SaleLine, QueueMutation } from './types';

class KonoozDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  variants!: EntityTable<Variant, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  saleItems!: EntityTable<SaleLine, 'id'>;
  syncQueue!: EntityTable<QueueMutation, 'id'>;
  meta!: EntityTable<{ key: string; value: string }, 'key'>;

  constructor() {
    super('konooz');
    this.version(1).stores({
      items: 'id,&modelNumber,updatedAt,syncStatus,deletedAt',
      variants: 'id,itemId,color,updatedAt,syncStatus,deletedAt',
      sales: 'id,createdAt,updatedAt,syncStatus',
      saleItems: 'id,saleId,itemVariantId,updatedAt',
      syncQueue: 'id,createdAt,tableName,recordId',
      meta: 'key',
    });
    this.version(2).stores({
      items: 'id,modelNumber,updatedAt,syncStatus,deletedAt',
      variants: 'id,itemId,size,color,[itemId+size+color],updatedAt,syncStatus,deletedAt',
      sales: 'id,createdAt,updatedAt,syncStatus,deletedAt',
      saleItems: 'id,saleId,itemVariantId,updatedAt',
      syncQueue: 'id,createdAt,tableName,recordId',
      meta: 'key',
    }).upgrade(async (transaction: Transaction) => {
      const legacyItems = await transaction.table('items').toArray() as Array<Item & { size?: string | null }>;
      const sizes = new Map(legacyItems.map(item => [item.id, item.size?.trim() || 'One size']));
      await transaction.table('variants').toCollection().modify((entry: Variant & { size?: string }) => {
        entry.size = entry.size?.trim() || sizes.get(entry.itemId) || 'One size';
      });
      await transaction.table('items').toCollection().modify((entry: Item & { size?: string | null }) => {
        delete entry.size;
      });
    });
  }
}

export const db = new KonoozDB();
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const normalize = (value: string) => value.trim().toLocaleLowerCase();
const combinationKey = (variant: Pick<Variant, 'size' | 'color'>) => `${normalize(variant.size)}\u0000${normalize(variant.color)}`;
const notifyDataChanged = () => {
  if (typeof window !== 'undefined') queueMicrotask(() => window.dispatchEvent(new Event('konooz:data-changed')));
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('konooz-sync');
      channel.postMessage('changed');
      channel.close();
    }
  } catch {
    // The current tab event still schedules synchronization when cross-tab messaging is unavailable.
  }
};

async function enqueue(mutation: QueueMutation) {
  const previous = await db.syncQueue.where('recordId').equals(mutation.recordId).filter(entry => entry.tableName === mutation.tableName).sortBy('createdAt');
  if (previous.length) {
    const first = previous[0]!;
    if (first.operation === 'insert' && mutation.operation === 'update') mutation.operation = 'insert';
    else if (first.operation === 'delete' && mutation.operation !== 'delete') mutation.operation = 'update';
    if (mutation.operation !== 'delete') mutation.createdAt = first.createdAt;
    await db.syncQueue.bulkDelete(previous.map(entry => entry.id));
  }
  await db.syncQueue.add(mutation);
}

export async function deleteItem(item: Item) {
  if (item.deletedAt) return;
  const time = now();
  await db.transaction('rw', [db.items, db.variants, db.saleItems, db.syncQueue], async () => {
    const variants = await db.variants.where('itemId').equals(item.id).toArray();
    const queuedItemChanges = await db.syncQueue.where('recordId').equals(item.id).filter(entry => entry.tableName === 'items').toArray();
    const variantIds = new Set(variants.map(variant => variant.id));
    const hasSaleLines = (await db.saleItems.toArray()).some(line => variantIds.has(line.itemVariantId));
    if (queuedItemChanges.some(entry => entry.operation === 'insert') && !hasSaleLines) {
      await db.items.delete(item.id);
      await db.variants.bulkDelete(variants.map(variant => variant.id));
      const queuedVariantChanges = await db.syncQueue.filter(entry => entry.tableName === 'item_variants' && variantIds.has(entry.recordId)).toArray();
      await db.syncQueue.bulkDelete([...queuedItemChanges, ...queuedVariantChanges].map(entry => entry.id));
      return;
    }
    const deletedVariants = variants.map(variant => ({ ...variant, deletedAt: time, updatedAt: time, syncStatus: 'pending' as const }));
    await db.variants.bulkPut(deletedVariants);
    const deleted = { ...item, variants: deletedVariants, deletedAt: time, updatedAt: time, syncStatus: 'pending' as const };
    await db.items.put(deleted);
    await enqueue({ id: uid(), tableName: 'items', recordId: item.id, operation: 'delete', payload: deleted as unknown as Record<string, unknown>, createdAt: time });
  });
  notifyDataChanged();
}

export async function saveItem(input: Omit<Item, 'createdAt' | 'updatedAt' | 'syncStatus'>) {
  const time = now();
  const modelNumber = input.modelNumber.trim();
  const inputExisting = await db.items.get(input.id);
  const matching = (await db.items.toArray()).find(item => normalize(item.modelNumber) === normalize(modelNumber) && item.id !== input.id);
  if (inputExisting && matching && !matching.deletedAt) {
    throw new Error(`Model ${modelNumber} already exists. Edit that model to manage its size and colour combinations.`);
  }

  const target = inputExisting ?? matching;
  const targetId = target?.id ?? input.id;
  const oldVariants = await db.variants.where('itemId').equals(targetId).toArray();
  const submitted = input.variants.map(variant => ({
    ...variant,
    itemId: targetId,
    size: variant.size.trim(),
    color: variant.color.trim(),
    stockQuantity: Number(variant.stockQuantity),
  }));
  const variantInputs = !inputExisting && target && !target.deletedAt
    ? [...oldVariants.filter(variant => !variant.deletedAt), ...submitted]
    : submitted;
  const keys = variantInputs.map(combinationKey);
  if (keys.some(key => key.startsWith('\u0000') || key.endsWith('\u0000'))) throw new Error('Every stock row needs both a size and a colour.');
  if (new Set(keys).size !== keys.length) throw new Error('Each size and colour combination must be unique within a model.');
  if (variantInputs.some(variant => !Number.isInteger(variant.stockQuantity) || variant.stockQuantity < 0)) throw new Error('Stock must be a non-negative whole number.');

  const activeVariants = variantInputs.map(variant => {
    const reusable = oldVariants.find(old => old.id === variant.id)
      ?? oldVariants.find(old => Boolean(old.deletedAt) && combinationKey(old) === combinationKey(variant));
    return {
      ...variant,
      id: reusable?.id ?? variant.id,
      itemId: targetId,
      createdAt: reusable?.createdAt ?? variant.createdAt ?? time,
      updatedAt: time,
      syncStatus: 'pending' as const,
      deletedAt: null,
    };
  });
  const item: Item = {
    id: targetId,
    modelNumber,
    price: Number(input.price),
    photoUrl: input.photoUrl || target?.photoUrl || null,
    material: input.material?.trim() || target?.material || null,
    variants: activeVariants,
    createdAt: target?.createdAt ?? time,
    updatedAt: time,
    syncStatus: 'pending',
    deletedAt: null,
  };

  await db.transaction('rw', [db.items, db.variants, db.syncQueue], async () => {
    await db.items.put(item);
    const retained = new Set(activeVariants.map(variant => variant.id));
    for (const old of oldVariants.filter(variant => !retained.has(variant.id) && !variant.deletedAt)) {
      const deleted = { ...old, deletedAt: time, updatedAt: time, syncStatus: 'pending' as const };
      await db.variants.put(deleted);
      await enqueue({ id: uid(), tableName: 'item_variants', recordId: old.id, operation: 'delete', payload: deleted as unknown as Record<string, unknown>, createdAt: time });
    }
    await enqueue({ id: uid(), tableName: 'items', recordId: item.id, operation: target ? 'update' : 'insert', payload: item as unknown as Record<string, unknown>, createdAt: time });
    for (const variant of activeVariants) {
      const old = oldVariants.find(candidate => candidate.id === variant.id);
      await db.variants.put(variant);
      await enqueue({ id: uid(), tableName: 'item_variants', recordId: variant.id, operation: old ? 'update' : 'insert', payload: variant as unknown as Record<string, unknown>, createdAt: time });
    }
  });
  notifyDataChanged();
  return item;
}

export async function createSale(lines: Array<{ variant: Variant; item: Item; quantity: number; price: number }>, details: { customerName?: string; customerPhone?: string; shopName?: string; customerAddress?: string; discountPercentage?: number; depositAmount?: number } = {}) {
  if (!lines.length) throw new Error('Add at least one item to the sale.');
  const time = now(), id = uid();
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  const discountPercentage = Math.min(100, Math.max(0, details.discountPercentage ?? 0));
  const total = Math.round(subtotal * (1 - discountPercentage / 100) * 100) / 100;
  const paidAmount = Math.round(Math.min(total, Math.max(0, details.depositAmount ?? total)) * 100) / 100;
  if (details.depositAmount !== undefined && details.depositAmount > total) throw new Error('Deposit cannot be greater than the receipt total.');
  const rows: SaleLine[] = lines.map(line => ({ id: uid(), saleId: id, itemVariantId: line.variant.id, quantity: line.quantity, unitPriceAtSale: line.price, createdAt: time, updatedAt: time, syncStatus: 'pending' }));
  const sale: Sale = { id, totalAmount: total, depositAmount: paidAmount, paidAmount, paidAt: paidAmount === total ? time : null, customerName: details.customerName?.trim() || null, customerPhone: details.customerPhone?.trim() || null, shopName: details.shopName?.trim() || null, customerAddress: details.customerAddress?.trim() || null, discountPercentage, createdAt: time, updatedAt: time, syncStatus: 'pending', items: rows };
  await db.transaction('rw', [db.sales, db.saleItems, db.variants, db.items, db.syncQueue], async () => {
    await db.sales.add(sale);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!, row = rows[index]!;
      const current = await db.variants.get(line.variant.id);
      if (!current || current.deletedAt || current.stockQuantity < line.quantity) throw new Error(`Insufficient stock for ${line.variant.size} / ${line.variant.color}`);
      await db.saleItems.add(row);
      const updated = { ...current, stockQuantity: current.stockQuantity - line.quantity, updatedAt: time, syncStatus: 'pending' as const };
      await db.variants.put(updated);
      const item = await db.items.get(current.itemId);
      if (item) await db.items.put({ ...item, variants: item.variants.map(variant => variant.id === updated.id ? updated : variant) });
    }
    await enqueue({ id: uid(), tableName: 'sales', recordId: id, operation: 'insert', payload: sale as unknown as Record<string, unknown>, createdAt: time });
  });
  notifyDataChanged();
  return sale;
}

export async function markSalePaid(sale: Sale) {
  if (sale.deletedAt) throw new Error('A refunded receipt cannot be paid.');
  if (sale.paidAmount >= sale.totalAmount) return sale;
  const time = now();
  const paid = { ...sale, paidAmount: sale.totalAmount, paidAt: time, updatedAt: time, syncStatus: 'pending' as const };
  await db.transaction('rw', [db.sales, db.syncQueue], async () => {
    await db.sales.put(paid);
    await enqueue({ id: uid(), tableName: 'sales', recordId: sale.id, operation: 'update', payload: paid as unknown as Record<string, unknown>, createdAt: time });
  });
  notifyDataChanged();
  return paid;
}

export async function refundSale(sale: Sale) {
  if (sale.deletedAt) throw new Error('This sale has already been refunded.');
  const time = now();
  await db.transaction('rw', [db.sales, db.saleItems, db.variants, db.items, db.syncQueue], async () => {
    for (const line of sale.items) {
      const variant = await db.variants.get(line.itemVariantId);
      if (!variant) throw new Error('A sold item variant could not be found.');
      const updated = { ...variant, stockQuantity: variant.stockQuantity + line.quantity, updatedAt: time, syncStatus: 'pending' as const };
      await db.variants.put(updated);
      const item = await db.items.get(variant.itemId);
      if (item) await db.items.put({ ...item, variants: item.variants.map(entry => entry.id === updated.id ? updated : entry) });
    }
    const queuedSaleChanges = await db.syncQueue.where('recordId').equals(sale.id).filter(entry => entry.tableName === 'sales').toArray();
    if (queuedSaleChanges.some(entry => entry.operation === 'insert')) {
      await db.sales.delete(sale.id);
      await db.saleItems.where('saleId').equals(sale.id).delete();
      await db.syncQueue.bulkDelete(queuedSaleChanges.map(entry => entry.id));
      return;
    }
    const refunded = { ...sale, deletedAt: time, updatedAt: time, syncStatus: 'pending' as const };
    await db.sales.put(refunded);
    await enqueue({ id: uid(), tableName: 'sales', recordId: sale.id, operation: 'delete', payload: refunded as unknown as Record<string, unknown>, createdAt: time });
  });
  notifyDataChanged();
}
