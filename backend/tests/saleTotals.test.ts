import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { orderDiscountTotals } from '../src/saleTotals.js';

describe('order-level sale discounts', () => {
  it('applies one rounded discount after combining multiple model and colour subtotals', () => {
    const lines = ['60.06', '20.02', '49.95'].map(value => new Prisma.Decimal(value));
    const result = orderDiscountTotals(lines, new Prisma.Decimal('7.50'));
    expect(result.subtotal.toFixed(2)).toBe('130.03');
    expect(result.discount.toFixed(2)).toBe('9.75');
    expect(result.total.toFixed(2)).toBe('120.28');
    expect(lines.map(value => value.toFixed(2))).toEqual(['60.06', '20.02', '49.95']);
  });

  it('keeps all line subtotals intact at a full order discount', () => {
    const lines = [new Prisma.Decimal('0.06')];
    const result = orderDiscountTotals(lines, new Prisma.Decimal('100.00'));
    expect(result.total.toFixed(2)).toBe('0.00');
    expect(lines[0]!.toFixed(2)).toBe('0.06');
  });
});
