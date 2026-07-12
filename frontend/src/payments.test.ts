import {describe,expect,it} from 'vitest';
import {depositAmountOf,outstandingAmountOf,paidAmountOf,paymentEvents} from './payments';
import type {Sale} from './types';

const sale=(overrides:Partial<Sale>={}):Sale=>({
  id:'sale',totalAmount:1000,depositAmount:250,paidAmount:250,paidAt:null,
  discountPercentage:0,items:[],createdAt:'2026-07-01T10:00:00.000Z',
  updatedAt:'2026-07-01T10:00:00.000Z',syncStatus:'synced',...overrides,
});

describe('payment accounting',()=>{
  it('counts a partial deposit on the sale date',()=>{
    expect(paymentEvents(sale())).toEqual([{date:'2026-07-01T10:00:00.000Z',amount:250}]);
    expect(outstandingAmountOf(sale())).toBe(750);
  });
  it('counts only the later balance on the collection date',()=>{
    const paid=sale({paidAmount:1000,paidAt:'2026-07-13T09:00:00.000Z'});
    expect(paymentEvents(paid)).toEqual([
      {date:'2026-07-01T10:00:00.000Z',amount:250},
      {date:'2026-07-13T09:00:00.000Z',amount:750},
    ]);
    expect(outstandingAmountOf(paid)).toBe(0);
  });
  it('treats legacy receipts as fully paid without double counting',()=>{
    const legacy=sale({depositAmount:undefined as unknown as number,paidAmount:undefined as unknown as number});
    expect(depositAmountOf(legacy)).toBe(1000);
    expect(paidAmountOf(legacy)).toBe(1000);
    expect(paymentEvents(legacy)).toHaveLength(1);
  });
});
