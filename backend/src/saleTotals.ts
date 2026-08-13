import { Prisma } from '@prisma/client';

export const roundMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const orderDiscountTotals = (lineSubtotals: Prisma.Decimal[], discountPercentage: Prisma.Decimal) => {
  const subtotal = lineSubtotals.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
  const discount = roundMoney(subtotal.mul(discountPercentage).div(100));
  return { subtotal, discount, total: subtotal.sub(discount) };
};
