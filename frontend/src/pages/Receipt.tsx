import type { Sale, SaleLine } from '../types';
import { Printer, ArrowLeft, FileDown, RotateCcw, BadgeCheck } from 'lucide-react';
import { addMoney, compareMoney, formatMoney, multiplyMoney, normalizeDecimal, subtractMoney } from '../money';

const lineFacts = (line: SaleLine) => {
  const legacyQuantity = line.quantity ?? 0;
  const legacyPrice = normalizeDecimal(line.legacyModelPriceAtSale ?? line.unitPriceAtSale ?? 0);
  const legacy = !line.packId && Boolean(line.itemVariantId);
  const colourName = line.colourNameAtSale ?? line.legacyColourNameAtSale ?? line.itemVariant?.color ?? 'Legacy colour';
  const legacySize = line.legacySizeAtSale ?? line.itemVariant?.size;
  return {
    legacy,
    modelNumber: line.modelNumberAtSale ?? line.legacyModelNumberAtSale ?? line.itemVariant?.item?.modelNumber ?? 'Legacy model',
    configuration: legacy
      ? `${colourName}${legacySize ? ` / ${legacySize}` : ''} / legacy piece sale`
      : `${colourName} / ${line.sizesPerPackAtSale ?? 1} sizes per pack`,
    sizesPerPack: line.sizesPerPackAtSale ?? 1,
    packPrice: normalizeDecimal(line.packPriceAtSale ?? legacyPrice),
    numberOfPacks: line.numberOfPacks ?? legacyQuantity,
    subtotal: normalizeDecimal(line.lineSubtotal ?? multiplyMoney(legacyPrice, legacyQuantity)),
    discount: normalizeDecimal(line.discountAllocation ?? 0),
    total: normalizeDecimal(line.finalLineTotal ?? line.lineSubtotal ?? multiplyMoney(legacyPrice, legacyQuantity)),
  };
};

