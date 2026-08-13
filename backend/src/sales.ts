import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { validate } from './middleware.js';
import { orderDiscountTotals, roundMoney } from './saleTotals.js';

const router = Router();
const MAX_PACKS_PER_LINE = 1_000;
const decimalInput = (maximum: number) => z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/).transform((value, context) => {
  const decimal = new Prisma.Decimal(value);
  if (decimal.gt(maximum)) {
    context.addIssue({ code: 'custom', message: `Amount cannot exceed ${maximum}` });
    return z.NEVER;
  }
  return decimal;
});

const sale = z.object({
  customerName: z.string().trim().max(120).nullish(),
  customerPhone: z.string().trim().max(40).nullish(),
  shopName: z.string().trim().max(120).nullish(),
  customerAddress: z.string().trim().max(500).nullish(),
  depositAmount: decimalInput(100_000_000).optional(),
  discountPercentage: decimalInput(100).default('0'),
  items: z.array(z.object({
    modelId: z.string().uuid(),
    colourId: z.string().uuid(),
    packId: z.string().uuid(),
    numberOfPacks: z.number().int().positive().max(MAX_PACKS_PER_LINE),
  }).strict()).min(1).max(250),
}).strict().superRefine((value, context) => {
  const packIds = new Set<string>();
  value.items.forEach((line, index) => {
    if (packIds.has(line.packId)) context.addIssue({ code: 'custom', path: ['items', index], message: 'Duplicate pack lines are not allowed' });
    packIds.add(line.packId);
  });
});

router.get('/', async (_req, res) => {
  const data = await prisma.sale.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(data);
});

router.get('/summary/revenue', async (_req, res) => {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const sales = await prisma.sale.findMany({
    where: { OR: [{ createdAt: { gte: from } }, { paidAt: { gte: from } }], deletedAt: null },
    select: { createdAt: true, totalAmount: true, depositAmount: true, paidAt: true },
  });
  const days = new Map<string, Prisma.Decimal>();
  const add = (key: string, amount: Prisma.Decimal) => days.set(key, (days.get(key) ?? new Prisma.Decimal(0)).add(amount));
  for (const entry of sales) {
    if (entry.createdAt >= from) add(entry.createdAt.toISOString().slice(0, 10), entry.depositAmount);
    if (entry.paidAt && entry.paidAt > entry.createdAt && entry.paidAt >= from) {
      add(entry.paidAt.toISOString().slice(0, 10), entry.totalAmount.sub(entry.depositAmount));
    }
  }
  res.json([...days].map(([date, total]) => ({ date, total: total.toFixed(2) })));
});

router.get('/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const data = await prisma.sale.findFirst({
    where: { id },
    include: { items: true },
  });
  if (!data) throw Object.assign(new Error('Receipt not found'), { status: 404 });
  res.json(data);
});

