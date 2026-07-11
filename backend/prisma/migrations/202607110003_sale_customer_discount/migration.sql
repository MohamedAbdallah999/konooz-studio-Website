ALTER TABLE "sales"
  ADD COLUMN "customer_name" TEXT,
  ADD COLUMN "discount_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_discount_percentage_check"
  CHECK ("discount_percentage" >= 0 AND "discount_percentage" <= 100);