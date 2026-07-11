# Production deployment

This project is prepared for this deployment layout:

- PostgreSQL: Neon
- API: Render (Docker Blueprint)
- Frontend: Vercel
- Source: GitHub

Never commit `backend/.env` or `frontend/.env`. Render and Vercel must hold production values.

## 1. Push the repository to GitHub

Create a private GitHub repository, then run from the project root:

```powershell
git add .
git commit -m "Prepare production deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/konooz-studio.git
git push -u origin main
```

If `origin` already exists, do not add it again. Confirm the local secret files are ignored:

```powershell
git check-ignore backend/.env frontend/.env
```

Both paths should be printed.

## 2. Create Neon PostgreSQL

1. Sign in at https://console.neon.tech/.
2. Create a project named `konooz-production`.
3. Choose a region close to the Render region you will use.
4. Click **Connect** and copy the pooled PostgreSQL connection string.
5. Keep `sslmode=require` in the connection string.

This string is the production `DATABASE_URL`. Do not put it in a repository file.

## 3. Create the database schema and administrator

In a new PowerShell window, substitute your real values:

```powershell
$env:DATABASE_URL="YOUR_NEON_CONNECTION_STRING"
$env:ADMIN_USERNAME="YOUR_ADMIN_EMAIL"
$env:ADMIN_PASSWORD="YOUR_LONG_UNIQUE_PASSWORD"
npm run db:migrate -w backend
npm run seed -w backend
Remove-Item Env:DATABASE_URL
Remove-Item Env:ADMIN_USERNAME
Remove-Item Env:ADMIN_PASSWORD
```

The seed intentionally refuses to create a second administrator. Store the administrator password in a password manager.

## 4. Create the Vercel frontend

1. Sign in at https://vercel.com/ with GitHub.
2. Select **Add New > Project** and import the GitHub repository.
3. Set **Root Directory** to `frontend`.
4. Select the **Vite** framework preset.
5. Use build command `npm run build` and output directory `dist`.
6. Add a temporary environment variable:

   `VITE_API_URL=https://temporary.invalid/api`

7. Apply it to Production and Preview, then deploy.
8. Copy the stable project URL, such as `https://konooz-studio.vercel.app`.

The included `frontend/vercel.json` makes direct visits to `/inventory`, `/sell`, and `/sales` load the React application.

## 5. Create the Render backend from the Blueprint

1. Sign in at https://dashboard.render.com/ with GitHub.
2. Select **New > Blueprint**.
3. Connect the GitHub repository.
4. Render will detect the root `render.yaml` and create `konooz-api`.
5. When prompted, enter:

   - `DATABASE_URL`: the Neon connection string.
   - `FRONTEND_ORIGIN`: the exact stable Vercel URL, with `https://` and no trailing slash.

6. Render generates both JWT secrets automatically.
7. Apply the Blueprint and wait for the deployment.

The Docker container automatically runs pending Prisma migrations before starting. The configured `/health` check also verifies database connectivity.

## 6. Connect Vercel to Render

After Render supplies a URL such as `https://konooz-api.onrender.com`:

1. Open `https://konooz-api.onrender.com/health` and confirm it returns `status: ok` and `database: connected`.
2. In Vercel, open **Project > Settings > Environment Variables**.
3. Replace `VITE_API_URL` with:

   `https://konooz-api.onrender.com/api`

4. Apply it to Production and Preview.
5. Open **Deployments**, select the latest deployment, and choose **Redeploy**.

## 7. Confirm the allowed frontend origin

The Render variable must exactly match the browser origin:

```text
FRONTEND_ORIGIN=https://konooz-studio.vercel.app
```

There must be no trailing slash and no `/api`. If the Vercel project received a different stable URL, update `FRONTEND_ORIGIN` in Render and redeploy the backend.

## 8. Custom domains (optional)

A suitable arrangement is:

```text
app.yourdomain.com -> Vercel
api.yourdomain.com -> Render
```

Then update and redeploy:

```text
Render: FRONTEND_ORIGIN=https://app.yourdomain.com
Vercel: VITE_API_URL=https://api.yourdomain.com/api
```

## 9. Future deployments

Push application changes to `main`:

```powershell
git add .
git commit -m "Describe the change"
git push
```

Render and Vercel will deploy the new commit automatically. Commit every new directory created under `backend/prisma/migrations`; Render applies pending migrations during startup.