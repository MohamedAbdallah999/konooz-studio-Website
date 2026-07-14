import {useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
import {TrendingUp,ReceiptText,Clock3} from 'lucide-react';
import {db,refundSale,markSalePaid} from '../db';
import type {Sale} from '../types';
import {Receipt} from './Receipt';
import {paidAmountOf,outstandingAmountOf,paymentEvents} from '../payments';
import {AnimatedTitle} from '../components/AnimatedTitle';

export function Sales(){
  const [selected,setSelected]=useState<Sale|null>(null);
  const sales=useLiveQuery(()=>db.sales.filter(s=>!s.deletedAt).reverse().sortBy('createdAt'))??[];
  const groups=new Map<string,number>();
  for(const event of sales.flatMap(paymentEvents)){const d=new Date(event.date).toLocaleDateString('en',{month:'short',day:'numeric'});groups.set(d,(groups.get(d)??0)+event.amount)}
  const chart=[...groups].slice(-14).map(([date,total])=>({date,total}));
  const revenue=sales.reduce((x,s)=>x+paidAmountOf(s),0),outstanding=sales.reduce((x,s)=>x+outstandingAmountOf(s),0);
  const showReceipt=async(sale:Sale)=>{const lines=sale.items?.length?sale.items:await db.saleItems.where('saleId').equals(sale.id).toArray();const detailed=await Promise.all(lines.map(async line=>{const variant=await db.variants.get(line.itemVariantId),item=variant?await db.items.get(variant.itemId):undefined;return {...line,itemVariant:variant?{...variant,item}:undefined}}));setSelected({...sale,depositAmount:Number(sale.depositAmount??sale.totalAmount),paidAmount:paidAmountOf(sale),items:detailed})};
  const refund=async()=>{if(!selected||!confirm(`Refund receipt #${selected.id.slice(0,8).toUpperCase()}? The sold items will return to stock and all collected revenue for this receipt will be removed.`))return;await refundSale(selected);setSelected(null)};
  const markPaid=async()=>{if(!selected||!confirm(`Mark the outstanding ${Math.max(0,selected.totalAmount-selected.paidAmount).toLocaleString()} EGP as paid? This amount will be added to revenue.`))return;setSelected(await markSalePaid(selected))};
  if(selected)return <Receipt sale={selected} onClose={()=>setSelected(null)} onRefund={refund} onMarkPaid={selected.paidAmount<selected.totalAmount?markPaid:undefined}/>;
  return <>
    <section className="section-head"><div><p className="eyebrow">THE LEDGER</p><AnimatedTitle>Sales & reporting</AnimatedTitle><p>Revenue includes only money received. Open a receipt to collect its outstanding balance.</p></div></section>
    <div className="report-stats three"><article><TrendingUp/><span>Collected revenue</span><strong>{revenue.toLocaleString()} EGP</strong></article><article><Clock3/><span>Outstanding payments</span><strong>{outstanding.toLocaleString()} EGP</strong></article><article><ReceiptText/><span>Receipts</span><strong>{sales.length}</strong></article></div>
    <section className="chart-card"><header><div><p className="eyebrow">REVENUE RHYTHM</p><h3>Recent collected sales</h3></div></header><div className="chart"><ResponsiveContainer><BarChart data={chart}><XAxis dataKey="date" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#171511',border:0,color:'#fff'}}/><Bar dataKey="total" fill="#B8963E" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></div></section>
    <section className="ledger outstanding-ledger"><header><p className="eyebrow">OUTSTANDING PAYMENTS</p><h3>Receipts awaiting payment</h3></header>{sales.filter(s=>Number(s.paidAmount??s.totalAmount)<s.totalAmount).map(s=><article key={s.id} role="button" tabIndex={0} onClick={()=>showReceipt(s)} onKeyDown={e=>(e.key==='Enter'||e.key===' ')&&showReceipt(s)}><div className="receipt-icon"><Clock3/></div><div><b>#{s.id.slice(0,8).toUpperCase()}</b><span>{s.customerName||s.shopName||'Walk-in client'}</span></div><span>Paid {Number(s.paidAmount??0).toLocaleString()} EGP</span><strong>{(s.totalAmount-Number(s.paidAmount??0)).toLocaleString()} EGP due</strong><i className={s.syncStatus}>{s.syncStatus}</i></article>)}{!sales.some(s=>Number(s.paidAmount??s.totalAmount)<s.totalAmount)&&<p className="muted ledger-empty">No outstanding payments.</p>}</section>
    <section className="ledger"><header><p className="eyebrow">RECENT RECEIPTS</p><h3>Transaction history</h3></header>{sales.map(s=><article key={s.id} role="button" tabIndex={0} onClick={()=>showReceipt(s)} onKeyDown={e=>(e.key==='Enter'||e.key===' ')&&showReceipt(s)}><div className="receipt-icon"><ReceiptText/></div><div><b>#{s.id.slice(0,8).toUpperCase()}</b><span>{new Date(s.createdAt).toLocaleString()}</span></div><span>{Number(s.paidAmount??s.totalAmount)>=s.totalAmount?'Paid':'Part paid'}</span><strong>{Number(s.paidAmount??s.totalAmount).toLocaleString()} / {s.totalAmount.toLocaleString()} EGP</strong><i className={s.syncStatus}>{s.syncStatus}</i></article>)}</section>
  </>;
}
