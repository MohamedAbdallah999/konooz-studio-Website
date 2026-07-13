ALTER TABLE "item_variants" ADD COLUMN "size" TEXT;

UPDATE "item_variants" AS variant
SET "size" = COALESCE(NULLIF(TRIM(item."size"), ''), 'One size')
FROM "items" AS item
WHERE variant."item_id" = item."id";

ALTER TABLE "item_variants" ALTER COLUMN "size" SET NOT NULL;
ALTER TABLE "item_variants" DROP CONSTRAINT "item_variants_item_id_color_key";
CREATE UNIQUE INDEX "item_variants_active_size_color_key" ON "item_variants" ("item_id", LOWER("size"), LOWER("color")) WHERE "deleted_at" IS NULL;
CREATE INDEX "item_variants_item_id_size_color_idx" ON "item_variants" ("item_id", "size", "color");
ALTER TABLE "items" DROP CONSTRAINT "items_model_number_key";
CREATE UNIQUE INDEX "items_active_model_number_key" ON "items" (LOWER("model_number")) WHERE "deleted_at" IS NULL;
ALTER TABLE "items" DROP COLUMN "size";
