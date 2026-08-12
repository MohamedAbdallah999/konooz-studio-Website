import { describe, expect, it } from 'vitest';
import { depositAmountOf, outstandingAmountOf, paidAmountOf, paymentEvents } from './payments';
import type { Sale } from './types';

const sale = (overrides: Partial<Sale> = {}): Sale => ({ id: 'sale', totalAmount: '1000.00', depositAmount: '250.00', paidAmount: '250.00', paidAt: null, discountPercentage: '0.00', items: [], createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z', syncStatus: 'synced', ...overrides });

describe('payment accounting', () => {
  it('counts a partial deposit on the sale date', () => { expect(paymentEvents(sale())).toEqual([{ date: '2026-07-01T10:00:00.000Z', amount: '250.00' }]); expect(outstandingAmountOf(sale())).toBe('750.00'); });
  it('counts only the later balance on the collection date', () => { const paid = sale({ paidAmount: '1000.00', paidAt: '2026-07-13T09:00:00.000Z' }); expect(paymentEvents(paid)).toEqual([{ date: '2026-07-01T10:00:00.000Z', amount: '250.00' }, { date: '2026-07-13T09:00:00.000Z', amount: '750.00' }]); expect(outstandingAmountOf(paid)).toBe('0.00'); });
  it('treats legacy receipts as fully paid without double counting', () => { const legacy = sale({ depositAmount: undefined as unknown as string, paidAmount: undefined as unknown as string }); expect(depositAmountOf(legacy)).toBe('1000.00'); expect(paidAmountOf(legacy)).toBe('1000.00'); expect(paymentEvents(legacy)).toHaveLength(1); });
});
