import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QueueMutation} from './types';

const storage=new Map<string,string>([['accessToken','test-token']]);
vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
vi.stubGlobal('navigator',{onLine:true});

let db:(typeof import('./db'))['db'];
let syncNow:(typeof import('./api'))['syncNow'];
const mutation=():QueueMutation=>{const id=crypto.randomUUID(),time=new Date().toISOString();return{id,tableName:'items',recordId:crypto.randomUUID(),operation:'update',payload:{id,updatedAt:time},createdAt:time}};
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const emptyPull=()=>({items:[],itemVariants:[],sales:[],saleItems:[],serverTime:new Date().toISOString()});

beforeAll(async()=>{db=(await import('./db')).db;syncNow=(await import('./api')).syncNow});
beforeEach(async()=>{db.close();await db.delete();await db.open();vi.restoreAllMocks()});

describe('network synchronization',()=>{
  it('keeps mutations queued and performs no network work while offline',async()=>{
    const queued=mutation();await db.syncQueue.add(queued);(navigator as {onLine:boolean}).onLine=false;
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await syncNow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await db.syncQueue.get(queued.id)).toBeDefined();
    (navigator as {onLine:boolean}).onLine=true;
  });

  it('pushes large offline queues in server-safe batches',async()=>{
    const mutations=Array.from({length:501},mutation);await db.syncQueue.bulkAdd(mutations);
    const batchSizes:number[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes('/sync/push')){const body=JSON.parse(String(init?.body));batchSizes.push(body.mutations.length);return json({results:body.mutations.map((entry:QueueMutation)=>({id:entry.id,status:'synced',winner:'client'}))})}
      if(url.includes('/sync/pull'))return json(emptyPull());
      throw new Error(`Unexpected request ${url}`);
    }));
    await syncNow();
    expect(batchSizes).toEqual([500,1]);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('splits sync batches by encoded request size',async()=>{
    const mutations=[mutation(),mutation()];for(const entry of mutations)entry.payload={...entry.payload,photoUrl:'x'.repeat(700_000)};await db.syncQueue.bulkAdd(mutations);
    const batchSizes:number[]=[];
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes('/sync/push')){const body=JSON.parse(String(init?.body));batchSizes.push(body.mutations.length);return json({results:body.mutations.map((entry:QueueMutation)=>({id:entry.id,status:'synced',winner:'client'}))})}
      if(url.includes('/sync/pull'))return json(emptyPull());
      throw new Error('Unexpected request');
    }));
    await syncNow();
    expect(batchSizes).toEqual([1,1]);
  });

  it('immediately reruns when a change arrives during an active pull',async()=>{
    await db.syncQueue.add(mutation());
    let releasePull!:()=>void,signalPull!:()=>void,pushes=0;
    const pullStarted=new Promise<void>(resolve=>{signalPull=resolve});
    const pullGate=new Promise<void>(resolve=>{releasePull=resolve});
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
      const url=String(input);
      if(url.includes('/sync/push')){pushes++;const body=JSON.parse(String(init?.body));return json({results:body.mutations.map((entry:QueueMutation)=>({id:entry.id,status:'synced',winner:'client'}))})}
      if(url.includes('/sync/pull')){if(pushes===1){signalPull();await pullGate}return json(emptyPull())}
      throw new Error(`Unexpected request ${url}`);
    }));
    const first=syncNow();await pullStarted;
    await db.syncQueue.add(mutation());
    const second=syncNow();releasePull();await Promise.all([first,second]);
    expect(pushes).toBe(2);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('does not resurrect optimistic local deletion when its push fails',async()=>{
    const queued=mutation(),time=new Date().toISOString();queued.operation='delete';queued.recordId=crypto.randomUUID();queued.payload={id:queued.recordId,modelNumber:'K-700',price:100,material:null,photoUrl:null,variants:[],createdAt:time,updatedAt:time,deletedAt:time,syncStatus:'pending'};
    await db.items.add(queued.payload as never);await db.syncQueue.add(queued);
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>String(input).includes('/sync/push')?json({results:[{id:queued.id,status:'error',message:'temporary failure'}]}):json({items:[{...queued.payload,deletedAt:null,syncStatus:'synced'}],itemVariants:[],sales:[],saleItems:[],serverTime:new Date().toISOString()})));
    await expect(syncNow()).rejects.toThrow('temporary failure');
    expect((await db.items.get(queued.recordId))!.deletedAt).toBe(time);
    expect(await db.syncQueue.get(queued.id)).toBeDefined();
  });

  it('drops permanently rejected stale mutations and reconciles server truth',async()=>{
    const queued=mutation(),time=new Date().toISOString();await db.syncQueue.add(queued);
    await db.items.add({id:crypto.randomUUID(),modelNumber:'STALE',price:10,variants:[],createdAt:time,updatedAt:time,syncStatus:'synced'});
    vi.stubGlobal('fetch',vi.fn(async(input:string|URL|Request)=>String(input).includes('/sync/push')?json({results:[{id:queued.id,status:'error',message:'record no longer exists',retryable:false}]}):json(emptyPull())));
    await expect(syncNow()).resolves.toBeUndefined();
    expect(await db.syncQueue.get(queued.id)).toBeUndefined();
    expect(await db.items.count()).toBe(0);
  });
});
