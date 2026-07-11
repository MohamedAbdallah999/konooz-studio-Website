import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { validate } from './middleware.js';

const router = Router();
const sale = z.object({
  id: z.string().uuid().optional(),
  createdAt: z.coerce.date().optional(),
  customerName: z.string().trim().max(120).nullish(),
  discountPercentage: z.number().min(0).max(100).default(0),
  items: z.array(z.object({
    id: z.string().uuid().optional(),
    itemVariantId: z.string().uuid(),
    quantity: z.number().int().positive().max(1000),
    unitPriceAtSale: z.number().nonnegative(),
  })).min(1),
});

router.get('/', async (_req, res) => {
  const data = await prisma.sale.findMany({
    where: { deletedAt: null },
    include: { items: { include: { itemVariant: { include: { item: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(data);
});

router.get('/summary', async (_req, res) => {
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: from }, deletedAt: null },
    select: { createdAt: true, totalAmount: true },
  });
  const days = new Map<string, number>();
  for (const entry of sales) {
    const key = entry.createdAt.toISOString().slice(0, 10);
    days.set(key, (days.get(key) ?? 0) + Number(entry.totalAmount));
  }
  res.json([...days].map(([date, total]) => ({ date, total })));
});

router.post('/', validate(sale), async (req, res) => {
  const body = req.body;
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let total = 0;
    for (const line of body.items) {
      const variant = await tx.itemVariant.findFirst({
        where: { id: line.itemVariantId, deletedAt: null, item: { deletedAt: null } },
      });
      if (!variant) throw Object.assign(new Error('This inventory item is no longer available'), { status: 409 });
      const reserved = await tx.itemVariant.updateMany({
        where: { id: variant.id, deletedAt: null, stockQuantity: { gte: line.quantity } },
        data: { stockQuantity: { decrement: line.quantity } },
      });
      if (reserved.count !== 1) {
        throw Object.assign(new Error(`Insufficient stock for ${variant.color}`), { status: 409 });
      }
      total += line.quantity * line.unitPriceAtSale;
    }
    const discountedTotal = Math.round(total * (1 - body.discountPercentage / 100) * 100) / 100;
    return tx.sale.create({
      data: {
        id: body.id,
        totalAmount: discountedTotal,
        customerName: body.customerName || null,
        discountPercentage: body.discountPercentage,
        createdAt: body.createdAt,
        items: { create: body.items },
      },
      include: { items: true },
    });
  });
  res.status(201).json(result);
});

export default router;
