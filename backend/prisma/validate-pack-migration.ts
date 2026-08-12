import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const count = async (sql: string) => Number((await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(sql))[0]?.value ?? 0n);
const amount = async (sql: string) => String((await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(sql))[0]?.value ?? '0.00');

try {
  const report = {
    models: {
      legacy: await count('SELECT count(*) AS value FROM items WHERE deleted_at IS NULL'),
      normalized: await count('SELECT count(*) AS value FROM models WHERE is_active'),
    },
    colours: await count('SELECT count(*) AS value FROM model_colours WHERE is_active'),
    packs: await count('SELECT count(*) AS value FROM packs WHERE is_active'),
    stock: {
      legacyPieces: await count('SELECT COALESCE(sum(v.stock_quantity), 0)::bigint AS value FROM item_variants v JOIN items i ON i.id=v.item_id WHERE v.deleted_at IS NULL AND i.deleted_at IS NULL'),
      availablePacks: await count('SELECT COALESCE(sum(stock_quantity), 0)::bigint AS value FROM packs WHERE is_active'),
      representedSizes: await count('SELECT COALESCE(sum(stock_quantity * sizes_per_pack), 0)::bigint AS value FROM packs WHERE is_active'),
    },
    sales: {
      count: await count('SELECT count(*) AS value FROM sales'),
      lines: await count('SELECT count(*) AS value FROM sale_items'),
      total: await amount('SELECT COALESCE(sum(total_amount), 0)::text AS value FROM sales'),
      lineTotal: await amount('SELECT COALESCE(sum(final_line_total), 0)::text AS value FROM sale_items'),
      packLineTotal: await amount('SELECT COALESCE(sum(final_line_total), 0)::text AS value FROM sale_items WHERE pack_id IS NOT NULL'),
      receiptsWithLinesTotal: await amount('SELECT COALESCE(sum(total_amount), 0)::text AS value FROM sales s WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)'),
      headerOnlyCount: await count('SELECT count(*) AS value FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)'),
      activeHeaderOnlyCount: await count('SELECT count(*) AS value FROM sales s WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)'),
      headerOnlyTotal: await amount('SELECT COALESCE(sum(total_amount), 0)::text AS value FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)'),
      mismatchedReceiptTotals: await count(`SELECT count(*) AS value FROM sales s JOIN (
        SELECT sale_id, sum(final_line_total) AS total FROM sale_items GROUP BY sale_id
      ) lines ON lines.sale_id=s.id WHERE lines.total <> s.total_amount`),
    },
    integrity: {
      coloursWithoutModel: await count('SELECT count(*) AS value FROM model_colours c LEFT JOIN models m ON m.id=c.model_id WHERE m.id IS NULL'),
      packsWithoutColour: await count('SELECT count(*) AS value FROM packs p LEFT JOIN model_colours c ON c.id=p.model_colour_id WHERE c.id IS NULL'),
      newLinesWithoutPack: await count('SELECT count(*) AS value FROM sale_items WHERE model_id_at_sale IS NOT NULL AND pack_id IS NULL'),
      incompleteSnapshots: await count(`SELECT count(*) AS value FROM sale_items WHERE pack_id IS NOT NULL AND (
        model_id_at_sale IS NULL OR model_number_at_sale IS NULL OR model_price_at_sale IS NULL OR
        colour_id_at_sale IS NULL OR colour_name_at_sale IS NULL OR sizes_per_pack_at_sale IS NULL OR
        pack_price_at_sale IS NULL OR number_of_packs IS NULL OR line_subtotal IS NULL OR
        discount_allocation IS NULL OR final_line_total IS NULL
      )`),
      incompleteLegacySnapshots: await count(`SELECT count(*) AS value FROM sale_items WHERE item_variant_id IS NOT NULL AND (
        legacy_model_id_at_sale IS NULL OR legacy_model_number_at_sale IS NULL OR
        legacy_model_price_at_sale IS NULL OR legacy_colour_name_at_sale IS NULL OR
        legacy_size_at_sale IS NULL OR line_subtotal IS NULL OR
        discount_allocation IS NULL OR final_line_total IS NULL
      )`),
    },
    backup: (await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      'SELECT * FROM konooz_pack_backup_20260812.manifest ORDER BY created_at DESC LIMIT 1',
    ))[0] ?? null,
  };
  console.log(JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  if (
    report.models.legacy !== report.models.normalized || report.colours !== 44 || report.packs !== 44 ||
    report.sales.receiptsWithLinesTotal !== report.sales.lineTotal || report.sales.mismatchedReceiptTotals !== 0 ||
    report.sales.activeHeaderOnlyCount !== 0 || Object.values(report.integrity).some(Boolean) || !report.backup
  ) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
