import type { Sale } from './types';
import { addMoney, compareMoney, normalizeDecimal, subtractMoney } from './money';

export const paidAmountOf = (sale: Sale) => normalizeDecimal(sale.paidAmount ?? sale.totalAmount);
export const depositAmountOf = (sale: Sale) => normalizeDecimal(sale.depositAmount ?? sale.totalAmount);
export const outstandingAmountOf = (sale: Sale) => compareMoney(sale.totalAmount, paidAmountOf(sale)) > 0 ? subtractMoney(sale.totalAmount, paidAmountOf(sale)) : '0.00';

export function paymentEvents(sale: Sale) {
  const events: Array<{ date: string; amount: string }> = [];
  const deposit = depositAmountOf(sale);
  if (compareMoney(deposit, '0') > 0) events.push({ date: sale.createdAt, amount: deposit });
  const laterPayment = compareMoney(paidAmountOf(sale), deposit) > 0 ? subtractMoney(paidAmountOf(sale), deposit) : '0.00';
  if (compareMoney(laterPayment, '0') > 0 && sale.paidAt) events.push({ date: sale.paidAt, amount: laterPayment });
  return events;
}

export const collectedRevenue = (sales: Sale[]) => sales.flatMap(paymentEvents).reduce((sum, event) => addMoney(sum, event.amount), '0.00');
