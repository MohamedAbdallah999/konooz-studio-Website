-- Preserve every legacy piece-sale fact before the application stops joining
-- receipts to mutable item/variant records. Legacy lines remain legacy lines;
-- they are never inferred to be pack purchases.
ALTER TABLE "sale_items"
  ADD COLUMN "legacy_model_id_at_sale" UUID,
  ADD COLUMN "legacy_model_number_at_sale" TEXT,
  ADD COLUMN "legacy_model_price_at_sale" DECIMAL(12,2),
  ADD COLUMN "legacy_colour_name_at_sale" TEXT,
  ADD COLUMN "legacy_size_at_sale" TEXT;

ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_complete_pack_snapshot";

WITH base AS (
  SELECT
    si.id,
    si.sale_id,
    round(si.quantity * si.unit_price_at_sale, 2) AS line_subtotal,
    sum(round(si.quantity * si.unit_price_at_sale, 2)) OVER (PARTITION BY si.sale_id) AS sale_subtotal,
    s.total_amount,
    row_number() OVER (PARTITION BY si.sale_id ORDER BY si.id) AS line_number,
    count(*) OVER (PARTITION BY si.sale_id) AS line_count
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE si.item_variant_id IS NOT NULL
), preliminary AS (
  SELECT
    *,
    CASE
      WHEN line_number < line_count AND sale_subtotal > 0
        THEN round(line_subtotal / sale_subtotal * (sale_subtotal - total_amount), 2)
      WHEN line_number < line_count THEN 0::numeric
    END AS preliminary_discount
  FROM base
), allocated AS (
  SELECT
    *,
    CASE
      WHEN line_number = line_count THEN
        sale_subtotal - total_amount -
        COALESCE(sum(preliminary_discount) OVER (PARTITION BY sale_id), 0)
      ELSE preliminary_discount
    END AS discount_allocation
  FROM preliminary
)
UPDATE sale_items si
SET
  legacy_model_id_at_sale = i.id,
  legacy_model_number_at_sale = i.model_number,
  legacy_model_price_at_sale = si.unit_price_at_sale,
  legacy_colour_name_at_sale = v.color,
  legacy_size_at_sale = v.size,
  line_subtotal = a.line_subtotal,
  discount_allocation = a.discount_allocation,
  final_line_total = a.line_subtotal - a.discount_allocation
FROM allocated a, item_variants v, items i
WHERE si.id = a.id AND v.id = si.item_variant_id AND i.id = v.item_id;

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_complete_pack_snapshot" CHECK (
  (
    "pack_id" IS NULL AND "model_id_at_sale" IS NULL AND "model_number_at_sale" IS NULL AND
    "model_price_at_sale" IS NULL AND "colour_id_at_sale" IS NULL AND "colour_name_at_sale" IS NULL AND
    "sizes_per_pack_at_sale" IS NULL AND "pack_price_at_sale" IS NULL AND "number_of_packs" IS NULL
  ) OR (
    "pack_id" IS NOT NULL AND "model_id_at_sale" IS NOT NULL AND length(btrim("model_number_at_sale")) > 0 AND
    "model_price_at_sale" IS NOT NULL AND "model_price_at_sale" >= 0 AND "colour_id_at_sale" IS NOT NULL AND
    length(btrim("colour_name_at_sale")) > 0 AND "sizes_per_pack_at_sale" > 0 AND "pack_price_at_sale" >= 0 AND
    "number_of_packs" > 0 AND "line_subtotal" >= 0 AND "discount_allocation" >= 0 AND
    "discount_allocation" <= "line_subtotal" AND "final_line_total" = "line_subtotal" - "discount_allocation" AND
    "pack_price_at_sale" = "model_price_at_sale" * "sizes_per_pack_at_sale" AND
    "line_subtotal" = "pack_price_at_sale" * "number_of_packs"
  )
);

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_complete_legacy_snapshot" CHECK (
  (
    "item_variant_id" IS NULL AND "legacy_model_id_at_sale" IS NULL AND "legacy_model_number_at_sale" IS NULL AND
    "legacy_model_price_at_sale" IS NULL AND "legacy_colour_name_at_sale" IS NULL AND "legacy_size_at_sale" IS NULL
  ) OR (
    "item_variant_id" IS NOT NULL AND "legacy_model_id_at_sale" IS NOT NULL AND
    length(btrim("legacy_model_number_at_sale")) > 0 AND "legacy_model_price_at_sale" >= 0 AND
    length(btrim("legacy_colour_name_at_sale")) > 0 AND length(btrim("legacy_size_at_sale")) > 0 AND
    "quantity" > 0 AND "unit_price_at_sale" >= 0 AND "line_subtotal" = "unit_price_at_sale" * "quantity" AND
    "discount_allocation" >= 0 AND "discount_allocation" <= "line_subtotal" AND
    "final_line_total" = "line_subtotal" - "discount_allocation"
  )
);

