SELECT
  (SELECT count(*) FROM items WHERE deleted_at IS NULL) AS legacy_models,
  (SELECT count(*) FROM models WHERE is_active) AS normalized_models,
  (SELECT count(*) FROM model_colours WHERE is_active) AS normalized_colours,
  (SELECT count(*) FROM packs WHERE is_active) AS normalized_packs;

SELECT
  (SELECT COALESCE(sum(v.stock_quantity), 0) FROM item_variants v JOIN items i ON i.id=v.item_id WHERE v.deleted_at IS NULL AND i.deleted_at IS NULL) AS legacy_piece_stock,
  (SELECT COALESCE(sum(stock_quantity), 0) FROM packs WHERE is_active) AS pack_stock,
  (SELECT COALESCE(sum(stock_quantity * sizes_per_pack), 0) FROM packs WHERE is_active) AS represented_sizes,
  (SELECT COALESCE(sum(stock_quantity * sizes_per_pack), 0) FROM packs WHERE is_active)
    - (SELECT COALESCE(sum(v.stock_quantity), 0) FROM item_variants v JOIN items i ON i.id=v.item_id WHERE v.deleted_at IS NULL AND i.deleted_at IS NULL) AS represented_size_delta;

SELECT
  (SELECT count(*) FROM sales) AS sales,
  (SELECT count(*) FROM sale_items) AS sale_lines,
  (SELECT COALESCE(sum(total_amount), 0) FROM sales) AS sale_total,
  (SELECT COALESCE(sum(final_line_total), 0) FROM sale_items) AS all_line_total,
  (SELECT COALESCE(sum(total_amount), 0) FROM sales s WHERE EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)) AS receipts_with_lines_total,
  (SELECT count(*) FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)) AS header_only_receipts,
  (SELECT COALESCE(sum(total_amount), 0) FROM sales s WHERE NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id)) AS header_only_total,
  (SELECT COALESCE(sum(final_line_total), 0) FROM sale_items WHERE pack_id IS NOT NULL) AS new_pack_line_total;

SELECT 'colour_without_model' AS problem, count(*) AS records
FROM model_colours c LEFT JOIN models m ON m.id = c.model_id WHERE m.id IS NULL
UNION ALL
SELECT 'pack_without_colour', count(*)
FROM packs p LEFT JOIN model_colours c ON c.id = p.model_colour_id WHERE c.id IS NULL
UNION ALL
SELECT 'new_sale_line_without_pack', count(*)
FROM sale_items WHERE model_id_at_sale IS NOT NULL AND pack_id IS NULL
UNION ALL
SELECT 'incomplete_new_snapshot', count(*)
FROM sale_items
WHERE pack_id IS NOT NULL AND (
  model_id_at_sale IS NULL OR model_number_at_sale IS NULL OR model_price_at_sale IS NULL OR
  colour_id_at_sale IS NULL OR colour_name_at_sale IS NULL OR sizes_per_pack_at_sale IS NULL OR
  pack_price_at_sale IS NULL OR number_of_packs IS NULL OR line_subtotal IS NULL OR
  discount_allocation IS NULL OR final_line_total IS NULL
)
UNION ALL
SELECT 'incomplete_legacy_snapshot', count(*)
FROM sale_items
WHERE item_variant_id IS NOT NULL AND (
  legacy_model_id_at_sale IS NULL OR legacy_model_number_at_sale IS NULL OR
  legacy_model_price_at_sale IS NULL OR legacy_colour_name_at_sale IS NULL OR
  legacy_size_at_sale IS NULL OR line_subtotal IS NULL OR
  discount_allocation IS NULL OR final_line_total IS NULL
)
UNION ALL
SELECT 'mismatched_receipt_total', count(*)
FROM sales s JOIN (SELECT sale_id, sum(final_line_total) AS total FROM sale_items GROUP BY sale_id) lines ON lines.sale_id=s.id
WHERE lines.total <> s.total_amount
UNION ALL
SELECT 'active_header_only_receipt', count(*)
FROM sales s WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id);

SELECT * FROM konooz_pack_backup_20260812.manifest;
