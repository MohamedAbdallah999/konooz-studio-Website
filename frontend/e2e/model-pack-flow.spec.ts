import { Client } from 'pg';
import { expect, test } from '@playwright/test';

const databaseUrl = 'postgresql://konooz:konooz@127.0.0.1:5432/konooz_pack_test?schema=public';

test.beforeAll(async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('TRUNCATE sale_items, sales, packs, model_colours, models, refresh_sessions, admin_user CASCADE');
  await client.query(`INSERT INTO admin_user(id,username,password_hash) VALUES (gen_random_uuid(),'e2e-admin',crypt('e2e-password-strong',gen_salt('bf',12)))`);
  await client.end();
});

test('complete model-pack sale, immutable receipt, PDF, refund, and deactivation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('e2e-admin');
  await page.getByLabel('Password').fill('e2e-password-strong');
  await page.getByRole('button', { name: 'Enter Konooz' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Add model' }).click();
  await page.getByLabel('Model number').fill('E2E-100');
  await page.getByLabel('Base price per size (EGP)').fill('10.01');
  await page.getByLabel('Colour name').fill('Black');
  await page.getByLabel('Sizes per pack').fill('3');
  await page.getByLabel('Packs available').fill('5');
  await page.getByRole('button', { name: 'Save model' }).click();
  await expect(page.getByText('E2E-100', { exact: true })).toBeVisible();
  await expect(page.getByText(/Black · 3 sizes · 30.03 EGP · 5 packs/)).toBeVisible();

  await page.goto('/sell');
  await page.getByRole('button', { name: /E2E-100/ }).click();
  await page.getByRole('button', { name: /Black/ }).click();
  await page.getByRole('button', { name: /3 sizes per pack/ }).click();
  await page.locator('.pack-quantity input').fill('2');
  await page.getByRole('button', { name: 'Add 2 packs' }).click();
  await page.getByLabel('Client name').fill('Snapshot Customer');
  await page.getByLabel('Discount percentage').fill('12.50');
  await expect(page.getByText(/30.03 EGP per pack · 60.06 EGP line total · 3 remaining/)).toBeVisible();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  const receipt = page.locator('.receipt');
  await expect(receipt.getByText('E2E-100', { exact: true })).toBeVisible();
  await expect(receipt.getByText(/Black.*3 items per pack/)).toBeVisible();
  const receiptLine = receipt.locator('.receipt-lines article').first();
  await expect(receiptLine.getByText('Line total')).toBeVisible();
  await expect(receiptLine.getByText('60.06 EGP', { exact: true })).toBeVisible();
  await expect(receiptLine.getByText('− 7.51 EGP', { exact: true })).toBeVisible();
  await expect(receiptLine.getByText('Final line amount')).toBeVisible();
  await expect(receiptLine.getByText('52.55 EGP', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/^konooz-receipt-.*\.pdf$/);

  await page.evaluate(async () => {
    const api = 'http://127.0.0.1:4010/api', token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const models = await (await fetch(`${api}/models`, { headers })).json();
    const model = models[0], colour = model.colours[0], pack = colour.packs[0];
    const response = await fetch(`${api}/models/${model.id}`, { method: 'PUT', headers, body: JSON.stringify({ expectedUpdatedAt: model.updatedAt, modelNumber: 'E2E-CHANGED', price: '99.99', photoUrl: null, material: null, isActive: true, colours: [{ id: colour.id, expectedUpdatedAt: colour.updatedAt, name: 'Gold', isActive: true, packs: [{ id: pack.id, expectedUpdatedAt: pack.updatedAt, sizesPerPack: 5, stockQuantity: 3, isActive: true }] }] }) });
    if (!response.ok) throw new Error(await response.text());
  });

  await page.getByRole('button', { name: 'Back' }).click();
  await page.goto('/sales');
  await page.getByText(/Snapshot Customer/).last().click();
  await expect(page.locator('.receipt').getByText('E2E-100', { exact: true })).toBeVisible();
  await expect(page.locator('.receipt').getByText(/Black.*3 items per pack/)).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Refund sale' }).click();
  await expect(page.getByText('Refunded', { exact: true })).toBeVisible();
  await page.getByText(/Snapshot Customer/).last().click();
  await expect(page.locator('.receipt').getByText('Refunded', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refund sale' })).toHaveCount(0);

  const result = await page.evaluate(async () => {
    const api = 'http://127.0.0.1:4010/api', token = sessionStorage.getItem('accessToken')!, headers = { Authorization: `Bearer ${token}` };
    const models = await (await fetch(`${api}/models`, { headers })).json();
    const stock = models[0].colours[0].packs[0].stockQuantity;
    await fetch(`${api}/models/${models[0].id}`, { method: 'DELETE', headers });
    return { stock, remainingModels: (await (await fetch(`${api}/models`, { headers })).json()).length };
  });
  expect(result).toEqual({ stock: 5, remainingModels: 0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sales');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('completes one sale with multiple models and multiple colours', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('e2e-admin');
  await page.getByLabel('Password').fill('e2e-password-strong');
  await page.getByRole('button', { name: 'Enter Konooz' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');

  const suffix = Date.now().toString(36).toUpperCase();
  const firstModelNumber = `E2E-MULTI-A-${suffix}`, secondModelNumber = `E2E-MULTI-B-${suffix}`;
  const modelIds = await page.evaluate(async ({ first, second }) => {
    const api = 'http://127.0.0.1:4010/api', token = sessionStorage.getItem('accessToken')!;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const create = async (body: object) => {
      const response = await fetch(`${api}/models`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    };
    const firstModel = await create({ modelNumber: first, price: '10.00', photoUrl: null, material: 'E2E', isActive: true, colours: [
      { name: 'Black', isActive: true, packs: [{ sizesPerPack: 2, stockQuantity: 3, isActive: true }] },
      { name: 'Gold', isActive: true, packs: [{ sizesPerPack: 3, stockQuantity: 3, isActive: true }] },
    ] });
    const secondModel = await create({ modelNumber: second, price: '7.50', photoUrl: null, material: 'E2E', isActive: true, colours: [
      { name: 'Blue', isActive: true, packs: [{ sizesPerPack: 4, stockQuantity: 3, isActive: true }] },
    ] });
    return [firstModel.id, secondModel.id];
  }, { first: firstModelNumber, second: secondModelNumber });

  let saleId: string | undefined;
  try {
    await page.goto('/sell');
    const addLine = async (modelNumber: string, colour: string, sizesPerPack: number) => {
      await page.locator('.model-options').getByRole('button', { name: new RegExp(modelNumber) }).click();
      await page.getByRole('button', { name: new RegExp(`^${colour}`) }).click();
      await page.getByRole('button', { name: new RegExp(`${sizesPerPack} sizes per pack`) }).click();
      await page.getByRole('button', { name: 'Add 1 pack' }).click();
    };
    await addLine(firstModelNumber, 'Black', 2);
    await addLine(firstModelNumber, 'Gold', 3);
    await addLine(secondModelNumber, 'Blue', 4);
    await expect(page.locator('.basket-lines article')).toHaveCount(3);
    await page.getByLabel('Client name').fill(`Multi-line customer ${suffix}`);
    await page.getByLabel('Discount percentage').fill('5.00');
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/sales') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Complete sale' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    saleId = (await response.json()).id;

    const receipt = page.locator('.receipt');
    await expect(receipt.locator('.receipt-lines article')).toHaveCount(3);
    await expect(receipt.getByText(firstModelNumber, { exact: true }).first()).toBeVisible();
    await expect(receipt.getByText(secondModelNumber, { exact: true })).toBeVisible();
    await expect(receipt.getByText(/Black.*2 items per pack/)).toBeVisible();
    await expect(receipt.getByText(/Gold.*3 items per pack/)).toBeVisible();
    await expect(receipt.getByText(/Blue.*4 items per pack/)).toBeVisible();
    await expect(receipt.locator('.receipt-summary').getByText('76.00 EGP', { exact: true })).toBeVisible();
    await expect(receipt.getByText('Packs / legacy pieces / represented items')).toHaveCount(0);
  } finally {
    await page.evaluate(async ({ createdSaleId, createdModelIds }) => {
      const api = 'http://127.0.0.1:4010/api', token = sessionStorage.getItem('accessToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      if (createdSaleId) await fetch(`${api}/sales/${createdSaleId}`, { method: 'DELETE', headers });
      for (const modelId of createdModelIds) await fetch(`${api}/models/${modelId}`, { method: 'DELETE', headers });
    }, { createdSaleId: saleId, createdModelIds: modelIds });
  }
});
