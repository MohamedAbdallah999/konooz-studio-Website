import { expect, test } from '@playwright/test';

test('desktop sidebar stays fixed while content scrolls and mobile navigation is preserved', async ({ page }) => {
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
