# Pages

## /login — Login
- Page: `frontend/src/pages/Login.tsx`
- Dependencies: `frontend/src/api.ts`, `frontend/src/components/SilkScene.tsx`
- Layout: standalone split-screen authentication layout.

## / — Overview
- Page: `frontend/src/pages/Dashboard.tsx`
- Dependencies: `frontend/src/db.ts`, `frontend/src/payments.ts`, `frontend/src/components/SilkScene.tsx`, `frontend/src/utils/money.ts`
- Layout: authenticated `Shell`.

## /inventory — Inventory
- Page: `frontend/src/pages/Inventory.tsx`
- Dependencies: `frontend/src/db.ts`, `frontend/src/types.ts`, `frontend/src/utils/image.ts`, `frontend/src/utils/colorSwatch.ts`, `frontend/src/utils/money.ts`, `frontend/src/pages/Inventory.css`, `frontend/src/components/AnimatedTitle.tsx`, `frontend/src/components/NumberInput.tsx`
- Layout: authenticated `Shell`.

## /sell — New sale
- Page: `frontend/src/pages/Sell.tsx`
- Dependencies: `frontend/src/db.ts`, `frontend/src/types.ts`, `frontend/src/components/Receipt.tsx`, `frontend/src/utils/colorSwatch.ts`, `frontend/src/components/AnimatedTitle.tsx`, `frontend/src/components/NumberInput.tsx`, `frontend/src/utils/money.ts`, `frontend/src/utils/cart.ts`
- Layout: authenticated `Shell`.

## /sales — Sales
- Page: `frontend/src/pages/Sales.tsx`
- Dependencies: `frontend/src/db.ts`, `frontend/src/types.ts`, `frontend/src/components/Receipt.tsx`, `frontend/src/payments.ts`, `frontend/src/components/AnimatedTitle.tsx`, `frontend/src/utils/money.ts`
- Layout: authenticated `Shell`.

All authenticated pages also depend on the Shell's `frontend/src/api.ts` and `frontend/src/hooks/useSync.ts`.

