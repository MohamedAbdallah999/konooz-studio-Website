import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Sale } from './types';
import { receiptSummary } from './receipt';
import { buildReceiptPdf } from './receiptPdf';
import { Receipt } from './pages/Receipt';

const sale = (overrides: Partial<Sale> = {}): Sale => ({
  id: crypto.randomUUID(), totalAmount: '180.00', depositAmount: '180.00', paidAmount: '180.00',
  discountPercentage: '10.00', items: [{
    id: crypto.randomUUID(), saleId: 'sale', modelNumberAtSale: 'M100', modelPriceAtSale: '50.00',
    colourNameAtSale: 'Black', packId: crypto.randomUUID(), sizesPerPackAtSale: 2,
    packPriceAtSale: '100.00', numberOfPacks: 2, lineSubtotal: '200.00', discountAllocation: '20.00',
    finalLineTotal: '180.00', createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z', syncStatus: 'synced',
  }], createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z', syncStatus: 'synced',
  ...overrides,
});

describe('receipt snapshots', () => {
  it('keeps line prices undiscounted and calculates one order discount', () => {
    const result = receiptSummary(sale());
    expect(result.lines[0]).toMatchObject({ unitPrice: '50.00', packPrice: '100.00', numberOfPacks: 2, subtotal: '200.00' });
    expect(result.lines[0]).not.toHaveProperty('discount');
    expect(result.lines[0]).not.toHaveProperty('total');
    expect(result).toMatchObject({ subtotal: '200.00', discount: '20.00', mathematicallyConsistent: true });
  });

  it('detects a receipt whose stored final total disagrees with its immutable lines', () => {
    expect(receiptSummary(sale({ totalAmount: '179.99' })).mathematicallyConsistent).toBe(false);
  });

  it('builds a compact 80 mm PDF instead of an A4 page', async () => {
    const pdf = await buildReceiptPdf(sale());
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(80, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeLessThan(150);
  });

  it('organizes receipt details without the internal inventory-count summary', () => {
    const markup = renderToStaticMarkup(createElement(Receipt, { sale: sale({ customerName: 'Client', customerPhone: '01000000000' }), onClose: () => undefined }));
    expect(markup).toContain('Receipt');
    expect(markup).toContain('Purchase details');
    expect(markup).toContain('Totals and payment');
    expect(markup).toContain('Item / unit');
    expect(markup).toContain('Pack<br/>price');
    expect(markup).toContain('Line<br/>subtotal');
    expect(markup.match(/Discount \(10\.00%\)/g)).toHaveLength(1);
    expect(markup).not.toContain('Final line amount');
    expect(markup).not.toContain('Packs / legacy pieces / represented items');
  });
});
