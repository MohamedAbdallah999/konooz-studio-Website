import type { Sale } from '../types';
import { Printer, ArrowLeft, FileDown, RotateCcw, BadgeCheck } from 'lucide-react';
import { compareMoney, formatMoney, normalizeDecimal, subtractMoney } from '../money';
import { receiptSummary } from '../receipt';

export function Receipt({ sale, onClose, onRefund, onMarkPaid }: { sale: Sale; onClose: () => void; onRefund?: () => void; onMarkPaid?: () => void }) {
  const receiptNumber = sale.id.slice(0, 8).toUpperCase(), summary = receiptSummary(sale), facts = summary.lines;
  const paid = normalizeDecimal(sale.paidAmount ?? sale.totalAmount);
  const outstanding = compareMoney(sale.totalAmount, paid) > 0 ? subtractMoney(sale.totalAmount, paid) : '0.00';
  const issuedAt = new Date(sale.createdAt).toLocaleString();
  const clientDetails = [
    sale.customerName && { label: 'Client', value: sale.customerName },
    sale.customerPhone && { label: 'Phone', value: sale.customerPhone },
    sale.shopName && { label: 'Shop', value: sale.shopName },
    sale.customerAddress && { label: 'Address', value: sale.customerAddress },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' }), width = pdf.internal.pageSize.getWidth();
    let y = 24;
    const pageBreak = (needed: number) => { if (y + needed > 282) { pdf.addPage(); y = 20; } };
    const section = (title: string) => {
      pageBreak(14);
      pdf.setFillColor(247, 241, 230); pdf.rect(18, y - 4, width - 36, 9, 'F');
      pdf.setTextColor(184, 150, 62); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text(title.toUpperCase(), 22, y + 1);
      y += 11;
    };
    const row = (label: string, value: string, bold = false) => {
      pageBreak(7); pdf.setTextColor(60, 55, 48); pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 10 : 9);
      pdf.text(label, 22, y); pdf.text(value, width - 22, y, { align: 'right' }); y += 6;
    };

    pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24); pdf.text('KONOOZ', width / 2, y, { align: 'center' }); y += 7;
    pdf.setTextColor(184, 150, 62); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text('THE STYLE YOU LOVE', width / 2, y, { align: 'center' }); y += 10;
    pdf.setDrawColor(184, 150, 62); pdf.line(18, y, width - 18, y); y += 10;

    section('Receipt details');
    row('Receipt number', `#${receiptNumber}`, true); row('Issued', issuedAt);
    row('Status', sale.deletedAt ? 'REFUNDED' : compareMoney(outstanding, '0') > 0 ? 'PAYMENT DUE' : 'PAID IN FULL', true);
    if (clientDetails.length) {
      section('Client details');
      for (const detail of clientDetails) {
        pageBreak(8); pdf.setTextColor(60, 55, 48); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        const wrapped = pdf.splitTextToSize(`${detail.label}: ${detail.value}`, width - 44) as string[];
        pdf.text(wrapped, 22, y); y += wrapped.length * 5;
      }
    }

    section('Purchase details');
    facts.forEach((fact, index) => {
      pageBreak(50);
      if (index > 0) { pdf.setDrawColor(222, 213, 197); pdf.line(22, y, width - 22, y); y += 7; }
      row(`Model ${fact.modelNumber}`, `${fact.colourName} / ${fact.packDescription}`, true);
      row('Price per item / unit', formatMoney(fact.unitPrice));
      if (!fact.legacy) row('Price per pack', formatMoney(fact.packPrice));
      row(fact.legacy ? 'Quantity' : 'Number of packs', String(fact.numberOfPacks));
      row('Line total before discount', formatMoney(fact.subtotal));
      row('Discount', `- ${formatMoney(fact.discount)}`);
      row('Final line amount', formatMoney(fact.total), true);
    });

    section('Totals');
    row('Total before discount', formatMoney(summary.subtotal));
    row(`Discount (${sale.discountPercentage}%)`, `- ${formatMoney(summary.discount)}`);
    row('Final total', formatMoney(sale.totalAmount), true);
    section('Payment');
    row('Paid', formatMoney(paid));
    row('Outstanding', formatMoney(outstanding), compareMoney(outstanding, '0') > 0);
    y += 10; pageBreak(15); pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.text('Thank you for choosing Konooz.', width / 2, y, { align: 'center' });
    pdf.save(`konooz-receipt-${receiptNumber}.pdf`);
  };

  return <>
    <div className="receipt-actions no-print"><button className="secondary" onClick={onClose}><ArrowLeft/> Back</button><div>{onRefund && <button className="refund-button" onClick={onRefund}><RotateCcw/> Refund sale</button>}{onMarkPaid && <button className="primary pay-button" onClick={onMarkPaid}><BadgeCheck/> Mark as paid</button>}<button className="secondary" onClick={downloadPdf}><FileDown/> Download PDF</button><button className="primary" onClick={() => { window.focus(); window.print(); }}><Printer/> Print receipt</button></div></div>
    <section className="receipt" aria-label={`Receipt ${receiptNumber}`}>
      <header className="receipt-brand"><img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><p className="tagline">THE STYLE YOU LOVE</p></header>
      <div className="receipt-rule"/>
      <section className="receipt-overview" aria-label="Receipt details">
        <div><span>Receipt number</span><b>#{receiptNumber}</b></div>
        <div><span>Issued</span><b>{issuedAt}</b></div>
        <div><span>Client</span><b>{sale.customerName || 'Walk-in client'}</b></div>
        <div><span>Status</span><b className={sale.deletedAt ? 'refunded' : compareMoney(outstanding, '0') > 0 ? 'due' : 'settled'}>{sale.deletedAt ? 'Refunded' : compareMoney(outstanding, '0') > 0 ? 'Payment due' : 'Paid in full'}</b></div>
      </section>
      {clientDetails.some(detail => detail.label !== 'Client') && <section className="receipt-block receipt-client" aria-label="Client details"><header><p className="eyebrow">CLIENT DETAILS</p></header><dl>{clientDetails.filter(detail => detail.label !== 'Client').map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></section>}
      {!summary.mathematicallyConsistent && <p className="receipt-integrity" role="alert">This historical receipt contains inconsistent stored totals. Please review it before sharing.</p>}
      <section className="receipt-block receipt-purchases" aria-label="Purchase details">
        <header className="receipt-section-heading"><div><p className="eyebrow">PURCHASE DETAILS</p><h2>Sale items</h2></div><span>{facts.length} {facts.length === 1 ? 'line' : 'lines'}</span></header>
        <div className="receipt-lines">{facts.map((line, index) => <article key={sale.items[index]?.id ?? index}>
          <header><div><span>MODEL</span><h3>{line.modelNumber}</h3></div><b>{line.legacy ? 'Legacy unit sale' : 'Pack sale'}</b></header>
          <p><strong>Colour:</strong> {line.colourName} <span aria-hidden="true">·</span> <strong>Pack:</strong> {line.packDescription}</p>
          <dl>
            <div><dt>Price per item / unit</dt><dd>{formatMoney(line.unitPrice)}</dd></div>
            {!line.legacy&&<div><dt>Price per pack</dt><dd>{formatMoney(line.packPrice)}</dd></div>}
            <div><dt>{line.legacy ? 'Quantity' : 'Number of packs'}</dt><dd>{line.numberOfPacks}</dd></div>
            <div className="original"><dt>Line total <small>before discount</small></dt><dd>{formatMoney(line.subtotal)}</dd></div>
            <div className="discount"><dt>Discount</dt><dd>− {formatMoney(line.discount)}</dd></div>
            <div className="final"><dt>Final line amount</dt><dd>{formatMoney(line.total)}</dd></div>
          </dl>
        </article>)}</div>
      </section>
      <section className="receipt-financials" aria-label="Totals and payment">
        <div className="receipt-summary" aria-label="Receipt pricing summary"><p className="eyebrow">TOTALS</p><span><b>Total before discount</b><strong>{formatMoney(summary.subtotal)}</strong></span><span className="discount"><b>Discount ({sale.discountPercentage}%)</b><strong>− {formatMoney(summary.discount)}</strong></span><span className="final"><b>Final total</b><strong>{formatMoney(sale.totalAmount)}</strong></span></div>
        <div className="receipt-payment"><p className="eyebrow">PAYMENT</p><span className="paid">Paid <b>{formatMoney(paid)}</b></span><span className={compareMoney(outstanding, '0') > 0 ? 'due' : 'settled'}>{compareMoney(outstanding, '0') > 0 ? 'Outstanding' : 'Payment status'} <b>{compareMoney(outstanding, '0') > 0 ? formatMoney(outstanding) : 'Paid in full'}</b></span>{sale.paidAt && <small>Fully paid {new Date(sale.paidAt).toLocaleString()}</small>}</div>
      </section>
      <footer><p>Thank you for choosing Konooz{sale.customerName ? `, ${sale.customerName}` : ''}.</p><small>Keep shining in the style you love.</small></footer>
    </section>
  </>;
}
