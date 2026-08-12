import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

type Mapping = { modelNumber: string; legacyColour: string; newColourName: string; sizesPerPack: number; stockQuantity: number; expectedSizeStocks: string; approved: boolean };
const file = resolve(process.argv[2] ?? 'prisma/pack-mapping.production.csv');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const lines = (await readFile(file, 'utf8')).trim().split(/\r?\n/);
const headers = lines.shift()?.split(',') ?? [];
const mappings = lines.map((line, index) => {
  const values = line.split(','), row = Object.fromEntries(headers.map((header, position) => [header, values[position] ?? '']));
  const stockQuantity = row.stockQuantity ?? '';
  if (!row.modelNumber || !row.legacyColour || !row.newColourName || !row.sizesPerPack || !row.expectedSizeStocks) throw new Error(`Mapping row ${index + 2} is incomplete.`);
  if (row.approved !== 'true') throw new Error(`Mapping row ${index + 2} (${row.modelNumber}/${row.legacyColour}) is not explicitly approved.`);
  if (!/^\d+$/.test(stockQuantity) || Number(stockQuantity) < 0) throw new Error(`Mapping row ${index + 2} requires an explicit nonnegative pack stock.`);
  if (!/^\d+$/.test(row.sizesPerPack) || Number(row.sizesPerPack) < 1 || Number(row.sizesPerPack) > 10_000) {
    throw new Error(`Mapping row ${index + 2} requires sizesPerPack between 1 and 10000.`);
  }
  if (Number(stockQuantity) > 100_000) throw new Error(`Mapping row ${index + 2} exceeds the maximum pack stock of 100000.`);
  return { modelNumber: row.modelNumber, legacyColour: row.legacyColour, newColourName: row.newColourName, sizesPerPack: Number(row.sizesPerPack), stockQuantity: Number(stockQuantity), expectedSizeStocks: row.expectedSizeStocks, approved: true } satisfies Mapping;
});

const duplicateMappingKeys = mappings
  .map(row => `${row.modelNumber.trim().toLocaleLowerCase()}\0${row.legacyColour.trim().toLocaleLowerCase()}`)
  .filter((key, index, keys) => keys.indexOf(key) !== index);
if (duplicateMappingKeys.length) throw new Error(`Duplicate mapping rows: ${JSON.stringify([...new Set(duplicateMappingKeys)])}`);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const report = await prisma.$transaction(async tx => {
    if (await tx.productModel.count()) throw new Error('New model tables are not empty. Refusing a non-idempotent migration.');
    const incompleteLegacySnapshots = (await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM sale_items
      WHERE item_variant_id IS NOT NULL AND (
        legacy_model_id_at_sale IS NULL OR legacy_model_number_at_sale IS NULL OR
        legacy_model_price_at_sale IS NULL OR legacy_colour_name_at_sale IS NULL OR
        legacy_size_at_sale IS NULL OR line_subtotal IS NULL OR
        discount_allocation IS NULL OR final_line_total IS NULL
      )
    `)[0]?.count ?? 0n;
    if (incompleteLegacySnapshots > 0n) {
      throw new Error(`Found ${incompleteLegacySnapshots} legacy sale line(s) without immutable snapshots.`);
    }
    const items = await tx.item.findMany({ where: { deletedAt: null }, include: { variants: { where: { deletedAt: null } } } });
    const mappingKeys = new Set(mappings.map(row => `${row.modelNumber.toLocaleLowerCase()}\0${row.legacyColour.toLocaleLowerCase()}`));
    const sourceKeys = new Set(items.flatMap(item => item.variants.map(variant => `${item.modelNumber.toLocaleLowerCase()}\0${variant.color.trim().toLocaleLowerCase()}`)));
    const missing = [...sourceKeys].filter(key => !mappingKeys.has(key)), extra = [...mappingKeys].filter(key => !sourceKeys.has(key));
    if (missing.length || extra.length) throw new Error(`Mapping coverage failed. Missing=${JSON.stringify(missing)} Extra=${JSON.stringify(extra)}`);

    let oldPieceStock = 0, representedSizes = 0;
    for (const item of items) {
      const groups = new Map<string, typeof item.variants>();
      for (const variant of item.variants) {
        const key = variant.color.trim().toLocaleLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), variant]);
        oldPieceStock += variant.stockQuantity;
      }
      const created = await tx.productModel.create({ data: { id: item.id, modelNumber: item.modelNumber, price: item.price, photoUrl: item.photoUrl, material: item.material, isActive: true } });
      for (const [legacyColour, variants] of groups) {
        const mapping = mappings.find(row => row.modelNumber.toLocaleLowerCase() === item.modelNumber.toLocaleLowerCase() && row.legacyColour.toLocaleLowerCase() === legacyColour)!;
        const actual = variants.map(variant => `${variant.size.trim().toUpperCase()}:${variant.stockQuantity}`).sort().join('|');
        const expected = mapping.expectedSizeStocks.split('|').map(value => { const [size, stock] = value.split(':'); return `${size!.trim().toUpperCase()}:${stock}`; }).sort().join('|');
        if (actual !== expected) throw new Error(`Source inventory drift for ${item.modelNumber}/${legacyColour}. Expected ${expected}; found ${actual}.`);
        const colour = await tx.modelColour.create({ data: { modelId: created.id, name: mapping.newColourName, isActive: true } });
        await tx.pack.create({ data: { modelColourId: colour.id, sizesPerPack: mapping.sizesPerPack, stockQuantity: mapping.stockQuantity, isActive: true } });
        representedSizes += mapping.sizesPerPack * mapping.stockQuantity;
      }
    }
    return { models: items.length, colours: mappings.length, packs: mappings.length, legacyPieceStock: oldPieceStock, migratedPackStock: mappings.reduce((sum, row) => sum + row.stockQuantity, 0), representedSizes, representedSizeDelta: representedSizes - oldPieceStock };
  }, { isolationLevel: 'Serializable', timeout: 60_000 });
  console.log(JSON.stringify(report, null, 2));
} finally { await prisma.$disconnect(); }
