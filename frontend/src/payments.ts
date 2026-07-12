import type {Sale} from './types';

export const paidAmountOf=(sale:Sale)=>Number(sale.paidAmount??sale.totalAmount);
export const depositAmountOf=(sale:Sale)=>Number(sale.depositAmount??sale.totalAmount);
export const outstandingAmountOf=(sale:Sale)=>Math.max(0,sale.totalAmount-paidAmountOf(sale));

export function paymentEvents(sale:Sale){
  const events:Array<{date:string;amount:number}>=[];
  const deposit=depositAmountOf(sale);
  if(deposit>0)events.push({date:sale.createdAt,amount:deposit});
  const laterPayment=Math.max(0,paidAmountOf(sale)-deposit);
  if(laterPayment>0&&sale.paidAt)events.push({date:sale.paidAt,amount:laterPayment});
  return events;
}