router.post('/', validate(sale), async (req, res) => {
  const body = req.body as z.infer<typeof sale>;
  const createOnce = () => prisma.$transaction(async tx => {
    const calculated: Array<{
      line: (typeof body.items)[number];
      modelId: string;
      modelNumber: string;
      modelPrice: Prisma.Decimal;
      colourId: string;
      colourName: string;
      sizesPerPack: number;
      packPrice: Prisma.Decimal;
      lineSubtotal: Prisma.Decimal;
    }> = [];

    const requestedPacks = await tx.pack.findMany({
      where: { id: { in: body.items.map(line => line.packId) } },
      include: { modelColour: { include: { model: true } } },
    });
    const packById = new Map(requestedPacks.map(pack => [pack.id, pack]));

    for (const line of body.items) {
      const pack = packById.get(line.packId);
      const colour = pack?.modelColour;
      const productModel = colour?.model;
      if (!pack || !colour || !productModel || !pack.isActive || !colour.isActive || !productModel.isActive) {
        throw Object.assign(new Error('The selected model, colour, or pack is inactive or unavailable.'), { status: 409 });
      }
      if (productModel.id !== line.modelId || colour.id !== line.colourId || pack.modelColourId !== line.colourId) {
        throw Object.assign(new Error('The selected pack does not belong to the selected model and colour.'), { status: 409 });
      }
      if (productModel.price.isNegative()) throw Object.assign(new Error('The selected model has an invalid negative price.'), { status: 409 });
      if (pack.sizesPerPack <= 0) throw Object.assign(new Error('The selected pack has an invalid size count.'), { status: 409 });

      const reserved = await tx.pack.updateMany({
        where: { id: pack.id, isActive: true, stockQuantity: { gte: line.numberOfPacks } },
        data: { stockQuantity: { decrement: line.numberOfPacks } },
      });
      if (reserved.count !== 1) {
        throw Object.assign(new Error(`Insufficient pack stock for ${productModel.modelNumber} / ${colour.name} / ${pack.sizesPerPack} sizes.`), { status: 409 });
      }
      const packPrice = roundMoney(productModel.price.mul(pack.sizesPerPack));
      const lineSubtotal = roundMoney(packPrice.mul(line.numberOfPacks));
      calculated.push({
        line,
        modelId: productModel.id,
        modelNumber: productModel.modelNumber,
        modelPrice: productModel.price,
        colourId: colour.id,
        colourName: colour.name,
        sizesPerPack: pack.sizesPerPack,
        packPrice,
        lineSubtotal,
      });
    }

    const { total: totalAmount } = orderDiscountTotals(calculated.map(entry => entry.lineSubtotal), body.discountPercentage);
    // Discount belongs to the sale as a whole. The legacy snapshot columns stay
    // populated with undiscounted line values for backwards-compatible reads.
    const snapshots = calculated.map(entry => ({
      ...entry,
      discountAllocation: new Prisma.Decimal(0),
      finalLineTotal: entry.lineSubtotal,
    }));
    const paidAmount = body.depositAmount ?? totalAmount;
    if (paidAmount.gt(totalAmount)) throw Object.assign(new Error('Deposit cannot be greater than the receipt total.'), { status: 400 });

    return tx.sale.create({
      data: {
        totalAmount,
        customerName: body.customerName || null,
        customerPhone: body.customerPhone || null,
        shopName: body.shopName || null,
        customerAddress: body.customerAddress || null,
        discountPercentage: body.discountPercentage,
        depositAmount: paidAmount,
        paidAmount,
        paidAt: paidAmount.eq(totalAmount) ? new Date() : null,
        items: {
          create: snapshots.map(entry => ({
            modelIdAtSale: entry.modelId,
            modelNumberAtSale: entry.modelNumber,
            modelPriceAtSale: entry.modelPrice,
            colourIdAtSale: entry.colourId,
            colourNameAtSale: entry.colourName,
            packId: entry.line.packId,
            sizesPerPackAtSale: entry.sizesPerPack,
            packPriceAtSale: entry.packPrice,
            numberOfPacks: entry.line.numberOfPacks,
            lineSubtotal: entry.lineSubtotal,
            discountAllocation: entry.discountAllocation,
            finalLineTotal: entry.finalLineTotal,
          })),
        },
      },
      include: { items: true },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  let result: Awaited<ReturnType<typeof createOnce>> | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { result = await createOnce(); break; }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
      if (attempt === 2) throw Object.assign(new Error('Inventory changed during checkout. Please try again.'), { status: 409 });
    }
  }
  if (!result) throw Object.assign(new Error('Inventory changed during checkout. Please try again.'), { status: 409 });
  console.info(JSON.stringify({ event: 'sale_created', requestId: req.requestId, adminId: req.adminId, saleId: result.id, lineCount: result.items.length }));
  res.status(201).json(result);
});

router.patch('/:id/pay', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.sale.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw Object.assign(new Error('Receipt not found'), { status: 404 });
    if (existing.paidAmount.gte(existing.totalAmount)) return existing;
    return tx.sale.update({ where: { id }, data: { paidAmount: existing.totalAmount, paidAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.info(JSON.stringify({ event: 'sale_paid', requestId: req.requestId, adminId: req.adminId, saleId: id }));
  res.json(result);
});

router.delete('/:id/permanent', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await prisma.$transaction(async tx => {
    const existing = await tx.sale.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error('Receipt not found'), { status: 404 });
    if (!existing.deletedAt) {
      throw Object.assign(new Error('Refund the receipt before permanently deleting it so inventory is restored.'), { status: 409 });
    }
    await tx.sale.delete({ where: { id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.info(JSON.stringify({ event: 'sale_deleted_permanently', requestId: req.requestId, adminId: req.adminId, saleId: id }));
  res.status(204).end();
});

router.delete('/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await prisma.$transaction(async tx => {
    const existing = await tx.sale.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw Object.assign(new Error('Receipt not found'), { status: 404 });
    if (existing.deletedAt) return;
    await tx.sale.update({ where: { id }, data: { deletedAt: new Date(), syncStatus: 'synced' } });
    for (const line of existing.items) {
      if (line.packId && line.numberOfPacks) {
        await tx.pack.update({ where: { id: line.packId }, data: { stockQuantity: { increment: line.numberOfPacks }, syncStatus: 'synced' } });
      } else if (line.itemVariantId && line.quantity) {
        await tx.itemVariant.update({ where: { id: line.itemVariantId }, data: { stockQuantity: { increment: line.quantity }, syncStatus: 'synced' } });
      } else {
        throw Object.assign(new Error('Receipt line has no restorable inventory reference.'), { status: 409 });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  console.info(JSON.stringify({ event: 'sale_refunded', requestId: req.requestId, adminId: req.adminId, saleId: id }));
  res.status(204).end();
});

export default router;
