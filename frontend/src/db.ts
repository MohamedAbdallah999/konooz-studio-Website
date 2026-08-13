import Dexie, { type EntityTable } from 'dexie';
import type { ModelColour, Pack, ProductModel, Sale, SaleLine } from './types';
import { normalizeDecimal, compareMoney } from './money';
import { request } from './client';

class KonoozDB extends Dexie {
  models!: EntityTable<ProductModel, 'id'>;
  colours!: EntityTable<ModelColour, 'id'>;
  packs!: EntityTable<Pack, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  saleItems!: EntityTable<SaleLine, 'id'>;
  constructor() {
    super('konooz');
    this.version(1).stores({ items: 'id,&modelNumber,updatedAt,syncStatus,deletedAt', variants: 'id,itemId,color,updatedAt,syncStatus,deletedAt', sales: 'id,createdAt,updatedAt,syncStatus', saleItems: 'id,saleId,itemVariantId,updatedAt', syncQueue: 'id,createdAt,tableName,recordId', meta: 'key' });
    this.version(2).stores({ items: 'id,modelNumber,updatedAt,syncStatus,deletedAt', variants: 'id,itemId,size,color,[itemId+size+color],updatedAt,syncStatus,deletedAt', sales: 'id,createdAt,updatedAt,syncStatus,deletedAt', saleItems: 'id,saleId,itemVariantId,updatedAt', syncQueue: 'id,createdAt,tableName,recordId', meta: 'key' });
    this.version(3).stores({ items: 'id,modelNumber,updatedAt,deletedAt', variants: 'id,itemId,size,color,[itemId+size+color],updatedAt,deletedAt', sales: 'id,createdAt,updatedAt,deletedAt', saleItems: 'id,saleId,itemVariantId,updatedAt', syncQueue: null, meta: null });
    this.version(4).stores({
      items: null,
      variants: null,
      models: 'id,modelNumber,isActive,updatedAt',
      colours: 'id,modelId,name,isActive,updatedAt',
      packs: 'id,modelColourId,sizesPerPack,isActive,stockQuantity,updatedAt',
      sales: 'id,createdAt,updatedAt,deletedAt',
      saleItems: 'id,saleId,packId,updatedAt',
    });
  }
}

export const db = new KonoozDB();
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const packOf = (value: Pack): Pack => ({ ...value, sizesPerPack: Number(value.sizesPerPack), stockQuantity: Number(value.stockQuantity), isActive: value.isActive !== false, syncStatus: 'synced' });
const colourOf = (value: ModelColour): ModelColour => ({ ...value, isActive: value.isActive !== false, packs: (value.packs ?? []).map(packOf), syncStatus: 'synced' });
const modelOf = (value: ProductModel): ProductModel => ({ ...value, price: normalizeDecimal(value.price), isActive: value.isActive !== false, colours: (value.colours ?? []).map(colourOf), syncStatus: 'synced' });
const lineOf = (value: SaleLine): SaleLine => ({
  ...value,
  modelPriceAtSale: value.modelPriceAtSale == null ? null : normalizeDecimal(value.modelPriceAtSale),
  packPriceAtSale: value.packPriceAtSale == null ? null : normalizeDecimal(value.packPriceAtSale),
  lineSubtotal: value.lineSubtotal == null ? null : normalizeDecimal(value.lineSubtotal),
  discountAllocation: value.discountAllocation == null ? null : normalizeDecimal(value.discountAllocation),
  finalLineTotal: value.finalLineTotal == null ? null : normalizeDecimal(value.finalLineTotal),
  unitPriceAtSale: value.unitPriceAtSale == null ? null : normalizeDecimal(value.unitPriceAtSale),
  legacyModelPriceAtSale: value.legacyModelPriceAtSale == null ? null : normalizeDecimal(value.legacyModelPriceAtSale),
  syncStatus: 'synced',
});
const saleOf = (raw: Sale): Sale => ({ ...raw, totalAmount: normalizeDecimal(raw.totalAmount), depositAmount: normalizeDecimal(raw.depositAmount ?? raw.totalAmount), paidAmount: normalizeDecimal(raw.paidAmount ?? raw.totalAmount), discountPercentage: normalizeDecimal(raw.discountPercentage ?? 0), items: (raw.items ?? []).map(lineOf), syncStatus: 'synced' });

let activeRefresh: Promise<void> | null = null;
let stateVersion = '';

export async function clearCachedState() {
  stateVersion = '';
  await db.delete();
}

