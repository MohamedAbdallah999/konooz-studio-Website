import type { DecimalString } from './types';

export const normalizeDecimal = (value: string | number | null | undefined): DecimalString => {
  const text = String(value ?? '0').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return '0.00';
  const [whole, fraction = ''] = text.split('.');
  return `${BigInt(whole || '0')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
};

export const toCents = (value: string | number | null | undefined): bigint => {
  const normalized = normalizeDecimal(value);
  const [whole, fraction = '00'] = normalized.split('.');
  return BigInt(whole) * 100n + BigInt(fraction);
};

export const fromCents = (value: bigint): DecimalString => {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};

export const addMoney = (...values: Array<string | number | null | undefined>) => fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));
export const subtractMoney = (left: string | number, right: string | number) => fromCents(toCents(left) - toCents(right));
export const multiplyMoney = (value: string | number, multiplier: number) => fromCents(toCents(value) * BigInt(multiplier));
export const compareMoney = (left: string | number, right: string | number) => toCents(left) - toCents(right);
export const moneyNumber = (value: string | number | null | undefined) => Number(toCents(value)) / 100;
export const formatMoney = (value: string | number | null | undefined) => `${moneyNumber(value).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;

export const percentBasisPoints = (value: string | number) => {
  const text = String(value || 0);
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
};

export const discountedMoney = (subtotal: string, percentage: string | number) => {
  const cents = toCents(subtotal);
  const basisPoints = percentBasisPoints(percentage);
  const discount = (cents * basisPoints + 5_000n) / 10_000n;
  return { discount: fromCents(discount), total: fromCents(cents - discount) };
};
