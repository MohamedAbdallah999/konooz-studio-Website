import Dexie, {type EntityTable} from 'dexie';
import type {Item,Variant,Sale,SaleLine} from './types';
import {request} from './client';

class KonoozDB extends Dexie{
  items!:EntityTable<Item,'id'>;
  variants!:EntityTable<Variant,'id'>;
  sales!:EntityTable<Sale,'id'>;
  saleItems!:EntityTable<SaleLine,'id'>;
  constructor(){
    super('konooz');
    this.version(1).stores({items:'id,&modelNumber,updatedAt,syncStatus,deletedAt',variants:'id,itemId,color,updatedAt,syncStatus,deletedAt',sales:'id,createdAt,updatedAt,syncStatus',saleItems:'id,saleId,itemVariantId,updatedAt',syncQueue:'id,createdAt,tableName,recordId',meta:'key'});
    this.version(2).stores({items:'id,modelNumber,updatedAt,syncStatus,deletedAt',variants:'id,itemId,size,color,[itemId+size+color],updatedAt,syncStatus,deletedAt',sales:'id,createdAt,updatedAt,syncStatus,deletedAt',saleItems:'id,saleId,itemVariantId,updatedAt',syncQueue:'id,createdAt,tableName,recordId',meta:'key'});
    this.version(3).stores({items:'id,modelNumber,updatedAt,deletedAt',variants:'id,itemId,size,color,[itemId+size+color],updatedAt,deletedAt',sales:'id,createdAt,updatedAt,deletedAt',saleItems:'id,saleId,itemVariantId,updatedAt',syncQueue:null,meta:null});
  }
}

export const db=new KonoozDB();
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();

const variantOf=(value:Variant):Variant=>({...value,size:value.size?.trim()||'One size',stockQuantity:Number(value.stockQuantity),syncStatus:'synced'});
const lineOf=(value:SaleLine):SaleLine=>({...value,quantity:Number(value.quantity),unitPriceAtSale:Number(value.unitPriceAtSale),syncStatus:'synced'});
const saleOf=(raw:Sale):Sale=>({...raw,totalAmount:Number(raw.totalAmount),depositAmount:Number(raw.depositAmount??raw.totalAmount),paidAmount:Number(raw.paidAmount??raw.totalAmount),discountPercentage:Number(raw.discountPercentage??0),items:(raw.items??[]).map(lineOf),syncStatus:'synced'});
let activeRefresh:Promise<void>|null=null;
let stateVersion='';

export async function refreshServerState(force=false):Promise<void>{
  if(activeRefresh){await activeRefresh;if(!force)return}
  activeRefresh=(async()=>{
    const state=await request(`/state${stateVersion?`?version=${encodeURIComponent(stateVersion)}`:''}`) as {unchanged?:boolean;version:string;items?:Item[];sales?:Sale[]};
    if(state.unchanged){stateVersion=state.version;return}
    const rawItems=state.items??[],rawSales=state.sales??[];stateVersion=state.version;
    const variants:Variant[]=[];
    const items=rawItems.map(raw=>{const normalized=(raw.variants??[]).map(variantOf);variants.push(...normalized);return{...raw,price:Number(raw.price),variants:normalized,syncStatus:'synced' as const}});
    const sales=rawSales.map(saleOf),saleItems=sales.flatMap(sale=>sale.items);
    await db.transaction('rw',[db.items,db.variants,db.sales,db.saleItems],async()=>{
      await Promise.all([db.items.clear(),db.variants.clear(),db.sales.clear(),db.saleItems.clear()]);
      if(items.length)await db.items.bulkAdd(items);if(variants.length)await db.variants.bulkAdd(variants);
      if(sales.length)await db.sales.bulkAdd(sales);if(saleItems.length)await db.saleItems.bulkAdd(saleItems);
    });
  })().finally(()=>{activeRefresh=null});
  return activeRefresh;
}

const refreshAfterWrite=()=>refreshServerState(true);
const itemPayload=(input:Omit<Item,'createdAt'|'updatedAt'|'syncStatus'>,existing:Item|undefined)=>({
  id:existing?undefined:input.id,
  expectedUpdatedAt:existing?.updatedAt,
  modelNumber:input.modelNumber.trim(),price:Number(input.price),photoUrl:input.photoUrl||null,material:input.material?.trim()||null,
  variants:input.variants.map(variant=>{const old=existing?.variants.find(value=>value.id===variant.id);return{...(old?{id:variant.id,expectedUpdatedAt:old.updatedAt}:{}),size:variant.size.trim(),color:variant.color.trim(),stockQuantity:Number(variant.stockQuantity)}}),
});

export async function saveItem(input:Omit<Item,'createdAt'|'updatedAt'|'syncStatus'>){
  const existing=await db.items.get(input.id);
  const matching=(await db.items.toArray()).find(item=>item.id!==input.id&&item.modelNumber.trim().toLocaleLowerCase()===input.modelNumber.trim().toLocaleLowerCase());
  if(existing&&matching)throw new Error(`Model ${input.modelNumber.trim()} already exists.`);
  const target=existing??matching;
  const source=target&&!existing?{...input,id:target.id,variants:[...target.variants,...input.variants]}:input;
  const payload=itemPayload(source,target);
  let saved:Item;try{saved=await request(target?`/items/${target.id}`:'/items',{method:target?'PUT':'POST',body:JSON.stringify(payload)}) as Item}catch(error){await refreshAfterWrite();throw error}
  await refreshAfterWrite();return saved as Item;
}

export async function deleteItem(item:Item){await request(`/items/${item.id}`,{method:'DELETE'});await refreshAfterWrite()}

export async function createSale(lines:Array<{variant:Variant;item:Item;quantity:number;price:number}>,details:{customerName?:string;customerPhone?:string;shopName?:string;customerAddress?:string;discountPercentage?:number;depositAmount?:number}={}){
  if(!lines.length)throw new Error('Add at least one item to the sale.');
  const payload={...details,id:uid(),createdAt:now(),discountPercentage:details.discountPercentage??0,items:lines.map(line=>({id:uid(),itemVariantId:line.variant.id,quantity:line.quantity,unitPriceAtSale:line.price}))};
  const saved=await request('/sales',{method:'POST',body:JSON.stringify(payload)});await refreshAfterWrite();return saleOf(saved as Sale);
}

export async function markSalePaid(sale:Sale){
  if(sale.deletedAt)throw new Error('A refunded receipt cannot be paid.');
  if(sale.paidAmount>=sale.totalAmount)return sale;
  const saved=await request(`/sales/${sale.id}/pay`,{method:'PATCH'});await refreshAfterWrite();return saleOf({...sale,...saved} as Sale);
}

export async function refundSale(sale:Sale){
  if(sale.deletedAt)throw new Error('This sale has already been refunded.');
  await request(`/sales/${sale.id}`,{method:'DELETE'});await refreshAfterWrite();
}