export async function refreshServerState(force = false): Promise<void> {
  if (activeRefresh) { await activeRefresh; if (!force) return; }
  activeRefresh = (async () => {
    const state = await request(`/state${stateVersion ? `?version=${encodeURIComponent(stateVersion)}` : ''}`) as { unchanged?: boolean; version: string; models?: ProductModel[]; sales?: Sale[] };
    if (state.unchanged) { stateVersion = state.version; return; }
    stateVersion = state.version;
    const colours: ModelColour[] = [], packs: Pack[] = [];
    const models = (state.models ?? []).map(raw => {
      const normalized = modelOf(raw);
      for (const colour of normalized.colours) { colours.push(colour); packs.push(...colour.packs); }
      return normalized;
    });
    const sales = (state.sales ?? []).map(saleOf), saleItems = sales.flatMap(entry => entry.items);
    await db.transaction('rw', [db.models, db.colours, db.packs, db.sales, db.saleItems], async () => {
      await Promise.all([db.models.clear(), db.colours.clear(), db.packs.clear(), db.sales.clear(), db.saleItems.clear()]);
      if (models.length) await db.models.bulkAdd(models);
      if (colours.length) await db.colours.bulkAdd(colours);
      if (packs.length) await db.packs.bulkAdd(packs);
      if (sales.length) await db.sales.bulkAdd(sales);
      if (saleItems.length) await db.saleItems.bulkAdd(saleItems);
    });
  })().finally(() => { activeRefresh = null; });
  return activeRefresh;
}

const refreshAfterWrite = () => refreshServerState(true);
const modelPayload = (input: ProductModel, existing: ProductModel | undefined) => ({
  id: existing ? undefined : input.id,
  expectedUpdatedAt: existing?.updatedAt,
  modelNumber: input.modelNumber.trim(),
  price: normalizeDecimal(input.price),
  photoUrl: input.photoUrl || null,
  material: input.material?.trim() || null,
  isActive: input.isActive,
  colours: input.colours.map(colour => {
    const oldColour = existing?.colours.find(value => value.id === colour.id);
    return {
      ...(oldColour ? { id: colour.id, expectedUpdatedAt: oldColour.updatedAt } : {}),
      name: colour.name.trim(),
      isActive: colour.isActive,
      packs: colour.packs.map(pack => {
        const oldPack = oldColour?.packs.find(value => value.id === pack.id);
        return {
          ...(oldPack ? { id: pack.id, expectedUpdatedAt: oldPack.updatedAt } : {}),
          sizesPerPack: Number(pack.sizesPerPack),
          stockQuantity: Number(pack.stockQuantity),
          isActive: colour.isActive && pack.isActive,
        };
      }),
    };
  }),
});

export async function saveModel(input: ProductModel) {
  const existing = await db.models.get(input.id);
  const payload = modelPayload(input, existing);
  let saved: ProductModel;
  try {
    saved = await request(existing ? `/models/${existing.id}` : '/models', { method: existing ? 'PUT' : 'POST', body: JSON.stringify(payload) }) as ProductModel;
  } catch (error) {
    await refreshAfterWrite();
    throw error;
  }
  await refreshAfterWrite();
  return modelOf(saved);
}

export async function deleteModel(model: ProductModel) {
  await request(`/models/${model.id}`, { method: 'DELETE' });
  await refreshAfterWrite();
}

export async function createSale(lines: Array<{ modelId: string; colourId: string; packId: string; numberOfPacks: number }>, details: { customerName?: string; customerPhone?: string; shopName?: string; customerAddress?: string; discountPercentage?: string; depositAmount?: string } = {}) {
  if (!lines.length) throw new Error('Add at least one pack to the sale.');
  const saved = await request('/sales', { method: 'POST', body: JSON.stringify({ ...details, items: lines }) });
  await refreshAfterWrite();
  return saleOf(saved as Sale);
}

export async function markSalePaid(sale: Sale) {
  if (sale.deletedAt) throw new Error('A refunded receipt cannot be paid.');
  if (compareMoney(sale.paidAmount, sale.totalAmount) >= 0) return sale;
  const saved = await request(`/sales/${sale.id}/pay`, { method: 'PATCH' });
  await refreshAfterWrite();
  return saleOf({ ...sale, ...saved } as Sale);
}

export async function refundSale(sale: Sale) {
  if (sale.deletedAt) throw new Error('This sale has already been refunded.');
  await request(`/sales/${sale.id}`, { method: 'DELETE' });
  await refreshAfterWrite();
}

export async function deleteSalePermanently(sale: Sale) {
  if (!sale.deletedAt) await request(`/sales/${sale.id}`, { method: 'DELETE' });
  await request(`/sales/${sale.id}/permanent`, { method: 'DELETE' });
  await db.transaction('rw', [db.sales, db.saleItems], async () => {
    await db.saleItems.where('saleId').equals(sale.id).delete();
    await db.sales.delete(sale.id);
  });
  await refreshAfterWrite();
}
