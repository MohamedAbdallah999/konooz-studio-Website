-- Additive phase only. Legacy items/item_variants and their sale columns are
-- intentionally preserved until an explicit, validated pack mapping is applied.

CREATE TABLE "models" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "model_number" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "photo_url" TEXT,
  "material" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
  CONSTRAINT "models_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "models_price_nonnegative" CHECK ("price" >= 0),
  CONSTRAINT "models_number_not_blank" CHECK (length(btrim("model_number")) > 0)
);

CREATE TABLE "model_colours" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "model_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
  CONSTRAINT "model_colours_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "model_colours_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "model_colours_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "packs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "model_colour_id" UUID NOT NULL,
  "sizes_per_pack" INTEGER NOT NULL,
  "stock_quantity" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sync_status" "SyncStatus" NOT NULL DEFAULT 'synced',
  CONSTRAINT "packs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "packs_sizes_per_pack_positive" CHECK ("sizes_per_pack" > 0),
  CONSTRAINT "packs_stock_quantity_nonnegative" CHECK ("stock_quantity" >= 0),
  CONSTRAINT "packs_model_colour_id_fkey" FOREIGN KEY ("model_colour_id") REFERENCES "model_colours"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "models_active_model_number_key" ON "models" (lower("model_number")) WHERE "is_active";
CREATE INDEX "models_model_number_idx" ON "models" ("model_number");
CREATE INDEX "models_active_updated_idx" ON "models" ("is_active", "updated_at");
CREATE UNIQUE INDEX "model_colours_active_name_key" ON "model_colours" ("model_id", lower("name")) WHERE "is_active";
CREATE INDEX "model_colours_model_active_idx" ON "model_colours" ("model_id", "is_active");
CREATE UNIQUE INDEX "packs_active_configuration_key" ON "packs" ("model_colour_id", "sizes_per_pack") WHERE "is_active";
CREATE INDEX "packs_colour_active_idx" ON "packs" ("model_colour_id", "is_active");
CREATE INDEX "packs_active_stock_idx" ON "packs" ("is_active", "stock_quantity");

ALTER TABLE "sale_items"
  ALTER COLUMN "item_variant_id" DROP NOT NULL,
  ALTER COLUMN "quantity" DROP NOT NULL,
  ALTER COLUMN "unit_price_at_sale" DROP NOT NULL,
  ADD COLUMN "model_id_at_sale" UUID,
  ADD COLUMN "model_number_at_sale" TEXT,
  ADD COLUMN "model_price_at_sale" DECIMAL(12,2),
  ADD COLUMN "colour_id_at_sale" UUID,
  ADD COLUMN "colour_name_at_sale" TEXT,
  ADD COLUMN "pack_id" UUID,
  ADD COLUMN "sizes_per_pack_at_sale" INTEGER,
  ADD COLUMN "pack_price_at_sale" DECIMAL(12,2),
  ADD COLUMN "number_of_packs" INTEGER,
  ADD COLUMN "line_subtotal" DECIMAL(12,2),
  ADD COLUMN "discount_allocation" DECIMAL(12,2),
  ADD COLUMN "final_line_total" DECIMAL(12,2),
  ADD CONSTRAINT "sale_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_complete_pack_snapshot" CHECK (
  (
    "pack_id" IS NULL AND "model_id_at_sale" IS NULL AND "model_number_at_sale" IS NULL AND
    "model_price_at_sale" IS NULL AND "colour_id_at_sale" IS NULL AND "colour_name_at_sale" IS NULL AND
    "sizes_per_pack_at_sale" IS NULL AND "pack_price_at_sale" IS NULL AND "number_of_packs" IS NULL AND
    "line_subtotal" IS NULL AND "discount_allocation" IS NULL AND "final_line_total" IS NULL
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

CREATE INDEX "sale_items_pack_id_idx" ON "sale_items" ("pack_id");
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" ("sale_id");
