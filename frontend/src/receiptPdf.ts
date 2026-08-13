import type { Sale } from './types';
import { compareMoney, formatMoney, normalizeDecimal, subtractMoney } from './money';
import { receiptSummary } from './receipt';

const moneyValue = (value: string | number) => formatMoney(value).replace(/\sEGP$/, '');

export async function buildReceiptPdf(sale: Sale) {
  const { jsPDF } = await import('jspdf');
  const summary = receiptSummary(sale);
  const paid = normalizeDecimal(sale.paidAmount ?? sale.totalAmount);
  const outstanding = compareMoney(sale.totalAmount, paid) > 0 ? subtractMoney(sale.totalAmount, paid) : '0.00';
  const receiptNumber = sale.id.slice(0, 8).toUpperCase();
  const status = sale.deletedAt ? 'REFUNDED' : compareMoney(outstanding, '0') > 0 ? 'PAYMENT DUE' : 'PAID IN FULL';
  const clientDetails = [
    `Client: ${sale.customerName || 'Walk-in client'}`,
    sale.customerPhone && `Phone: ${sale.customerPhone}`,
    sale.shopName && `Shop: ${sale.shopName}`,
    sale.customerAddress && `Address: ${sale.customerAddress}`,
  ].filter(Boolean) as string[];

  const measure = new jsPDF({ unit: 'mm', format: [80, 200] });
  measure.setFont('helvetica', 'normal');
  measure.setFontSize(6.5);
  const wrap = (value: string, width = 72) => measure.splitTextToSize(value, width) as string[];
  const issuedLines = wrap(`Issued: ${new Date(sale.createdAt).toLocaleString()}`);
  const clientRows = clientDetails.map(detail => wrap(detail));
  const integrityLines = summary.mathematicallyConsistent ? [] : wrap('Warning: stored receipt totals are inconsistent.');
  const tableRows = summary.lines.map(line => ({
    ...line,
    configurationLines: wrap(`${line.colourName} / ${line.packDescription}`, 25),
  }));
  const footerText = `Thank you for choosing Konooz${sale.customerName ? `, ${sale.customerName}` : ''}.`;
  measure.setFont('helvetica', 'bold'); measure.setFontSize(8.5);
  const footerLines = measure.splitTextToSize(footerText, 70) as string[];
  const tableHeight = tableRows.reduce((height, line) => height + Math.max(7, 4 + line.configurationLines.length * 2.6), 0);
  const metadataLines = issuedLines.length + clientRows.reduce((count, lines) => count + lines.length, 0) + integrityLines.length;
  const pageHeight = Math.max(85, 70 + metadataLines * 2.7 + tableHeight + (sale.paidAt ? 3 : 0) + Math.max(0, footerLines.length - 1) * 3.6);
  const pdf = new jsPDF({ unit: 'mm', format: [80, pageHeight], orientation: 'portrait', compress: true });
  pdf.setProperties({ title: `Konooz receipt ${receiptNumber}`, subject: 'Sale receipt', author: 'Konooz' });

  const left = 4, right = 76;
  let y = 7.5;
  const text = (value: string | string[], x: number, atY: number, options?: Parameters<typeof pdf.text>[3]) => pdf.text(value, x, atY, options);
  const drawWrapped = (lines: string[], color: [number, number, number] = [60, 55, 48]) => {
    pdf.setTextColor(...color); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    for (const line of lines) { text(line, left, y); y += 2.7; }
  };
  const fitRight = (value: string, edge: number, maxWidth: number, atY: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    let size = 6.6;
    pdf.setFontSize(size);
    while (size > 5 && pdf.getTextWidth(value) > maxWidth) { size -= 0.2; pdf.setFontSize(size); }
    text(value, edge, atY, { align: 'right' });
  };

  pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); text('KONOOZ', 40, y, { align: 'center' }); y += 3.8;
  pdf.setTextColor(184, 150, 62); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); text('THE STYLE YOU LOVE', 40, y, { align: 'center' }); y += 3.2;
  pdf.setDrawColor(184, 150, 62); pdf.setLineWidth(0.25); pdf.line(left, y, right, y); y += 3.5;

  pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
  text(`RECEIPT #${receiptNumber}`, left, y); text(status, right, y, { align: 'right' }); y += 3.4;
  drawWrapped(issuedLines);
  for (const lines of clientRows) drawWrapped(lines);
  if (integrityLines.length) drawWrapped(integrityLines, [141, 37, 29]);
  y += 1.5;

  pdf.setDrawColor(184, 150, 62); pdf.setLineWidth(0.5); pdf.line(left, y, right, y); y += 3.2;
  pdf.setTextColor(116, 109, 98); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.2);
  text('MODEL / COLOUR / PACK', left, y);
  text('ITEM', 36.5, y, { align: 'center' }); text('PACK', 48, y, { align: 'center' });
  text('QTY', 57.5, y, { align: 'center' }); text('SUBTOTAL', 68.5, y, { align: 'center' }); y += 2.2;
  pdf.setDrawColor(222, 213, 197); pdf.setLineWidth(0.2); pdf.line(left, y, right, y);

  for (const line of tableRows) {
    const rowHeight = Math.max(7, 4 + line.configurationLines.length * 2.6);
    const baseline = y + 3.1;
    pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.2); text(line.modelNumber, left, baseline);
    pdf.setTextColor(116, 109, 98); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.6);
    line.configurationLines.forEach((value, index) => text(value, left, baseline + 2.5 + index * 2.6));
    pdf.setTextColor(23, 21, 17);
    fitRight(moneyValue(line.unitPrice), 42, 10, baseline);
    fitRight(line.legacy ? '-' : moneyValue(line.packPrice), 54, 11, baseline);
    fitRight(String(line.numberOfPacks), 61, 6, baseline);
    fitRight(moneyValue(line.subtotal), right, 14, baseline, true);
    y += rowHeight;
    pdf.setDrawColor(222, 213, 197); pdf.line(left, y, right, y);
  }

  const summaryLeft = 29;
  const summaryRow = (label: string, value: string, options: { discount?: boolean; total?: boolean } = {}) => {
    if (options.discount) pdf.setTextColor(154, 84, 47); else pdf.setTextColor(23, 21, 17);
    pdf.setFont('helvetica', options.total ? 'bold' : 'normal'); pdf.setFontSize(options.total ? 8.5 : 6.8);
    text(label, summaryLeft, y); fitRight(value, right, 25, y, options.total); y += options.total ? 4.5 : 3.5;
  };
  y += 4;
  summaryRow('Order subtotal', formatMoney(summary.subtotal));
  summaryRow(`Discount (${sale.discountPercentage}%)`, `- ${formatMoney(summary.discount)}`, { discount: true });
  pdf.setDrawColor(222, 213, 197); pdf.line(summaryLeft, y - 1.3, right, y - 1.3); y += 1.4;
  summaryRow('Receipt total', formatMoney(sale.totalAmount), { total: true });

  y += 1.5;
  const paymentHeight = sale.paidAt ? 10.5 : 8;
  pdf.setFillColor(247, 241, 230); pdf.setDrawColor(222, 213, 197); pdf.rect(left, y, right - left, paymentHeight, 'FD');
  const paymentTop = y + 3.2;
  pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); text('Paid', left + 2, paymentTop); fitRight(formatMoney(paid), right - 2, 28, paymentTop, true);
  pdf.setTextColor(compareMoney(outstanding, '0') > 0 ? 154 : 68, compareMoney(outstanding, '0') > 0 ? 84 : 106, compareMoney(outstanding, '0') > 0 ? 47 : 77);
  pdf.setFont('helvetica', 'bold'); text(compareMoney(outstanding, '0') > 0 ? 'Outstanding' : 'Payment status', left + 2, paymentTop + 3);
  fitRight(compareMoney(outstanding, '0') > 0 ? formatMoney(outstanding) : 'Paid in full', right - 2, 28, paymentTop + 3, true);
  if (sale.paidAt) {
    pdf.setTextColor(116, 109, 98); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5);
    text(`Fully paid ${new Date(sale.paidAt).toLocaleString()}`, left + 2, paymentTop + 5.7);
  }
  y += paymentHeight + 3;

  pdf.setDrawColor(222, 213, 197); pdf.line(left, y, right, y); y += 4;
  pdf.setTextColor(23, 21, 17); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
  text(footerLines, 40, y, { align: 'center' }); y += footerLines.length * 3.6;
  pdf.setTextColor(116, 109, 98); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); text('Keep shining in the style you love.', 40, y, { align: 'center' });
  return pdf;
}
