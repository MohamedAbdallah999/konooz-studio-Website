import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './db.js';
import { validate } from './middleware.js';

const router = Router();
const timestamp = z.string().datetime();
const price = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/)
  .refine(value => new Prisma.Decimal(value).lte(10_000_000), 'Price cannot exceed 10000000')
  .transform(value => new Prisma.Decimal(value));

const pack = z.object({
  id: z.string().uuid().optional(),
  expectedUpdatedAt: timestamp.optional(),
  sizesPerPack: z.number().int().positive().max(10_000),
  stockQuantity: z.number().int().nonnegative().max(100_000),
  isActive: z.boolean().default(true),
}).strict();

const colour = z.object({
  id: z.string().uuid().optional(),
  expectedUpdatedAt: timestamp.optional(),
  name: z.string().trim().min(1).max(80),
  isActive: z.boolean().default(true),
  packs: z.array(pack).min(1).max(100),
}).strict().superRefine((value, context) => {
  const configurations = new Set<number>();
  value.packs.filter(entry => entry.isActive).forEach((entry, index) => {
    if (configurations.has(entry.sizesPerPack)) {
      context.addIssue({ code: 'custom', path: ['packs', index], message: 'Pack sizes must be unique within a colour' });
    }
    configurations.add(entry.sizesPerPack);
  });
});

const model = z.object({
  id: z.string().uuid().optional(),
  expectedUpdatedAt: timestamp.optional(),
  modelNumber: z.string().trim().min(1).max(80),
  price,
  photoUrl: z.string().max(1_500_000).refine(
    value => /^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(value) || /^https?:\/\//i.test(value),
    'Photo must be an uploaded image or a valid web URL',
  ).nullish(),
  material: z.string().max(500).nullish(),
  isActive: z.boolean().default(true),
  colours: z.array(colour).min(1).max(100),
}).strict().superRefine((value, context) => {
  const names = new Set<string>();
  value.colours.filter(entry => entry.isActive).forEach((entry, index) => {
    const normalized = entry.name.toLocaleLowerCase();
    if (names.has(normalized)) {
      context.addIssue({ code: 'custom', path: ['colours', index], message: 'Colour names must be unique within a model' });
    }
    names.add(normalized);
  });
});

const activeTree = {
  colours: {
    where: { isActive: true },
    orderBy: { name: 'asc' as const },
    include: { packs: { where: { isActive: true }, orderBy: { sizesPerPack: 'asc' as const } } },
  },
};

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const data = await prisma.productModel.findMany({
    where: {
      isActive: true,
      OR: q ? [
        { modelNumber: { contains: q, mode: 'insensitive' } },
        { material: { contains: q, mode: 'insensitive' } },
        { colours: { some: { name: { contains: q, mode: 'insensitive' }, isActive: true } } },
      ] : undefined,
    },
    include: activeTree,
    orderBy: { updatedAt: 'desc' },
  });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const data = await prisma.productModel.findFirst({ where: { id, isActive: true }, include: activeTree });
  if (!data) throw Object.assign(new Error('Model not found'), { status: 404 });
  res.json(data);
});

router.post('/', validate(model), async (req, res) => {
  const { colours, expectedUpdatedAt: _version, ...data } = req.body as z.infer<typeof model>;
  const created = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.modelNumber.toLocaleLowerCase()}))`;
    const duplicate = await tx.productModel.findFirst({
      where: { modelNumber: { equals: data.modelNumber, mode: 'insensitive' }, isActive: true },
    });
    if (duplicate) throw Object.assign(new Error('A model with this number already exists.'), { status: 409 });
    return tx.productModel.create({
      data: {
        ...data,
        colours: {
          create: colours.map(({ expectedUpdatedAt: _colourVersion, packs, ...colourData }) => ({
            ...colourData,
            packs: { create: packs.map(({ expectedUpdatedAt: _packVersion, ...packData }) => packData) },
          })),
        },
      },
      include: activeTree,
    });
  });
  res.status(201).json(created);
});

router.put('/:id', validate(model), async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const { colours, expectedUpdatedAt, ...data } = req.body as z.infer<typeof model>;
  const updated = await prisma.$transaction(async tx => {
    const existing = await tx.productModel.findUnique({
      where: { id },
      include: { colours: { include: { packs: true } } },
    });
    if (!existing) throw Object.assign(new Error('Model not found'), { status: 404 });
    if (!expectedUpdatedAt || existing.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw Object.assign(new Error('This model changed on another device. Reload it and try again.'), { status: 409 });
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.modelNumber.toLocaleLowerCase()}))`;
    const duplicate = await tx.productModel.findFirst({
      where: { id: { not: id }, modelNumber: { equals: data.modelNumber, mode: 'insensitive' }, isActive: true },
    });
    if (duplicate) throw Object.assign(new Error('A model with this number already exists.'), { status: 409 });

    for (const colourInput of colours) {
      const currentColour = colourInput.id ? existing.colours.find(candidate => candidate.id === colourInput.id) : undefined;
      if (colourInput.id && (!currentColour || !colourInput.expectedUpdatedAt || currentColour.updatedAt.toISOString() !== colourInput.expectedUpdatedAt)) {
        throw Object.assign(new Error('A colour changed on another device or belongs to another model.'), { status: 409 });
      }
      for (const packInput of colourInput.packs) {
        if (!packInput.id) continue;
        const currentPack = currentColour?.packs.find(candidate => candidate.id === packInput.id);
        if (!currentPack || !packInput.expectedUpdatedAt || currentPack.updatedAt.toISOString() !== packInput.expectedUpdatedAt) {
          throw Object.assign(new Error('A pack changed on another device or belongs to another model/colour.'), { status: 409 });
        }
      }
    }

    await tx.pack.updateMany({ where: { modelColour: { modelId: id } }, data: { isActive: false } });
    await tx.modelColour.updateMany({ where: { modelId: id }, data: { isActive: false } });

    for (const colourInput of colours) {
      const { expectedUpdatedAt: _colourVersion, packs, ...colourData } = colourInput;
      let colourId = colourInput.id;
      if (colourId) {
        await tx.modelColour.update({ where: { id: colourId }, data: colourData });
      } else {
        const createdColour = await tx.modelColour.create({ data: { ...colourData, modelId: id } });
        colourId = createdColour.id;
      }
      for (const packInput of packs) {
        const { expectedUpdatedAt: _packVersion, ...packData } = packInput;
        if (packInput.id) {
          await tx.pack.update({ where: { id: packInput.id }, data: packData });
        } else {
          await tx.pack.create({ data: { ...packData, modelColourId: colourId } });
        }
      }
      if (!colourData.isActive) await tx.pack.updateMany({ where: { modelColourId: colourId }, data: { isActive: false } });
    }

    await tx.productModel.update({ where: { id }, data: { ...data, id: undefined } });
    return tx.productModel.findUniqueOrThrow({ where: { id }, include: activeTree });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  await prisma.$transaction(async tx => {
    const existing = await tx.productModel.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error('Model not found'), { status: 404 });
    await tx.pack.updateMany({ where: { modelColour: { modelId: id } }, data: { isActive: false } });
    await tx.modelColour.updateMany({ where: { modelId: id }, data: { isActive: false } });
    await tx.productModel.update({ where: { id }, data: { isActive: false } });
  });
  res.status(204).end();
});

export default router;
