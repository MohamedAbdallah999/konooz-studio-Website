import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { validate } from './middleware.js';

const router = Router();
const variant = z.object({
  id: z.string().uuid().optional(),
  size: z.string().trim().min(1).max(80),
  color: z.string().trim().min(1).max(50),
  stockQuantity: z.number().int().min(0).max(100000),
});
const item = z.object({
  id: z.string().uuid().optional(),
  modelNumber: z.string().trim().min(1).max(80),
  price: z.number().nonnegative().max(10000000),
  photoUrl: z.string().max(1_500_000).refine(
    value => /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(value) || /^https?:\/\//i.test(value),
    'Photo must be an uploaded image or a valid web URL',
  ).nullish(),
  material: z.string().max(500).nullish(),
  variants: z.array(variant).min(1),
}).superRefine((value, context) => {
  const combinations = new Set<string>();
  value.variants.forEach((entry, index) => {
    const normalized = `${entry.size.toLocaleLowerCase()}\u0000${entry.color.toLocaleLowerCase()}`;
    if (combinations.has(normalized)) {
      context.addIssue({ code: 'custom', path: ['variants', index], message: 'Each size and colour combination must be unique' });
    }
    combinations.add(normalized);
  });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const color = String(req.query.color ?? '').trim();
  const min = Number(req.query.minPrice ?? 0);
  const max = Number(req.query.maxPrice ?? Number.MAX_SAFE_INTEGER);
  const data = await prisma.item.findMany({
    where: {
      deletedAt: null,
      price: { gte: min, lt: max },
      AND: q ? [{
        OR: [
          { modelNumber: { contains: q, mode: 'insensitive' } },
          { material: { contains: q, mode: 'insensitive' } },
          { variants: { some: { size: { contains: q, mode: 'insensitive' }, deletedAt: null } } },
          { variants: { some: { color: { contains: q, mode: 'insensitive' }, deletedAt: null } } },
        ],
      }] : [],
      variants: color ? { some: { color: { contains: color, mode: 'insensitive' }, deletedAt: null } } : undefined,
    },
    include: { variants: { where: { deletedAt: null } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(data);
});

router.post('/', validate(item), async (req, res) => {
  const { variants, ...data } = req.body;
  const created = await prisma.item.create({
    data: { ...data, id: data.id, variants: { create: variants } },
    include: { variants: { where: { deletedAt: null } } },
  });
  res.status(201).json(created);
});

router.put('/:id', validate(item), async (req, res) => {
  const id = String(req.params.id);
  const { variants, ...data } = req.body;
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.item.findUniqueOrThrow({ where: { id }, include: { variants: true } });
    const retainedIds = variants.flatMap((entry: { id?: string }) => entry.id ? [entry.id] : []);
    await tx.itemVariant.updateMany({
      where: { itemId: id, id: { notIn: retainedIds }, deletedAt: null },
      data: { deletedAt: new Date(), syncStatus: 'synced' },
    });
    for (const entry of variants) {
      if (entry.id) {
        await tx.itemVariant.update({
          where: { id: entry.id, itemId: id },
          data: { size: entry.size, color: entry.color, stockQuantity: entry.stockQuantity, deletedAt: null, syncStatus: 'synced' },
        });
      } else {
        const reusable = existing.variants.find(candidate =>
          candidate.deletedAt && candidate.size.toLocaleLowerCase() === entry.size.toLocaleLowerCase() && candidate.color.toLocaleLowerCase() === entry.color.toLocaleLowerCase()
        );
        if (reusable) {
          await tx.itemVariant.update({
            where: { id: reusable.id },
            data: { size: entry.size, color: entry.color, stockQuantity: entry.stockQuantity, deletedAt: null, syncStatus: 'synced' },
          });
        } else {
          await tx.itemVariant.create({ data: { ...entry, itemId: id } });
        }
      }
    }
    return tx.item.update({
      where: { id: existing.id },
      data: { ...data, id: undefined, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
  });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.item.update({ where: { id }, data: { deletedAt, syncStatus: 'synced' } }),
    prisma.itemVariant.updateMany({ where: { itemId: id, deletedAt: null }, data: { deletedAt, syncStatus: 'synced' } }),
  ]);
  res.status(204).end();
});

export default router;
