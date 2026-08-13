import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

const router = Router();
const versionQuery = Prisma.sql`
  SELECT COALESCE(MAX(updated_at), TIMESTAMP 'epoch')::text || ':' || COUNT(*)::text AS version
  FROM (
    SELECT updated_at FROM models
    UNION ALL SELECT updated_at FROM model_colours
    UNION ALL SELECT updated_at FROM packs
    UNION ALL SELECT updated_at FROM sales
    UNION ALL SELECT updated_at FROM sale_items
  ) changes
`;

router.get('/', async (req, res) => {
  const current = (await prisma.$queryRaw<Array<{ version: string }>>(versionQuery))[0]?.version ?? 'epoch';
  if (req.query.version === current) {
    res.json({ unchanged: true, version: current });
    return;
  }
  const state = await prisma.$transaction(async tx => {
    const [models, sales, versionRows] = await Promise.all([
      tx.productModel.findMany({
        where: { isActive: true },
        include: {
          colours: {
            where: { isActive: true },
            orderBy: { name: 'asc' },
            include: { packs: { where: { isActive: true }, orderBy: { sizesPerPack: 'asc' } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      tx.sale.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { items: true },
      }),
      tx.$queryRaw<Array<{ version: string }>>(versionQuery),
    ]);
    return { models, sales, version: versionRows[0]?.version ?? current, serverTime: new Date().toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.json(state);
});

export default router;
