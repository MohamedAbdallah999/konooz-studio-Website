import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const [sales, activeSales, deletedSales, saleLines, activeSaleLines, totals, dates, relationshipAudit, pricingAudit, snapshotAudit, headerOnlyAudit] = await Promise.all([
    prisma.sale.count(),
    prisma.sale.count({ where: { deletedAt: null } }),
    prisma.sale.count({ where: { deletedAt: { not: null } } }),
    prisma.saleItem.count(),
    prisma.saleItem.count({ where: { sale: { deletedAt: null } } }),
    prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { deletedAt: null } }),
    prisma.sale.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.$queryRaw<Array<{ orphan_lines: bigint; missing_variant: bigint; incomplete_legacy_values: bigint }>>`
      SELECT
        count(*) FILTER (WHERE s.id IS NULL) AS orphan_lines,
        count(*) FILTER (WHERE v.id IS NULL) AS missing_variant,
        count(*) FILTER (WHERE si.quantity IS NULL OR si.quantity <= 0 OR si.unit_price_at_sale IS NULL OR si.unit_price_at_sale < 0) AS incomplete_legacy_values
      FROM sale_items si
      LEFT JOIN sales s ON s.id = si.sale_id
      LEFT JOIN item_variants v ON v.id = si.item_variant_id
    `,
    prisma.$queryRaw<Array<{ discounted_sales: bigint; subtotal_mismatches: bigint; negative_discounts: bigint; subtotal_total_difference: unknown }>>`
      SELECT
        count(*) FILTER (WHERE s.discount_percentage > 0) AS discounted_sales,
        count(*) FILTER (WHERE lines.subtotal <> s.total_amount) AS subtotal_mismatches,
        count(*) FILTER (WHERE lines.subtotal < s.total_amount) AS negative_discounts,
        COALESCE(sum(lines.subtotal - s.total_amount), 0)::text AS subtotal_total_difference
      FROM sales s
      JOIN (
        SELECT sale_id, sum(quantity * unit_price_at_sale) AS subtotal
        FROM sale_items GROUP BY sale_id
      ) lines ON lines.sale_id = s.id
    `,
    prisma.$queryRaw<Array<{ mismatched_receipts: bigint; total_difference: unknown; invalid_allocations: bigint; largest_absolute_difference: unknown }>>`
      SELECT
        count(*) FILTER (WHERE lines.final_total <> s.total_amount) AS mismatched_receipts,
        COALESCE(sum(lines.final_total - s.total_amount), 0)::text AS total_difference,
        COALESCE(sum(lines.invalid_allocations), 0)::bigint AS invalid_allocations,
        COALESCE(max(abs(lines.final_total - s.total_amount)), 0)::text AS largest_absolute_difference
      FROM sales s
      JOIN (
        SELECT sale_id, COALESCE(sum(final_line_total), 0) AS final_total,
          count(*) FILTER (WHERE discount_allocation < 0 OR discount_allocation > line_subtotal) AS invalid_allocations
        FROM sale_items GROUP BY sale_id
      ) lines ON lines.sale_id = s.id
    `,
    prisma.$queryRaw<Array<{ header_only_sales: bigint; header_only_total: unknown }>>`
      SELECT count(*) AS header_only_sales, COALESCE(sum(s.total_amount), 0)::text AS header_only_total
      FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id)
    `,
  ]);
  const audit = relationshipAudit[0]!;
  const pricing = pricingAudit[0]!;
  const snapshots = snapshotAudit[0]!;
  const headerOnly = headerOnlyAudit[0]!;
  console.log(JSON.stringify({
    sales,
    activeSales,
    deletedSales,
    saleLines,
    activeSaleLines,
    activeSaleTotal: totals._sum.totalAmount?.toFixed(2) ?? '0.00',
    oldestSale: dates._min.createdAt,
    newestSale: dates._max.createdAt,
    orphanLines: Number(audit.orphan_lines),
    missingVariants: Number(audit.missing_variant),
    incompleteLegacyValues: Number(audit.incomplete_legacy_values),
    discountedSales: Number(pricing.discounted_sales),
    subtotalMismatches: Number(pricing.subtotal_mismatches),
    negativeDiscounts: Number(pricing.negative_discounts),
    subtotalTotalDifference: String(pricing.subtotal_total_difference),
    snapshotMismatchedReceipts: Number(snapshots.mismatched_receipts),
    snapshotTotalDifference: String(snapshots.total_difference),
    snapshotInvalidAllocations: Number(snapshots.invalid_allocations),
    largestSnapshotDifference: String(snapshots.largest_absolute_difference),
    headerOnlySales: Number(headerOnly.header_only_sales),
    headerOnlyTotal: String(headerOnly.header_only_total),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
