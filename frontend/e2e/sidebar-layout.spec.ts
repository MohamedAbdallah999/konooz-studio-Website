import { expect, test, type Page } from '@playwright/test';

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
];

async function installAuthenticatedState(page: Page) {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: 9_999_999_999, tokenUse: 'access' }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    sessionStorage.setItem('accessToken', `e30.${payload}.layout-test-signature`);
  });
  await page.route('http://localhost:4000/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/state')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'layout-test', models: [], sales: [] }) });
      return;
    }
    await route.fulfill({ status: 204 });
  });
}

async function expectDocumentContained(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const clippedControls = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a,button,input,textarea')]
    .filter(element => {
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
        && (rect.left < -1 || rect.right > window.innerWidth + 1);
    })
    .map(element => element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 60) || element.tagName));
  expect(clippedControls).toEqual([]);
}

test('desktop sidebar stays fixed while content scrolls and mobile navigation is preserved', async ({ page }) => {
  await installAuthenticatedState(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto('/');
  await expect(page).toHaveURL('http://127.0.0.1:4173/');

  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '1800px';
    spacer.setAttribute('aria-hidden', 'true');
    document.querySelector('.page')?.append(spacer);
  });

  const desktopBefore = await page.locator('.sidebar').boundingBox();
  expect(desktopBefore).toMatchObject({ x: 0, y: 0, width: 236, height: 700 });
  expect(await page.locator('.sidebar').evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  expect((await page.locator('.app-shell > main').boundingBox())?.x).toBe(236);

  await page.evaluate(() => window.scrollTo(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const desktopAfter = await page.locator('.sidebar').boundingBox();
  expect(desktopAfter).toMatchObject({ x: 0, y: 0, width: 236, height: 700 });

  await page.setViewportSize({ width: 1000, height: 700 });
  expect((await page.locator('.sidebar').boundingBox())?.width).toBe(205);
  expect((await page.locator('.app-shell > main').boundingBox())?.x).toBe(205);

  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.mobile-nav')).toBeVisible();
  expect((await page.locator('.app-shell > main').boundingBox())?.x).toBe(0);
  expect(await page.locator('.mobile-nav').evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  await expectDocumentContained(page);
});

test('compact mobile layout keeps every route and every checkout field usable', async ({ page }) => {
  await installAuthenticatedState(page);

  for (const viewport of mobileViewports) {
    await page.setViewportSize(viewport);

    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expectDocumentContained(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Every dress has a story.' })).toBeVisible();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.mobile-nav')).toHaveCSS('position', 'fixed');
    await expect(page.locator('.mobile-nav > *')).toHaveCount(5);
    await expectDocumentContained(page);

    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await page.getByRole('button', { name: 'Add model' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Model number')).toBeVisible();
    await expect(page.getByLabel('Base price per size (EGP)')).toBeVisible();
    await expect(page.getByLabel('Sizes per pack')).toBeVisible();
    await expect(page.getByLabel('Packs available')).toBeVisible();
    await expectDocumentContained(page);
    await page.getByRole('button', { name: 'Close' }).click();

    await page.goto('/sell');
    await expect(page.getByRole('heading', { name: 'Select packs' })).toBeVisible();
    for (const label of ['Client name', 'Phone number', 'Shop name', 'Address', 'Discount percentage']) {
      await expect(page.getByLabel(label)).toBeVisible();
    }
    await expect(page.getByLabel('Client is paying a deposit')).toBeVisible();
    await expect(page.getByText('Total packs / total pcs.')).toBeVisible();
    await page.getByLabel('Client is paying a deposit').check();
    await expect(page.getByLabel('Deposit paid now')).toBeVisible();
    await expectDocumentContained(page);

    await page.goto('/sales');
    await expect(page.getByRole('heading', { name: 'Sales & reporting' })).toBeVisible();
    await expectDocumentContained(page);
  }
});
