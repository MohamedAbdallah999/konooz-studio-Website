import 'fake-indexeddb/auto';
import {beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Item,Sale} from './types';

const storage=new Map<string,string>([['accessToken','test-token']]);
vi.stubGlobal('sessionStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
vi.stubGlobal('navigator',{onLine:true});
let module:typeof import('./db');
const time='2026-07-14T12:00:00.000Z',json=(value:unknown,status=200)=>new Response(value==null?null:JSON.stringify(value),{status,headers:{'content-type':'application/json'}});

beforeAll(async()=>{module=await import('./db')});
beforeEach(async()=>{module.db.close();await module.db.delete();await module.db.open();vi.restoreAllMocks()});

function server(initialItems:Item[]=[],initialSales:Sale[]=[]){
  let items=structuredClone(initialItems),sales=structuredClone(initialSales);
  const fetchMock=vi.fn(async(input:string|URL|Request,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET';
    if(url.endsWith('/items')&&method==='GET')return json(items);
    if(url.endsWith('/state')&&method==='GET')return json({items,sales});
    if(url.endsWith('/sales')&&method==='GET')return json(sales);
    if(url.endsWith('/items')&&method==='POST'){const body=JSON.parse(String(init?.body)),created={...body,createdAt:time,updatedAt:time,syncStatus:'synced',variants:body.variants.map((v:object)=>({...v,id:crypto.randomUUID(),itemId:body.id,createdAt:time,updatedAt:time,syncStatus:'synced'}))};items.push(created);return json(created,201)}
    if(url.includes('/items/')&&method==='PUT'){const body=JSON.parse(String(init?.body)),id=url.split('/').pop()!;items=items.map(item=>item.id===id?{...item,...body,id,updatedAt:time,variants:body.variants.map((v:object)=>({...v,id:(v as {id?:string}).id??crypto.randomUUID(),itemId:id,createdAt:time,updatedAt:time,syncStatus:'synced'}))}:item);return json(items.find(item=>item.id===id))}
    if(url.includes('/items/')&&method==='DELETE'){const id=url.split('/').pop();items=items.filter(item=>item.id!==id);return json(null,204)}
    if(url.endsWith('/sales')&&method==='POST'){const body=JSON.parse(String(init?.body));for(const line of body.items)for(const item of items)item.variants=item.variants.map(v=>v.id===line.itemVariantId?{...v,stockQuantity:v.stockQuantity-line.quantity}:v);const total=body.items.reduce((sum:number,line:{quantity:number;unitPriceAtSale:number})=>sum+line.quantity*line.unitPriceAtSale,0),created={...body,totalAmount:total,depositAmount:body.depositAmount??total,paidAmount:body.depositAmount??total,discountPercentage:body.discountPercentage,paidAt:null,updatedAt:time,syncStatus:'synced',items:body.items.map((line:object)=>({...line,saleId:body.id,createdAt:time,updatedAt:time,syncStatus:'synced'}))};sales.push(created);return json(created,201)}
    if(url.endsWith('/pay')&&method==='PATCH'){const id=url.split('/').at(-2);sales=sales.map(sale=>sale.id===id?{...sale,paidAmount:sale.totalAmount,paidAt:time}:sale);return json(sales.find(sale=>sale.id===id))}
    if(url.includes('/sales/')&&method==='DELETE'){const id=url.split('/').pop(),sale=sales.find(value=>value.id===id)!;for(const line of sale.items)for(const item of items)item.variants=item.variants.map(v=>v.id===line.itemVariantId?{...v,stockQuantity:v.stockQuantity+line.quantity}:v);sales=sales.filter(value=>value.id!==id);return json(null,204)}
    throw new Error(`Unexpected request ${method} ${url}`);
  });vi.stubGlobal('fetch',fetchMock);return fetchMock;
}

describe('online CRUD and canonical data flow',()=>{
  it('creates, updates, and deletes inventory only through the server',async()=>{server();const id=module.uid(),variantId=module.uid(),input={id,modelNumber:'K-100',price:100,material:'Silk',photoUrl:null,variants:[{id:variantId,itemId:id,size:'M',color:'Red',stockQuantity:5,createdAt:time,updatedAt:time,syncStatus:'pending' as const}]};await module.saveItem(input);expect((await module.db.items.get(id))?.modelNumber).toBe('K-100');const saved=(await module.db.items.get(id))!;saved.price=150;await module.saveItem(saved);expect((await module.db.items.get(id))?.price).toBe(150);await module.deleteItem(saved);expect(await module.db.items.count()).toBe(0)});

  it('uses server-confirmed sale, payment, refund, and stock values',async()=>{const id=module.uid(),variantId=module.uid(),item:Item={id,modelNumber:'K-200',price:100,material:null,photoUrl:null,createdAt:time,updatedAt:time,syncStatus:'synced',variants:[{id:variantId,itemId:id,size:'L',color:'Blue',stockQuantity:5,createdAt:time,updatedAt:time,syncStatus:'synced'}]};server([item]);await module.refreshServerState();const sale=await module.createSale([{item,variant:item.variants[0]!,quantity:2,price:100}],{depositAmount:20});expect((await module.db.variants.get(variantId))?.stockQuantity).toBe(3);const paid=await module.markSalePaid(sale);expect(paid.paidAmount).toBe(200);await module.refundSale(paid);expect((await module.db.variants.get(variantId))?.stockQuantity).toBe(5);expect(await module.db.sales.count()).toBe(0)});
});
