# Konooz — The Style You Love

Production-oriented offline-first inventory and point-of-sale system for a single-admin dress shop. This is a new build at `konooz-studio`; the pre-existing `konooz` repository was not modified.

## Included

React 19, Vite, TypeScript, Tailwind, Framer Motion, react-three-fiber/drei; Express 5, Prisma/PostgreSQL, Zod, Helmet, JWT and bcrypt cost 12; Dexie IndexedDB with an ordered offline queue, reconnect replay, LWW conflict audit; PWA, responsive layouts, inventory, checkout, transactional stock decrement, receipt printing/PDF, reporting, Docker, tests, and CI.

All dependencies are free/open-source. Fonts are locally bundled SIL-OFL packages. Browser printing replaces paid receipt services, and Pino provides local structured logs instead of paid monitoring.

## Local setup

1. Copy each `.env.example` to `.env`; replace JWT secrets and set a 12+ character admin password.
2. Run `docker compose up -d postgres`, then `npm install`.
3. Run `npm run db:migrate -w backend` and `npm run seed -w backend`. The seed refuses a second admin.
4. Run `npm run dev`; open `http://localhost:5173`.
5. Verify with `npm run typecheck`, `npm test`, and `npm run build`.

Never commit `.env`. The frontend receives only `VITE_API_URL`. Production uses Secure HttpOnly SameSite cookies, 15-minute access tokens, HTTPS enforcement, locked CORS/CSP, login throttling, Zod validation, parameterized Prisma access, and redacted logs.

## Free-tier deployment

Create free Neon or Supabase Postgres, set its pooled URL as `DATABASE_URL`, run the migration, then temporarily set admin seed variables and run the seed. Remove `ADMIN_PASSWORD` afterward. Free quotas change, so confirm storage/compute/bandwidth and keep exports; Render's expiring free Postgres is intentionally avoided.

For Render, connect GitHub as a free Docker web service using `backend/Dockerfile`. Set database URL, both JWT secrets, exact HTTPS `FRONTEND_ORIGIN`, `NODE_ENV=production`, and `PORT=4000`; health path is `/health`. Free Render services spin down and commonly take roughly 30–60 seconds to wake. The offline PWA continues locally, but first login must wait for wake-up.

For Vercel or Netlify, set root `frontend`, build `npm run build`, output `dist`, and `VITE_API_URL=https://YOUR-API/api`. Both suit this single-shop static frontend on their no-card free tiers; confirm current terms before launch. Their Git integrations and the included GitHub Actions workflow avoid paid deployment tooling.

## Printer and offline behavior

Install the receipt printer with its OS driver. From a receipt choose Print, select the system printer, disable browser headers/footers, and use an 80 mm roll. “Save PDF” uses the browser's PDF destination. Browsers intentionally cannot silently select printers without kiosk software.

The installed PWA reads/writes IndexedDB. Mutations enter `sync_queue` in timestamp order; reconnect pushes then pulls since `lastSync`. Newest `updated_at` wins, unequal versions are recorded in `conflict_logs`, and deletes use tombstones. Keep device time automatic. Multiple simultaneous admins would require version-based/domain merge instead of LWW.
