import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', timeout: 60_000, fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev', cwd: '../backend', url: 'http://127.0.0.1:4010/health', reuseExistingServer: false, timeout: 60_000,
      env: { DATABASE_URL: 'postgresql://konooz:konooz@127.0.0.1:5432/konooz_pack_test?schema=public', JWT_ACCESS_SECRET: 'e2e-access-secret-at-least-32-characters', JWT_REFRESH_SECRET: 'e2e-refresh-secret-at-least-32-characters', FRONTEND_ORIGIN: 'http://127.0.0.1:4173', NODE_ENV: 'test', PORT: '4010' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4173', cwd: '.', url: 'http://127.0.0.1:4173/login', reuseExistingServer: false, timeout: 60_000, env: { VITE_API_URL: 'http://127.0.0.1:4010/api' } },
  ],
});
