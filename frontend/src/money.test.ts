import { describe, expect, it } from 'vitest';
import { discountedMoney, multiplyMoney } from './money';

describe('decimal-safe display calculations', () => {
  it('calculates pack and line totals in integer cents', () => { expect(multiplyMoney('10.10', 3)).toBe('30.30'); expect(multiplyMoney(multiplyMoney('10.10', 3), 2)).toBe('60.60'); });
  it('rounds percentage discounts to cents', () => { expect(discountedMoney('100.05', '12.50')).toEqual({ discount: '12.51', total: '87.54' }); });
});
