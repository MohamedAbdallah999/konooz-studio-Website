ALTER TABLE "sales"
  ADD COLUMN "customer_phone" TEXT,
  ADD COLUMN "shop_name" TEXT,
  ADD COLUMN "customer_address" TEXT,
  ADD COLUMN "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "paid_at" TIMESTAMP(3);

-- Receipts created before partial payments existed were paid in full.
UPDATE "sales" SET "paid_amount" = "total_amount", "paid_at" = "created_at";

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_paid_amount_range" CHECK ("paid_amount" >= 0 AND "paid_amount" <= "total_amount");
