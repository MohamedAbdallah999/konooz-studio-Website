import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingUp, ReceiptText, Clock3, Search } from 'lucide-react';
import { db, deleteSalePermanently, refundSale, markSalePaid } from '../db';
import type { Sale } from '../types';
import { Receipt } from './Receipt';
import { paidAmountOf, outstandingAmountOf, paymentEvents } from '../payments';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { addMoney, compareMoney, formatMoney, moneyNumber } from '../money';

const clientLabel = (sale: Sale) => sale.customerName || 'Walk-in client';

export function Sales() {
  const [selected, setSelected] = useState<Sale | null>(null), [q, setQ] = useState('');
  const sales = useLiveQuery(() => db.sales.reverse().sortBy('createdAt')) ?? [];
  const activeSales = sales.filter(sale => !sale.deletedAt);
  const query = q.trim().toLowerCase();
  const filteredSales = sales.filter(sale => !query || sale.id.toLowerCase().includes(query) || (sale.customerName ?? '').toLowerCase().includes(query));
  const groups = new Map<string, string>();
  for (const event of activeSales.flatMap(paymentEvents)) { const date = new Date(event.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }); groups.set(date, addMoney(groups.get(date) ?? '0.00', event.amount)); }
  const chart = [...groups].slice(-14).map(([date, total]) => ({ date, total, amount: moneyNumber(total) }));
  const chartMaximum = Math.max(1, ...chart.map(entry => entry.amount));
  const revenue = activeSales.reduce((sum, sale) => addMoney(sum, paidAmountOf(sale)), '0.00'), outstanding = activeSales.reduce((sum, sale) => addMoney(sum, outstandingAmountOf(sale)), '0.00');
  const showReceipt = async (sale: Sale) => { const lines = sale.items?.length ? sale.items : await db.saleItems.where('saleId').equals(sale.id).toArray(); setSelected({ ...sale, items: lines }); };
  const refund = async () => { if (!selected || !confirm(`Refund receipt #${selected.id.slice(0, 8).toUpperCase()}? Its pack quantities will return to inventory.`)) return; await refundSale(selected); setSelected(null); };
  const permanentlyDelete = async () => {
    if (!selected || !confirm(`Permanently delete receipt #${selected.id.slice(0, 8).toUpperCase()}?${selected.deletedAt ? '' : ' It will be refunded first so its pack quantities return to inventory.'} This cannot be undone.`)) return;
    try { await deleteSalePermanently(selected); setSelected(null); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to delete this receipt.'); }
  };
  const markPaid = async () => { if (!selected || !confirm(`Mark the outstanding ${formatMoney(outstandingAmountOf(selected))} as paid?`)) return; setSelected(await markSalePaid(selected)); };
  if (selected) return <Receipt sale={selected} onClose={() => setSelected(null)} onRefund={selected.deletedAt ? undefined : refund} onMarkPaid={!selected.deletedAt && compareMoney(selected.paidAmount, selected.totalAmount) < 0 ? markPaid : undefined} onDelete={permanentlyDelete}/>;
  const outstandingSales = filteredSales.filter(sale => !sale.deletedAt && compareMoney(paidAmountOf(sale), sale.totalAmount) < 0);
  return <>
    <section className="section-head"><div><p className="eyebrow">THE LEDGER</p><AnimatedTitle>Sales & reporting</AnimatedTitle><p>Revenue includes only money received. Every receipt reads immutable sale-time snapshots.</p></div></section>
    <div className="report-stats three"><article><TrendingUp/><span>Collected revenue</span><strong>{formatMoney(revenue)}</strong></article><article><Clock3/><span>Outstanding payments</span><strong>{formatMoney(outstanding)}</strong></article><article><ReceiptText/><span>Receipts</span><strong>{sales.length}</strong></article></div>
    <div className="search receipt-search"><Search size={19}/><input aria-label="Search receipts" value={q} onChange={event => setQ(event.target.value)} placeholder="Search receipts by customer name or receipt ID..."/><span>{filteredSales.length} receipts</span></div>
    <section className="chart-card"><header><div><p className="eyebrow">REVENUE RHYTHM</p><h3>Recent collected sales</h3></div></header><div className="chart simple-chart" role="img" aria-label={`Collected revenue for recent active sales days: ${chart.map(entry=>`${entry.date}, ${formatMoney(entry.total)}`).join('; ')||'no revenue yet'}`}>{chart.map(entry=><div className="chart-column" key={entry.date}><span className="chart-value">{formatMoney(entry.total)}</span><i style={{height:`${Math.max(2,(entry.amount/chartMaximum)*100)}%`}}/><small>{entry.date}</small></div>)}{!chart.length&&<p className="muted">No collected revenue yet.</p>}</div></section>
    <section className="ledger outstanding-ledger"><header><p className="eyebrow">OUTSTANDING PAYMENTS</p><h3>Receipts awaiting payment</h3></header>{outstandingSales.map(sale => <article key={sale.id} role="button" tabIndex={0} onClick={() => showReceipt(sale)} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && showReceipt(sale)}><div className="receipt-icon"><Clock3/></div><div><b>#{sale.id.slice(0, 8).toUpperCase()} · {clientLabel(sale)}</b><span>{sale.shopName || new Date(sale.createdAt).toLocaleString()}</span></div><span>Paid {formatMoney(paidAmountOf(sale))}</span><strong>{formatMoney(outstandingAmountOf(sale))} due</strong><i className={sale.syncStatus}>{sale.syncStatus}</i></article>)}{!outstandingSales.length && <p className="muted ledger-empty">{query ? 'No matching outstanding receipts.' : 'No outstanding payments.'}</p>}</section>
    <section className="ledger"><header><p className="eyebrow">RECENT RECEIPTS</p><h3>Transaction history</h3></header>{filteredSales.map(sale => <article key={sale.id} role="button" tabIndex={0} onClick={() => showReceipt(sale)} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && showReceipt(sale)}><div className="receipt-icon"><ReceiptText/></div><div><b>#{sale.id.slice(0, 8).toUpperCase()} · {clientLabel(sale)}</b><span>{new Date(sale.createdAt).toLocaleString()}</span></div><span>{sale.deletedAt ? 'Refunded' : compareMoney(paidAmountOf(sale), sale.totalAmount) >= 0 ? 'Paid' : 'Part paid'}</span><strong>{formatMoney(paidAmountOf(sale))} / {formatMoney(sale.totalAmount)}</strong><i className={sale.deletedAt ? 'refunded' : sale.syncStatus}>{sale.deletedAt ? 'refunded' : sale.syncStatus}</i></article>)}{!filteredSales.length && <p className="muted ledger-empty">No receipts match that name or ID.</p>}</section>
  </>;
}
