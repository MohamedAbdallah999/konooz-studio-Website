import type { Sale, SaleLine } from './types';
import { addMoney, compareMoney, multiplyMoney, normalizeDecimal, subtractMoney } from './money';

export type ReceiptLineFacts = {
  legacy: boolean;
  modelNumber: string;
  colourName: string;
  packDescription: string;
  sizesPerPack: number;
  unitPrice: string;
  packPrice: string;
  numberOfPacks: number;
  subtotal: string;
  discount: string;
  total: string;
  mathematicallyConsistent: boolean;
};

export const receiptLineFacts = (line: SaleLine): ReceiptLineFacts => {
  const legacyQuantity = line.quantity ?? 0;
  const legacyPrice = normalizeDecimal(line.legacyModelPriceAtSale ?? line.unitPriceAtSale ?? 0);
  const legacy = !line.packId && Boolean(line.itemVariantId);
  const colourName = line.colourNameAtSale ?? line.legacyColourNameAtSale ?? line.itemVariant?.color ?? 'Legacy colour';
  const legacySize = line.legacySizeAtSale ?? line.itemVariant?.size;
  const sizesPerPack = legacy ? 1 : (line.sizesPerPackAtSale ?? 1);
  const unitPrice = normalizeDecimal(line.modelPriceAtSale ?? legacyPrice);
  const packPrice = normalizeDecimal(line.packPriceAtSale ?? unitPrice);
  const numberOfPacks = line.numberOfPacks ?? legacyQuantity;
  const subtotal = normalizeDecimal(line.lineSubtotal ?? multiplyMoney(packPrice, numberOfPacks));
  const discount = normalizeDecimal(line.discountAllocation ?? 0);
  const total = normalizeDecimal(line.finalLineTotal ?? subtractMoney(subtotal, discount));
  return {
    legacy,
    modelNumber: line.modelNumberAtSale ?? line.legacyModelNumberAtSale ?? line.itemVariant?.item?.modelNumber ?? 'Legacy model',
    colourName,
    packDescription: legacy ? `${legacySize ?? 'One size'} / legacy unit sale` : `${sizesPerPack} items per pack`,
    sizesPerPack,
    unitPrice,
    packPrice,
    numberOfPacks,
    subtotal,
    discount,
    total,
    mathematicallyConsistent: compareMoney(packPrice, multiplyMoney(unitPrice, sizesPerPack)) === 0n
      && compareMoney(subtotal, multiplyMoney(packPrice, numberOfPacks)) === 0n
      && compareMoney(total, subtractMoney(subtotal, discount)) === 0n,
  };
};

export const receiptSummary = (sale: Sale) => {
  const lines = sale.items.map(receiptLineFacts);
  const subtotal = lines.reduce((sum, line) => addMoney(sum, line.subtotal), '0.00');
  const discount = lines.reduce((sum, line) => addMoney(sum, line.discount), '0.00');
  const finalLines = lines.reduce((sum, line) => addMoney(sum, line.total), '0.00');
  return {
    lines,
    subtotal,
    discount,
    finalLines,
    mathematicallyConsistent: lines.every(line => line.mathematicallyConsistent)
      && compareMoney(subtractMoney(subtotal, discount), finalLines) === 0n
      && compareMoney(finalLines, sale.totalAmount) === 0n,
  };
};
