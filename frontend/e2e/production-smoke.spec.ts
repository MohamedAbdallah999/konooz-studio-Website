import { expect, test } from '@playwright/test';

const api = 'https://konooz-api.mohamed234552.workers.dev/api';
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

test.skip(process.env.RUN_PRODUCTION_SMOKE !== '1', 'Production smoke is opt-in');
test.skip(!username || !password, 'Production credentials are required');

test('production model, authoritative sale, immutable receipt, refund, and deactivation', async ({ page }) => {
  const consoleErrors: string[] = [];
  const securityProbeErrors: string[] = [];
  const pageErrors: string[] = [];
  let securityProbeInFlight = false;
  page.on('console', message => { if (message.type() === 'error') (securityProbeInFlight ? securityProbeErrors : consoleErrors).push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  const suffix = Date.now().toString(36).toUpperCase();
  const modelNumber = `PROD-SMOKE-${suffix}`;
  const customerName = `Production Smoke ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Username').fill(username!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Enter Konooz' }).click();
  await expect(page).toHaveURL('https://konooz-studio.pages.dev/');

  // Recover only artifacts from an interrupted prior smoke run. Sales remain
  // preserved as refunded history and models are soft-deactivated.
  await page.evaluate(async apiUrl => {
    const token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}` };
    const sales = await (await fetch(`${apiUrl}/sales`, { headers })).json();
    for (const sale of sales.filter((entry: { customerName?: string; deletedAt?: string }) => entry.customerName?.startsWith('Production Smoke ') && !entry.deletedAt)) {
      const response = await fetch(`${apiUrl}/sales/${sale.id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error(`Could not refund prior smoke receipt ${sale.id}`);
    }
    const models = await (await fetch(`${apiUrl}/models`, { headers })).json();
    for (const model of models.filter((entry: { modelNumber: string }) => entry.modelNumber.startsWith('PROD-SMOKE-'))) {
      const response = await fetch(`${apiUrl}/models/${model.id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error(`Could not deactivate prior smoke model ${model.id}`);
    }
  }, api);

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Add model' }).click();
  await page.getByLabel('Model number').fill(modelNumber);
  await page.getByLabel('Base price per size (EGP)').fill('10.01');
  await page.getByLabel('Colour name').fill('Black');
  await page.getByLabel('Sizes per pack').fill('3');
  await page.getByLabel('Packs available').fill('5');
  await page.getByRole('button', { name: 'Save model' }).click();
  await expect(page.getByText(modelNumber, { exact: true })).toBeVisible();

  securityProbeInFlight = true;
  const selected = await page.evaluate(async ({ apiUrl, expectedModel }) => {
    const token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const models = await (await fetch(`${apiUrl}/models`, { headers })).json();
    const model = models.find((entry: { modelNumber: string }) => entry.modelNumber === expectedModel);
    const colour = model.colours[0], pack = colour.packs[0];
    const tampered = await fetch(`${apiUrl}/sales`, {
      method: 'POST', headers,
      body: JSON.stringify({ items: [{ modelId: model.id, colourId: colour.id, packId: pack.id, numberOfPacks: 2, price: '0.01', lineTotal: '0.02' }] }),
    });
    return { modelId: model.id, colourId: colour.id, packId: pack.id, tamperedStatus: tampered.status };
  }, { apiUrl: api, expectedModel: modelNumber });
  securityProbeInFlight = false;
  expect(selected.tamperedStatus).toBe(422);
  expect(securityProbeErrors).toEqual([expect.stringContaining('422')]);

  await page.goto('/sell');
  await page.getByRole('button', { name: new RegExp(modelNumber) }).click();
  await page.getByRole('button', { name: /Black/ }).click();
  await page.getByRole('button', { name: /3 sizes per pack/ }).click();
  await page.locator('.pack-quantity input').fill('2');
  await page.getByRole('button', { name: 'Add 2 packs' }).click();
  await page.getByLabel('Client name').fill(customerName);
  await page.getByLabel('Discount percentage').fill('12.50');
  await expect(page.getByText(/30\.03 EGP per pack.*60\.06 EGP line total.*3 remaining/)).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.locator('.receipt').getByText(modelNumber, { exact: true })).toBeVisible();
  await expect(page.locator('.receipt').getByText(/Black.*3 items per pack/)).toBeVisible();
  const receiptLine = page.locator('.receipt-lines article').first();
  await expect(receiptLine.getByText('60.06 EGP', { exact: true })).toBeVisible();
  await expect(receiptLine.getByText('− 7.51 EGP', { exact: true })).toBeVisible();
  await expect(receiptLine.getByText('52.55 EGP', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^konooz-receipt-.*\.pdf$/);

  await page.evaluate(async ({ apiUrl, expectedModel }) => {
    const token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const models = await (await fetch(`${apiUrl}/models`, { headers })).json();
    const model = models.find((entry: { modelNumber: string }) => entry.modelNumber === expectedModel);
    const colour = model.colours[0], pack = colour.packs[0];
    const response = await fetch(`${apiUrl}/models/${model.id}`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        expectedUpdatedAt: model.updatedAt, modelNumber: `${expectedModel}-CHANGED`, price: '99.99',
        photoUrl: null, material: null, isActive: true,
        colours: [{ id: colour.id, expectedUpdatedAt: colour.updatedAt, name: 'Gold', isActive: true,
          packs: [{ id: pack.id, expectedUpdatedAt: pack.updatedAt, sizesPerPack: 5, stockQuantity: 3, isActive: true }] }],
      }),
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiUrl: api, expectedModel: modelNumber });

  await page.goto('/sales');
  await page.getByPlaceholder(/Search/i).fill(customerName);
  await page.getByRole('button', { name: new RegExp(customerName) }).last().click();
  await expect(page.locator('.receipt').getByText(modelNumber, { exact: true })).toBeVisible();
  await expect(page.locator('.receipt').getByText(/Black.*3 items per pack/)).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Refund sale' }).click();
  await expect(page.getByText('Refunded', { exact: true })).toBeVisible();

  const restored = await page.evaluate(async ({ apiUrl, expectedModel }) => {
    const token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}` };
    const models = await (await fetch(`${apiUrl}/models`, { headers })).json();
    const model = models.find((entry: { modelNumber: string }) => entry.modelNumber === `${expectedModel}-CHANGED`);
    const stock = model.colours[0].packs[0].stockQuantity;
    const response = await fetch(`${apiUrl}/models/${model.id}`, { method: 'DELETE', headers });
    if (!response.ok) throw new Error(await response.text());
    const activeModels = await (await fetch(`${apiUrl}/models`, { headers })).json();
    return { stock, stillActive: activeModels.some((entry: { id: string }) => entry.id === model.id) };
  }, { apiUrl: api, expectedModel: modelNumber });
  expect(restored).toEqual({ stock: 5, stillActive: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sales');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
