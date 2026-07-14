import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';

const storage=new Map<string,string>([['accessToken','test-token']]);
vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
vi.stubGlobal('navigator',{onLine:true});

let db:(typeof import('./db'))['db'],refreshServerState:(typeof import('./db'))['refreshServerState'];
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
beforeAll(async()=>{const module=await import('./db');db=module.db;refreshServerState=module.refreshServerState});
beforeEach(async()=>{db.close();await db.delete();await db.open();vi.restoreAllMocks();(navigator as {onLine:boolean}).onLine=true});

describe('server-authoritative refresh',()=>{
  it('replaces all cached records with the current server snapshot',async()=>{
    const time=new Date().toISOString();await db.items.add({id:crypto.randomUUID(),modelNumber:'STALE',price:1,variants:[],createdAt:time,updatedAt:time,syncStatus:'synced'});
    const id=crypto.randomUUID(),variantId=crypto.randomUUID();
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>String(input).includes('/state')?json({items:[{id,modelNumber:'LIVE',price:'125.00',material:null,photoUrl:null,createdAt:time,updatedAt:time,syncStatus:'synced',variants:[{id:variantId,itemId:id,size:'M',color:'Red',stockQuantity:4,createdAt:time,updatedAt:time,syncStatus:'synced'}]}],sales:[]}):json({items:[],sales:[]})));
    await refreshServerState();
    expect((await db.items.toArray()).map(value=>value.modelNumber)).toEqual(['LIVE']);
    expect((await db.variants.get(variantId))?.stockQuantity).toBe(4);
  });

  it('does not read or write cached data while disconnected',async()=>{
    (navigator as {onLine:boolean}).onLine=false;const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(refreshServerState()).rejects.toThrow('Internet connection required');
    expect(fetchMock).not.toHaveBeenCalled();expect(await db.items.count()).toBe(0);
  });
});

