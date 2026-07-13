import {db} from './db';
import type {Item,Variant,Sale,SaleLine,QueueMutation} from './types';

const base=import.meta.env.VITE_API_URL??'http://localhost:4000/api';
let token=sessionStorage.getItem('accessToken');
let activeSync:Promise<void>|null=null;
let syncRequested=false;

async function request(path:string,init:RequestInit={}){
  const headers=new Headers(init.headers);headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  let response=await fetch(base+path,{...init,headers,credentials:'include',cache:'no-store'});
  if(response.status===401&&path!=='/auth/refresh'){
    const refreshed=await fetch(base+'/auth/refresh',{method:'POST',credentials:'include'});
    if(refreshed.ok){token=(await refreshed.json()).accessToken;sessionStorage.setItem('accessToken',token!);headers.set('Authorization',`Bearer ${token}`);response=await fetch(base+path,{...init,headers,credentials:'include',cache:'no-store'})}
  }
  if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error??'Request failed');
  return response.status===204?null:response.json();
}

export async function login(username:string,password:string){const data=await request('/auth/login',{method:'POST',body:JSON.stringify({username,password})});token=data.accessToken;sessionStorage.setItem('accessToken',token!);return data}
export async function logout(){try{await request('/auth/logout',{method:'POST'})}finally{token=null;sessionStorage.removeItem('accessToken')}}
export const isAuthenticated=()=>Boolean(token);

const pendingKey=(table:string,id:string)=>`${table}:${id}`;
const variantOf=(value:Variant):Variant=>({...value,size:value.size?.trim()||'One size',stockQuantity:Number(value.stockQuantity),syncStatus:'synced'});
const lineOf=(value:SaleLine):SaleLine=>({...value,quantity:Number(value.quantity),unitPriceAtSale:Number(value.unitPriceAtSale),syncStatus:'synced'});
const syncBatch=(queue:QueueMutation[])=>{const batch:QueueMutation[]=[];let bytes=16;const encoder=new TextEncoder();for(const entry of queue){const entryBytes=encoder.encode(JSON.stringify(entry)).byteLength+1;if(batch.length&&bytes+entryBytes>1_000_000)break;batch.push(entry);bytes+=entryBytes;if(batch.length===500)break}return batch};

async function performSync(){
  if(!navigator.onLine||!token)return;
  let forceFullPull=false;
  const errors:string[]=[];
  const failedMutationIds=new Set<string>();
  while(navigator.onLine){
    const queue=syncBatch((await db.syncQueue.orderBy('createdAt').toArray()).filter(entry=>!failedMutationIds.has(entry.id)));
    if(!queue.length)break;
    const pushed=await request('/sync/push',{method:'POST',body:JSON.stringify({mutations:queue})});
    for(const result of pushed.results){
      const mutation=queue.find(entry=>entry.id===result.id);
      if(result.status==='error'){if(result.retryable===false){await db.syncQueue.delete(result.id);forceFullPull=true;continue}failedMutationIds.add(result.id);errors.push(result.message??'A change could not be saved');continue}
      await db.syncQueue.delete(result.id);
      if(result.winner==='server')forceFullPull=true;
      if(mutation?.tableName==='items')await db.items.update(mutation.recordId,{syncStatus:result.status});
      if(mutation?.tableName==='item_variants')await db.variants.update(mutation.recordId,{syncStatus:result.status});
      if(mutation?.tableName==='sales')await db.sales.update(mutation.recordId,{syncStatus:result.status});
      if(mutation?.tableName==='sale_items')await db.saleItems.update(mutation.recordId,{syncStatus:result.status});
    }
  }
  const remaining=await db.syncQueue.toArray();
  const pending=new Set(remaining.map((entry:QueueMutation)=>pendingKey(entry.tableName,entry.recordId)));
  const since=forceFullPull?new Date(0).toISOString():(await db.meta.get('lastSync'))?.value??new Date(0).toISOString();
  const pulled=await request(`/sync/pull?since=${encodeURIComponent(since)}`);
  await db.transaction('rw',[db.items,db.variants,db.sales,db.saleItems,db.meta],async()=>{
    const items=(pulled.items as Item[]).filter(raw=>!pending.has(pendingKey('items',raw.id))).map(raw=>({...raw,price:Number(raw.price),variants:(raw.variants??[]).map(variantOf),syncStatus:'synced' as const}));
    const variants=(pulled.itemVariants as Variant[]).filter(raw=>!pending.has(pendingKey('item_variants',raw.id))).map(variantOf);
    const saleLines:SaleLine[]=[];
    const sales=(pulled.sales as Sale[]).filter(raw=>!pending.has(pendingKey('sales',raw.id))).map(raw=>{const lines=(raw.items??[]).map(lineOf);saleLines.push(...lines);return{...raw,totalAmount:Number(raw.totalAmount),depositAmount:Number(raw.depositAmount??raw.totalAmount),paidAmount:Number(raw.paidAmount??raw.totalAmount),discountPercentage:Number(raw.discountPercentage??0),items:lines,syncStatus:'synced' as const}});
    saleLines.push(...(pulled.saleItems as SaleLine[]).filter(raw=>!pending.has(pendingKey('sale_items',raw.id))).map(lineOf));
    if(items.length)await db.items.bulkPut(items);
    if(variants.length)await db.variants.bulkPut(variants);
    if(sales.length)await db.sales.bulkPut(sales);
    if(saleLines.length)await db.saleItems.bulkPut(saleLines);
    const variantsByItem=new Map<string,Variant[]>();
    for(const variant of await db.variants.filter(entry=>!entry.deletedAt).toArray()){const group=variantsByItem.get(variant.itemId)??[];group.push(variant);variantsByItem.set(variant.itemId,group)}
    const allItems=(await db.items.toArray()).map(item=>({...item,variants:variantsByItem.get(item.id)??[]}));
    if(allItems.length)await db.items.bulkPut(allItems);
    await db.meta.put({key:'lastSync',value:pulled.serverTime});
  });
  if(errors.length)throw new Error([...new Set(errors)].join('; '));
}

async function drainSyncRequests(){let failure:unknown;do{syncRequested=false;try{await performSync();failure=undefined}catch(cause){failure=cause}}while(syncRequested&&navigator.onLine);if(failure)throw failure}
export function syncNow(){syncRequested=true;if(!activeSync)activeSync=drainSyncRequests().finally(()=>{activeSync=null});return activeSync}
export const hydrate=syncNow;
