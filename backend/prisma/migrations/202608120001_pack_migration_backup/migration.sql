-- Recoverable, database-resident snapshot of every application data table that
-- exists before the pack migration. This migration runs and commits before the
-- additive schema change.
CREATE SCHEMA IF NOT EXISTS "konooz_pack_backup_20260812";

CREATE TABLE "konooz_pack_backup_20260812"."items" AS TABLE public."items" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."item_variants" AS TABLE public."item_variants" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."sales" AS TABLE public."sales" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."sale_items" AS TABLE public."sale_items" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."admin_user" AS TABLE public."admin_user" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."refresh_sessions" AS TABLE public."refresh_sessions" WITH DATA;
CREATE TABLE "konooz_pack_backup_20260812"."conflict_logs" AS TABLE public."conflict_logs" WITH DATA;

CREATE TABLE "konooz_pack_backup_20260812"."manifest" (
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "items" BIGINT NOT NULL,
  "item_variants" BIGINT NOT NULL,
  "sales" BIGINT NOT NULL,
  "sale_items" BIGINT NOT NULL,
  "admin_users" BIGINT NOT NULL,
  "refresh_sessions" BIGINT NOT NULL,
  "conflict_logs" BIGINT NOT NULL,
  "sale_total" DECIMAL(18,2) NOT NULL
);

INSERT INTO "konooz_pack_backup_20260812"."manifest" (
  "items",
  "item_variants",
  "sales",
  "sale_items",
  "admin_users",
  "refresh_sessions",
  "conflict_logs",
  "sale_total"
)
SELECT
  (SELECT count(*) FROM public."items"),
  (SELECT count(*) FROM public."item_variants"),
  (SELECT count(*) FROM public."sales"),
  (SELECT count(*) FROM public."sale_items"),
  (SELECT count(*) FROM public."admin_user"),
  (SELECT count(*) FROM public."refresh_sessions"),
  (SELECT count(*) FROM public."conflict_logs"),
  (SELECT COALESCE(sum("total_amount"), 0) FROM public."sales");