export function Receipt({ sale, onClose, onRefund, onMarkPaid }: { sale: Sale; onClose: () => void; onRefund?: () => void; onMarkPaid?: () => void }) {
  const receiptNumber = sale.id.slice(0, 8).toUpperCase(), facts = sale.items.map(lineFacts);
  const totalPacks = facts.filter(line => !line.legacy).reduce((sum, line) => sum + line.numberOfPacks, 0);
  const legacyPieces = facts.filter(line => line.legacy).reduce((sum, line) => sum + line.numberOfPacks, 0);
  const representedSizes = facts.reduce((sum, line) => sum + line.numberOfPacks * line.sizesPerPack, 0);
  const subtotal = facts.reduce((sum, line) => addMoney(sum, line.subtotal), '0.00');
  const discountAmount = facts.reduce((sum, line) => addMoney(sum, line.discount), '0.00');
  const paid = normalizeDecimal(sale.paidAmount ?? sale.totalAmount);
  const outstanding = compareMoney(sale.totalAmount, paid) > 0 ? subtractMoney(sale.totalAmount, paid) : '0.00';
  const clientDetails = [
    sale.customerName && `Client: ${sale.customerName}`,
    sale.customerPhone && `Phone: ${sale.customerPhone}`,
    sale.shopName && `Shop: ${sale.shopName}`,
    sale.customerAddress && `Address: ${sale.customerAddress}`,
  ].filter(Boolean) as string[];

  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' }), width = pdf.internal.pageSize.getWidth();
    let y = 24;
    pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24); pdf.text('KONOOZ', width / 2, y, { align: 'center' }); y += 7;
    pdf.setTextColor(184, 150, 62); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text('THE STYLE YOU LOVE', width / 2, y, { align: 'center' }); y += 10;
    pdf.setDrawColor(184, 150, 62); pdf.line(18, y, width - 18, y); y += 10;
    pdf.setTextColor(60, 55, 48); pdf.setFontSize(9); pdf.text(`Receipt #${receiptNumber}`, 18, y); pdf.text(new Date(sale.createdAt).toLocaleString(), width - 18, y, { align: 'right' }); y += 7;
    if (sale.deletedAt) { pdf.setTextColor(141, 37, 29); pdf.setFont('helvetica', 'bold'); pdf.text('REFUNDED', 18, y); y += 7; }
    for (const detail of clientDetails) { pdf.text(detail, 18, y); y += 5; }
    y += 5; pdf.setFont('helvetica', 'bold'); pdf.text('MODEL / CONFIGURATION', 18, y); pdf.text('QTY', 135, y, { align: 'right' }); pdf.text('UNIT / PACK', 165, y, { align: 'right' }); pdf.text('TOTAL', width - 18, y, { align: 'right' }); y += 3; pdf.line(18, y, width - 18, y); y += 7;
    sale.items.forEach((_line, index) => {
      if (y > 270) { pdf.addPage(); y = 20; }
      const fact = facts[index]!;
      pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text(fact.modelNumber, 18, y);
      pdf.setTextColor(116, 109, 98); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.text(fact.configuration, 18, y + 4);
      pdf.setTextColor(23, 21, 17); pdf.setFontSize(10); pdf.text(String(fact.numberOfPacks), 135, y, { align: 'right' }); pdf.text(fact.packPrice, 165, y, { align: 'right' }); pdf.text(fact.total, width - 18, y, { align: 'right' }); y += 12;
    });
    y += 5;
    if (compareMoney(discountAmount, '0') > 0) {
      pdf.text('Subtotal', 140, y, { align: 'right' }); pdf.text(formatMoney(subtotal), width - 18, y, { align: 'right' }); y += 6;
      pdf.text(`Discount (${sale.discountPercentage}%)`, 140, y, { align: 'right' }); pdf.text(`- ${formatMoney(discountAmount)}`, width - 18, y, { align: 'right' }); y += 8;
    }
    if (totalPacks) { pdf.text('Total packs', 140, y, { align: 'right' }); pdf.text(String(totalPacks), width - 18, y, { align: 'right' }); y += 6; }
    if (legacyPieces) { pdf.text('Legacy pieces', 140, y, { align: 'right' }); pdf.text(String(legacyPieces), width - 18, y, { align: 'right' }); y += 6; }
    pdf.text('Represented sizes', 140, y, { align: 'right' }); pdf.text(String(representedSizes), width - 18, y, { align: 'right' }); y += 7;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.text('Receipt total', 140, y, { align: 'right' }); pdf.text(formatMoney(sale.totalAmount), width - 18, y, { align: 'right' }); y += 7;
    pdf.setFont('helvetica', 'normal'); pdf.text('Paid', 140, y, { align: 'right' }); pdf.text(formatMoney(paid), width - 18, y, { align: 'right' }); y += 7;
    pdf.text('Outstanding', 140, y, { align: 'right' }); pdf.text(formatMoney(outstanding), width - 18, y, { align: 'right' }); y += 20;
    pdf.setFont('helvetica', 'bold'); pdf.text('Thank you for choosing Konooz.', width / 2, y, { align: 'center' });
    pdf.save(`konooz-receipt-${receiptNumber}.pdf`);
  };

  return <>
    <div className="receipt-actions no-print"><button className="secondary" onClick={onClose}><ArrowLeft/> Back</button><div>{onRefund && <button className="refund-button" onClick={onRefund}><RotateCcw/> Refund sale</button>}{onMarkPaid && <button className="primary pay-button" onClick={onMarkPaid}><BadgeCheck/> Mark as paid</button>}<button className="secondary" onClick={downloadPdf}><FileDown/> Download PDF</button><button className="primary" onClick={() => { window.focus(); window.print(); }}><Printer/> Print receipt</button></div></div>
    <section className="receipt"><img src="/brand/konooz-wordmark-transparent.png" alt="Konooz"/><p className="tagline">THE STYLE YOU LOVE</p><div className="receipt-rule"/><div className="receipt-meta"><span>Receipt <b>#{receiptNumber} / {sale.customerName || 'Walk-in client'}</b></span><span>{new Date(sale.createdAt).toLocaleString()}</span>{sale.deletedAt && <span className="refunded">Refunded</span>}{sale.customerPhone && <span>Phone <b>{sale.customerPhone}</b></span>}{sale.shopName && <span>Shop <b>{sale.shopName}</b></span>}{sale.customerAddress && <span>Address <b>{sale.customerAddress}</b></span>}</div>
      <table><thead><tr><th>Model / configuration</th><th>Quantity</th><th>Unit / pack price</th><th>Line total</th></tr></thead><tbody>{facts.map((line, index) => <tr key={sale.items[index]!.id}><td><b>{line.modelNumber}</b><small>{line.configuration}</small></td><td>{line.numberOfPacks}</td><td>{formatMoney(line.packPrice)}</td><td>{formatMoney(line.total)}</td></tr>)}</tbody></table>
      {compareMoney(discountAmount, '0') > 0 && <div className="receipt-breakdown"><span>Subtotal <b>{formatMoney(subtotal)}</b></span><span>Discount ({sale.discountPercentage}%) <b>-{formatMoney(discountAmount)}</b></span></div>}
      <div className="receipt-payment"><span className="receipt-pieces">Packs / legacy pieces / represented sizes <b>{totalPacks} / {legacyPieces} / {representedSizes}</b></span><span>Receipt total <b>{formatMoney(sale.totalAmount)}</b></span><span className="paid">Paid <b>{formatMoney(paid)}</b></span><span className={compareMoney(outstanding, '0') > 0 ? 'due' : 'settled'}>{compareMoney(outstanding, '0') > 0 ? 'Outstanding' : 'Payment status'} <b>{compareMoney(outstanding, '0') > 0 ? formatMoney(outstanding) : 'Paid in full'}</b></span>{sale.paidAt && <small>Fully paid {new Date(sale.paidAt).toLocaleString()}</small>}</div>
      <footer><p>Thank you for choosing Konooz{sale.customerName ? `, ${sale.customerName}` : ''}.</p><small>Keep shining in the style you love.</small></footer>
    </section>
  </>;
}
