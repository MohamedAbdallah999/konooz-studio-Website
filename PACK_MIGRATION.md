# Model → colour → pack migration

## Production inventory captured on 2026-08-12

The production API was queried read-only before migration work:

- 9 active legacy models
- 172 active size/colour variants
- 636 legacy pieces in stock
- 44 case-insensitive model/colour groups
- 70 historical sales (all already refunded/soft-deleted), 162 sale lines, and a sale total of EGP 947,413,959.92; the active-only API initially hid these records
- 39 colour groups have the same stock count on every size
- 5 colour groups have unequal stock by size and cannot produce an integer pack count without an explicit business decision

On 2026-08-13, all 44 candidate rows in `backend/prisma/pack-mapping.production.csv` were explicitly approved and migrated. For unequal-stock groups, the approved conservative rule sets pack stock to the lowest constituent-size stock, so only complete packs become sellable. The 12 unmatched individual pieces remain untouched in the legacy tables. `Kashmer` and `Kasmer` remain separate to preserve the source labels.

### Ambiguous stock groups

| Model | Colour | Legacy size stocks | Candidate sizes/pack | Required decision |
|---|---|---:|---:|---|
| 1593 | White | L 1, M 1, XL 0, XXL 1 | 4 | 0 packs approved |
| 1553 | Beige | L 6, M 6, XL 6, XXL 7 | 4 | 6 packs approved |
| 1530 | Black | L 8, M 7, XL 8, XXL 8 | 4 | 7 packs approved |
| 1544 | Fushia | L 3, M 3, XL 3, XXL 5 | 4 | 3 packs approved |
| 1550 | Black | L 1, M 2, XL 2, XXL 2 | 4 | 1 pack approved |

The spelling pair `1550 / Kashmer` (M/L/XL) and `1550 / Kasmer` (XXL) remains two distinct colours, preserving source identity without a merge.

## Safe execution order

1. Put checkout/inventory writes into a maintenance window.
2. Confirm the production counts above have not changed.
3. Review every mapping row, supply the five missing pack quantities, resolve the Kashmer/Kasmer question, and change `approved` to `true` only after business approval.
4. Apply Prisma migrations. The first new migration creates a database-resident snapshot of all existing application data tables (products, variants, sales, sale lines, administrators, refresh sessions, and conflict logs); the second adds the normalized tables and snapshot columns without dropping legacy data.
5. Verify `konooz_pack_backup_20260812.manifest` before continuing.
6. Run `npm run db:migrate-packs -w backend -- prisma/pack-mapping.production.csv` against production. It aborts atomically on an unapproved row, missing/extra mapping, inventory drift, or pre-existing target data.
7. Run the validation queries below and save their output.
8. Deploy backend and frontend only when all values reconcile and smoke tests pass.

## Validation queries

Run `backend/prisma/validate-pack-migration.sql`. Expected after an approved mapping:

- model count: 9 legacy and 9 normalized
- normalized colours and packs: 44 unless an explicitly approved merge changes the mapping
- sales and sale totals unchanged
- zero orphaned colour/pack relationships
- zero incomplete new sale snapshots
- `represented_size_delta` explained and explicitly approved (normally zero for uniform legacy groups)

Legacy individual-size sale lines are never inferred as pack sales. Migration `202608130001_legacy_sale_snapshots` snapshots their original model, colour, size, price, quantity, discount allocation, and final line total. Three already-refunded header-only sales had no source lines; they remain preserved and are reported separately because their detail cannot be reconstructed.

## Production execution result — 2026-08-13

- Neon backup branch: `backup-pack-migration-20260813` (`br-orange-rice-as0f617x`), created before database changes.
- Database backup schema manifest: 35 items, 241 variants, 70 sales, 162 sale items, 1 administrator, 51 refresh sessions, 115 conflict logs.
- Active normalized catalogue: 9 models, 44 colours, 44 packs.
- Inventory: 636 legacy pieces retained, 169 complete packs available, representing 624 sizes; the 12-piece difference is the explicitly approved incomplete-pack remainder.
- Historical data: all 162 legacy lines have complete immutable snapshots; 3 refunded header-only receipts are preserved and flagged; no active header-only receipt exists.
- Final post-deployment validation (including three refunded production smoke receipts): 73 sales, 165 lines, zero orphans, zero incomplete pack snapshots, zero incomplete legacy snapshots, and zero receipt-total mismatches.

## Rollback

The rollout is additive: old `items`, `item_variants`, and legacy sale columns are not deleted or rewritten. Before any new-format sale is accepted, rollback is:

1. Re-deploy the previous Worker version and previous frontend deployment.
2. Leave the new tables in place; the old application continues using untouched legacy tables.
3. If the mapping transaction itself must be undone before new-format sales, delete rows from `packs`, `model_colours`, and `models` in that order inside one transaction.
4. Compare all legacy tables to `konooz_pack_backup_20260812` using primary keys and row counts.

After a new-format sale exists, do not delete normalized data. Preserve the sale snapshots, stop writes, export the new sale rows, and perform a reviewed forward repair. Rolling the old UI back would hide those sales even though the rows remain safe in PostgreSQL.
