# No-card production deployment

This project uses:

- Database: Neon Free
- API: Cloudflare Workers Free
- Frontend: Cloudflare Pages Free
- Source: GitHub

Cloudflare does not require a payment card for the Free plan. Do not use the removed Render Blueprint.

## Completed before this guide

The GitHub repository, Neon database, database schema, administrator seed, and initial frontend preparation were completed in Steps 1-4.

## Step 5 — apply the new production database migration

A new migration enables PostgreSQL `pgcrypto`, allowing password verification to run in Neon instead of consuming Cloudflare Worker CPU.

From the repository root in PowerShell, paste the same Neon connection string used previously:

```powershell
$env:DATABASE_URL="YOUR_NEON_CONNECTION_STRING"
npm run db:migrate -w backend
Remove-Item Env:DATABASE_URL
```

Do not run the administrator seed again. Your existing administrator and password remain valid.

## Step 6 — create a free Cloudflare account

1. Open https://dash.cloudflare.com/sign-up.
2. Create an account and verify the email address.
3. Stay on the Free plan; do not enter payment information.
4. In the dashboard, open **Workers & Pages** once so Cloudflare creates your `workers.dev` subdomain.

## Step 7 — authenticate Wrangler

From the repository root:

```powershell
cd backend
npx wrangler login
```

A browser opens. Sign in to Cloudflare and approve Wrangler. Return to PowerShell after it reports success.

## Step 8 — upload the five Worker secrets

Keep the PowerShell location inside `backend`.

### Database URL

```powershell
npx wrangler secret put DATABASE_URL
```

At the prompt, paste the Neon pooled connection string and press Enter.

### Frontend origin

If temporarily continuing with the existing Vercel deployment, use its exact stable URL. Do not include a trailing slash or `/api`.

```powershell
npx wrangler secret put FRONTEND_ORIGIN
```

Example value:

```text
https://konooz-studio.vercel.app
```

After Cloudflare Pages is created in Step 11, replace this secret with the final `pages.dev` URL.

### JWT secrets

Generate and upload two different secrets without writing them to a file:

```powershell
$accessSecret=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(64)).ToLower()
$accessSecret | npx wrangler secret put JWT_ACCESS_SECRET
Remove-Variable accessSecret

$refreshSecret=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(64)).ToLower()
$refreshSecret | npx wrangler secret put JWT_REFRESH_SECRET
Remove-Variable refreshSecret
```

There is no need to upload `ADMIN_USERNAME` or `ADMIN_PASSWORD`. The administrator already exists in Neon.

## Step 9 — deploy the API Worker

Still inside `backend`, run:

```powershell
npm run deploy:cloudflare
```

Wrangler prints the public URL, resembling:

```text
https://konooz-api.YOUR-SUBDOMAIN.workers.dev
```

Copy that URL. Open its health endpoint:

```text
https://konooz-api.YOUR-SUBDOMAIN.workers.dev/health
```

The expected response is:

```json
{"status":"ok","database":"connected"}
```

## Step 10 — connect the existing Vercel frontend temporarily

In Vercel:

1. Open the existing project.
2. Open **Settings > Environment Variables**.
3. Set `VITE_API_URL` to the Worker URL followed by `/api`:

   `https://konooz-api.YOUR-SUBDOMAIN.workers.dev/api`

4. Apply it to Production and Preview.
5. Open **Deployments**, select the latest deployment, and choose **Redeploy**.

This makes the already-created frontend operational immediately.

## Step 11 — move the frontend to Cloudflare Pages for no-card business use

Vercel Hobby is intended for personal, non-commercial use. For this shop system, use Cloudflare Pages Free for the final frontend.

1. In Cloudflare, open **Workers & Pages**.
2. Select **Create application > Pages > Connect to Git**.
3. Connect GitHub and select `konooz-studio`.
4. Use these build settings:

   - Production branch: `main`
   - Root directory: `frontend`
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`

5. Add environment variable:

   - Name: `VITE_API_URL`
   - Value: `https://konooz-api.YOUR-SUBDOMAIN.workers.dev/api`

6. Save and deploy.
7. Copy the stable Pages URL, resembling:

   `https://konooz-studio.pages.dev`

The included `frontend/public/_redirects` makes direct React routes such as `/inventory` and `/sales` work.

## Step 12 — allow the final Cloudflare Pages address

Return to PowerShell inside `backend`:

```powershell
npx wrangler secret put FRONTEND_ORIGIN
```

Paste the exact Pages address, with no trailing slash:

```text
https://konooz-studio.pages.dev
```

Deploy again so the Worker uses that value:

```powershell
npm run deploy:cloudflare
```

The final addresses are now:

```text
Frontend: https://konooz-studio.pages.dev
API:      https://konooz-api.YOUR-SUBDOMAIN.workers.dev
Health:   https://konooz-api.YOUR-SUBDOMAIN.workers.dev/health
```

## Step 13 — sign in

Open the Cloudflare Pages frontend and sign in with the administrator credentials created earlier. The frontend should never contain the Neon URL or JWT secrets.

## Future updates

Commit and push application changes:

```powershell
git add .
git commit -m "Describe the change"
git push
```

Cloudflare Pages redeploys the frontend automatically. Deploy backend changes from `backend` with:

```powershell
npm run deploy:cloudflare
```

If a new directory appears under `backend/prisma/migrations`, apply it to Neon before deploying the Worker:

```powershell
$env:DATABASE_URL="YOUR_NEON_CONNECTION_STRING"
npm run db:migrate -w backend
Remove-Item Env:DATABASE_URL
```