import type { Sale } from '../types';
import { Printer, ArrowLeft, FileDown, RotateCcw, BadgeCheck, Trash2 } from 'lucide-react';
import { compareMoney, formatMoney, normalizeDecimal, subtractMoney } from '../money';
import { receiptSummary } from '../receipt';
import { buildReceiptPdf } from '../receiptPdf';

const receiptMoneyValue = (value: string | number) => formatMoney(value).replace(/\sEGP$/, '');

export function Receipt({ sale, onClose, onRefund, onMarkPaid, onDelete }: { sale: Sale; onClose: () => void; onRefund?: () => void; onMarkPaid?: () => void; onDelete?: () => void }) {
  const receiptNumber = sale.id.slice(0, 8).toUpperCase(), summary = receiptSummary(sale), facts = summary.lines;
  const paid = normalizeDecimal(sale.paidAmount ?? sale.totalAmount);
  const outstanding = compareMoney(sale.totalAmount, paid) > 0 ? subtractMoney(sale.totalAmount, paid) : '0.00';
  const issuedAt = new Date(sale.createdAt).toLocaleString();
  const clientDetails = [
    sale.customerPhone && { label: 'Phone', value: sale.customerPhone },
    sale.shopName && { label: 'Shop', value: sale.shopName },
    sale.customerAddress && { label: 'Address', value: sale.customerAddress },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const downloadPdf = async () => {
    const pdf = await buildReceiptPdf(sale);
    pdf.save(`konooz-receipt-${receiptNumber}.pdf`);
  };

  return <>
    <div className="receipt-actions no-print"><button className="secondary" onClick={onClose}><ArrowLeft/> Back</button><div>{onRefund && <button className="refund-button" onClick={onRefund}><RotateCcw/> Refund sale</button>}{onMarkPaid && <button className="primary pay-button" onClick={onMarkPaid}><BadgeCheck/> Mark as paid</button>}{onDelete && <button className="delete-receipt-button" onClick={onDelete}><Trash2/> Delete receipt</button>}<button className="secondary" onClick={downloadPdf}><FileDown/> Download PDF</button><button className="primary" onClick={() => { window.focus(); window.print(); }}><Printer/> Print receipt</button></div></div>
    <section className="receipt" aria-label={`Receipt ${receiptNumber}`}>
      <header className="receipt-brand"><img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><p className="tagline">THE STYLE YOU LOVE</p></header>
      <div className="receipt-rule"/>
      <section className="receipt-overview" aria-label="Receipt details">
        <div><span>Receipt</span><b>#{receiptNumber}</b></div>
        <div><span>Issued</span><b>{issuedAt}</b></div>
        <div><span>Client</span><b>{sale.customerName || 'Walk-in client'}</b></div>
        <div><span>Status</span><b className={sale.deletedAt ? 'refunded' : compareMoney(outstanding, '0') > 0 ? 'due' : 'settled'}>{sale.deletedAt ? 'Refunded' : compareMoney(outstanding, '0') > 0 ? 'Payment due' : 'Paid in full'}</b></div>
      </section>
      {clientDetails.length > 0 && <section className="receipt-client" aria-label="Client details"><dl>{clientDetails.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section>}
      {!summary.mathematicallyConsistent && <p className="receipt-integrity" role="alert">This historical receipt contains inconsistent stored totals. Please review it before sharing.</p>}
      <section className="receipt-purchases" aria-label="Purchase details">
        <table className="receipt-item-table">
          <thead><tr><th>Model / colour / pack</th><th>Item / unit<br/>price (EGP)</th><th>Pack<br/>price (EGP)</th><th>Packs /<br/>quantity</th><th>Line<br/>subtotal (EGP)</th></tr></thead>
          <tbody>{facts.map((line, index) => <tr key={sale.items[index]?.id ?? index}>
            <td><b>{line.modelNumber}</b><small>{line.colourName} <span aria-hidden="true">·</span> {line.packDescription}</small></td>
            <td>{receiptMoneyValue(line.unitPrice)}</td>
            <td>{line.legacy ? '—' : receiptMoneyValue(line.packPrice)}</td>
            <td>{line.numberOfPacks}</td>
            <td><strong>{receiptMoneyValue(line.subtotal)}</strong></td>
          </tr>)}</tbody>
        </table>
      </section>
      <section className="receipt-financials" aria-label="Totals and payment">
        <div className="receipt-summary" aria-label="Receipt pricing summary">
          <span><b>Order subtotal</b><strong>{formatMoney(summary.subtotal)}</strong></span>
          <span className="discount"><b>Discount ({sale.discountPercentage}%)</b><strong>− {formatMoney(summary.discount)}</strong></span>
          <span className="final"><b>Receipt total</b><strong>{formatMoney(sale.totalAmount)}</strong></span>
        </div>
      </section>
      <div className="receipt-payment" aria-label="Payment details">
        <span className="paid">Paid <b>{formatMoney(paid)}</b></span>
        <span className={compareMoney(outstanding, '0') > 0 ? 'due' : 'settled'}>{compareMoney(outstanding, '0') > 0 ? 'Outstanding' : 'Payment status'} <b>{compareMoney(outstanding, '0') > 0 ? formatMoney(outstanding) : 'Paid in full'}</b></span>
        {sale.paidAt && <small>Fully paid {new Date(sale.paidAt).toLocaleString()}</small>}
      </div>
      <footer><p>Thank you for choosing Konooz{sale.customerName ? `, ${sale.customerName}` : ''}.</p><small>Keep shining in the style you love.</small></footer>
    </section>
  </>;
}
