import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>([['accessToken', 'test-token']]);
vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
vi.stubGlobal('navigator', { onLine: true });

let db: (typeof import('./db'))['db'], refreshServerState: (typeof import('./db'))['refreshServerState'];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
beforeAll(async () => { const module = await import('./db'); db = module.db; refreshServerState = module.refreshServerState; });
beforeEach(async () => { db.close(); await db.delete(); await db.open(); vi.restoreAllMocks(); (navigator as { onLine: boolean }).onLine = true; });

describe('server-authoritative refresh and Dexie v4', () => {
  it('replaces cached model, colour and pack records with the server snapshot', async () => {
    const time = new Date().toISOString(), modelId = crypto.randomUUID(), colourId = crypto.randomUUID(), packId = crypto.randomUUID();
    vi.stubGlobal('fetch', vi.fn(async () => json({ version: 'v1', models: [{ id: modelId, modelNumber: 'LIVE', price: '12.50', isActive: true, material: null, photoUrl: null, createdAt: time, updatedAt: time, syncStatus: 'synced', colours: [{ id: colourId, modelId, name: 'Black', isActive: true, createdAt: time, updatedAt: time, syncStatus: 'synced', packs: [{ id: packId, modelColourId: colourId, sizesPerPack: 3, stockQuantity: 4, isActive: true, createdAt: time, updatedAt: time, syncStatus: 'synced' }] }] }], sales: [] })));
    await refreshServerState(true);
    expect((await db.models.get(modelId))?.price).toBe('12.50');
    expect((await db.colours.get(colourId))?.name).toBe('Black');
    expect((await db.packs.get(packId))?.stockQuantity).toBe(4);
  });

  it('does not read or write cached data while disconnected', async () => {
    (navigator as { onLine: boolean }).onLine = false;
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(refreshServerState(true)).rejects.toThrow('Internet connection required');
    expect(fetchMock).not.toHaveBeenCalled(); expect(await db.models.count()).toBe(0);
  });
});
