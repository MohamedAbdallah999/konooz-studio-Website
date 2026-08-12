import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductModel, Sale } from './types';

const storage = new Map<string, string>([['accessToken', 'test-token']]);
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
vi.stubGlobal('navigator', { onLine: true });
let module: typeof import('./db');
const time = '2026-08-12T12:00:00.000Z';
const json = (value: unknown, status = 200) => new Response(value == null ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

beforeAll(async () => { module = await import('./db'); });
beforeEach(async () => { module.db.close(); await module.db.delete(); await module.db.open(); vi.restoreAllMocks(); });

const fixture = (): ProductModel => {
  const id = module.uid(), colourId = module.uid();
  return { id, modelNumber: 'M123', price: '10.00', isActive: true, material: null, photoUrl: null, createdAt: time, updatedAt: time, syncStatus: 'synced', colours: [{ id: colourId, modelId: id, name: 'Black', isActive: true, createdAt: time, updatedAt: time, syncStatus: 'synced', packs: [{ id: module.uid(), modelColourId: colourId, sizesPerPack: 3, stockQuantity: 5, isActive: true, createdAt: time, updatedAt: time, syncStatus: 'synced' }] }] };
};

function server(initialModels: ProductModel[] = [], initialSales: Sale[] = []) {
  let models = structuredClone(initialModels), sales = structuredClone(initialSales), version = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? 'GET';
    if (url.includes('/state') && method === 'GET') return json({ version: `v${++version}`, models, sales });
    if (url.endsWith('/models') && method === 'POST') { const body = JSON.parse(String(init?.body)), modelId = crypto.randomUUID(); const created = { ...body, id: modelId, price: String(body.price), createdAt: time, updatedAt: time, syncStatus: 'synced', colours: body.colours.map((colour: Record<string, unknown>) => { const colourId = crypto.randomUUID(); return { ...colour, id: colourId, modelId, createdAt: time, updatedAt: time, syncStatus: 'synced', packs: (colour.packs as Array<Record<string, unknown>>).map(pack => ({ ...pack, id: crypto.randomUUID(), modelColourId: colourId, createdAt: time, updatedAt: time, syncStatus: 'synced' })) }; }) }; models.push(created); return json(created, 201); }
    if (url.includes('/models/') && method === 'PUT') { const body = JSON.parse(String(init?.body)), id = url.split('/').pop()!; models = models.map(model => model.id === id ? { ...model, ...body, id, updatedAt: time } : model); return json(models.find(model => model.id === id)); }
    if (url.includes('/models/') && method === 'DELETE') { const id = url.split('/').pop(); models = models.filter(model => model.id !== id); return json(null, 204); }
    if (url.endsWith('/sales') && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      expect(body.items[0]).toEqual({ modelId: models[0]!.id, colourId: models[0]!.colours[0]!.id, packId: models[0]!.colours[0]!.packs[0]!.id, numberOfPacks: 2 });
      expect(body.items[0]).not.toHaveProperty('price'); expect(body.items[0]).not.toHaveProperty('total');
      const pack = models[0]!.colours[0]!.packs[0]!; pack.stockQuantity -= 2;
      const created: Sale = { id: module.uid(), totalAmount: '60.00', depositAmount: '20.00', paidAmount: '20.00', paidAt: null, discountPercentage: '0.00', createdAt: time, updatedAt: time, syncStatus: 'synced', items: [{ id: module.uid(), saleId: 'sale', modelIdAtSale: models[0]!.id, modelNumberAtSale: 'M123', modelPriceAtSale: '10.00', colourIdAtSale: models[0]!.colours[0]!.id, colourNameAtSale: 'Black', packId: pack.id, sizesPerPackAtSale: 3, packPriceAtSale: '30.00', numberOfPacks: 2, lineSubtotal: '60.00', discountAllocation: '0.00', finalLineTotal: '60.00', createdAt: time, updatedAt: time, syncStatus: 'synced' }] };
      sales.push(created); return json(created, 201);
    }
    if (url.endsWith('/pay') && method === 'PATCH') { const id = url.split('/').at(-2); sales = sales.map(sale => sale.id === id ? { ...sale, paidAmount: sale.totalAmount, paidAt: time } : sale); return json(sales.find(sale => sale.id === id)); }
    if (url.includes('/sales/') && method === 'DELETE') { const id = url.split('/').pop(), sale = sales.find(value => value.id === id)!; for (const line of sale.items) if (line.packId && line.numberOfPacks) models[0]!.colours[0]!.packs[0]!.stockQuantity += line.numberOfPacks; sales = sales.filter(value => value.id !== id); return json(null, 204); }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock); return fetchMock;
}

describe('model-pack CRUD and canonical sale flow', () => {
  it('creates, updates and deactivates nested models through the server', async () => {
    server(); const model = fixture(); model.syncStatus = 'pending'; model.colours[0]!.syncStatus = 'pending'; model.colours[0]!.packs[0]!.syncStatus = 'pending';
    await module.saveModel(model); const saved = (await module.db.models.toArray())[0]!; expect(saved.modelNumber).toBe('M123');
    saved.price = '12.00'; await module.saveModel(saved); expect((await module.db.models.get(saved.id))?.price).toBe('12.00');
    await module.deleteModel(saved); expect(await module.db.models.count()).toBe(0);
  });

  it('sends selections only and uses server-confirmed sale, stock, payment and refund values', async () => {
    const model = fixture(); server([model]); await module.refreshServerState(true); const colour = model.colours[0]!, pack = colour.packs[0]!;
    const sale = await module.createSale([{ modelId: model.id, colourId: colour.id, packId: pack.id, numberOfPacks: 2 }], { depositAmount: '20.00' });
    expect(sale.totalAmount).toBe('60.00'); expect((await module.db.packs.get(pack.id))?.stockQuantity).toBe(3);
    const paid = await module.markSalePaid(sale); expect(paid.paidAmount).toBe('60.00');
    await module.refundSale(paid); expect((await module.db.packs.get(pack.id))?.stockQuantity).toBe(5); expect(await module.db.sales.count()).toBe(0);
  });
});
