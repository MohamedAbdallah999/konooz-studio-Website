CREATE TABLE "login_rate_limits" (
  "key" VARCHAR(64) NOT NULL,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMP(3) NOT NULL,
  "blocked_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_rate_limits_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "login_rate_limits_failure_count_nonnegative" CHECK ("failure_count" >= 0)
);

CREATE INDEX "login_rate_limits_updated_at_idx" ON "login_rate_limits"("updated_at");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_total_amount_nonnegative" CHECK ("total_amount" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_exactly_one_inventory_format" CHECK (
    (("pack_id" IS NOT NULL)::integer + ("item_variant_id" IS NOT NULL)::integer) = 1
  );
