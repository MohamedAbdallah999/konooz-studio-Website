import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {createSale,db,deleteItem,markSalePaid,now,refundSale,saveItem,uid} from './db';
import type {Item,Variant} from './types';

const variant=(itemId:string,size='M',color='Red',stockQuantity=5):Variant=>({id:uid(),itemId,size,color,stockQuantity,createdAt:now(),updatedAt:now(),syncStatus:'pending'});
const item=(modelNumber:string,size='M',color='Red',stockQuantity=5):Item=>{const id=uid(),time=now();return{id,modelNumber,price:100,material:'Silk',photoUrl:null,variants:[variant(id,size,color,stockQuantity)],createdAt:time,updatedAt:time,syncStatus:'pending'}};

beforeEach(async()=>{db.close();await db.delete();await db.open()});

describe('inventory CRUD',()=>{
  it('merges the same model into unique size and colour stock combinations',async()=>{
    await saveItem(item('K-100','M','Red',2));
    await saveItem(item('k-100','L','Blue',3));
    const items=await db.items.toArray(),variants=await db.variants.filter(entry=>!entry.deletedAt).toArray();
    expect(items).toHaveLength(1);
    expect(variants.map(entry=>[entry.size,entry.color,entry.stockQuantity])).toEqual(expect.arrayContaining([['M','Red',2],['L','Blue',3]]));
  });

  it('rejects a duplicate size and colour pair',async()=>{
    const model=item('K-200');model.variants.push(variant(model.id,'m','red',4));
    await expect(saveItem(model)).rejects.toThrow('Each size and colour combination must be unique');
  });

  it('coalesces repeated edits into the latest insert payload',async()=>{
    const saved=await saveItem(item('K-300'));
    saved.variants[0]!.stockQuantity=9;
    await saveItem(saved);
    const queued=await db.syncQueue.where('recordId').equals(saved.variants[0]!.id).toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.operation).toBe('insert');
    expect(queued[0]!.payload.stockQuantity).toBe(9);
  });

  it('fully removes a never-synced model and its queued variants',async()=>{
    const saved=await saveItem(item('K-400'));
    await deleteItem(saved);
    expect(await db.items.count()).toBe(0);
    expect(await db.variants.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});

describe('sales CRUD',()=>{
  it('decrements the exact combination and cancels a never-synced refunded sale',async()=>{
    const saved=await saveItem(item('K-500','XL','Green',5)),selected=saved.variants[0]!;
    const sale=await createSale([{item:saved,variant:selected,quantity:2,price:100}]);
    expect((await db.variants.get(selected.id))!.stockQuantity).toBe(3);
    await refundSale(sale);
    expect((await db.variants.get(selected.id))!.stockQuantity).toBe(5);
    expect(await db.sales.count()).toBe(0);
    expect(await db.saleItems.count()).toBe(0);
    expect(await db.syncQueue.filter(entry=>entry.tableName==='sales').count()).toBe(0);
  });

  it('coalesces payment of an offline sale into its insert',async()=>{
    const saved=await saveItem(item('K-600')),selected=saved.variants[0]!;
    const sale=await createSale([{item:saved,variant:selected,quantity:1,price:100}],{depositAmount:20});
    await markSalePaid(sale);
    const queued=await db.syncQueue.filter(entry=>entry.tableName==='sales'&&entry.recordId===sale.id).toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]!.operation).toBe('insert');
    expect(queued[0]!.payload.paidAmount).toBe(100);
  });
});
