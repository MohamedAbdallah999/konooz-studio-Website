ALTER TABLE "sales"
  ADD COLUMN "deposit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Before deposit history was stored separately, paid receipts are treated as
-- having received their current paid amount at creation.
UPDATE "sales" SET "deposit_amount" = "paid_amount";

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_deposit_amount_range"
  CHECK ("deposit_amount" >= 0 AND "deposit_amount" <= "paid_amount");
