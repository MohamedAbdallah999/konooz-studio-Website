import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '../backend/.env', quiet: true });

export default defineConfig({
  testDir: './e2e',
  testMatch: 'production-smoke.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'https://konooz-studio.pages.dev',
    trace: 'retain-on-failure',
  },
});
