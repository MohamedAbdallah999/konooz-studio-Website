import { expect, test, type Page } from '@playwright/test';

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
];
const layoutTime = '2026-08-13T10:00:00.000Z';
const portraitPhoto = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"><rect width="400" height="800" fill="#d4b968"/><path d="M80 720 200 80l120 640Z" fill="#171511"/></svg>').toString('base64')}`;
const layoutState = {
  version: 'layout-test',
  models: [{
    id: '00000000-0000-4000-8000-000000000101', modelNumber: 'LAYOUT-100', price: '10.00', material: 'Silk', photoUrl: portraitPhoto, isActive: true, createdAt: layoutTime, updatedAt: layoutTime, syncStatus: 'synced',
    colours: [{
      id: '00000000-0000-4000-8000-000000000102', modelId: '00000000-0000-4000-8000-000000000101', name: 'Midnight Black', isActive: true, createdAt: layoutTime, updatedAt: layoutTime, syncStatus: 'synced',
      packs: [{ id: '00000000-0000-4000-8000-000000000103', modelColourId: '00000000-0000-4000-8000-000000000102', sizesPerPack: 3, stockQuantity: 4, isActive: true, createdAt: layoutTime, updatedAt: layoutTime, syncStatus: 'synced' }],
    }],
  }],
  sales: [],
};

async function installAuthenticatedState(page: Page) {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: 9_999_999_999, tokenUse: 'access' }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    sessionStorage.setItem('accessToken', `e30.${payload}.layout-test-signature`);
  });
  await page.route('http://localhost:4000/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/state')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(layoutState) });
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
    await page.getByRole('button', { name: /LAYOUT-100/ }).click();
    await page.getByRole('button', { name: /Midnight Black/ }).click();
    const packOption = page.getByRole('button', { name: /3 sizes per pack/ });
    await expect(packOption).toHaveCSS('flex-direction', 'column');
    const [titleBox, priceBox, stockBox] = await Promise.all([
      packOption.locator('.pack-option-title').boundingBox(),
      packOption.locator('.pack-option-price').boundingBox(),
      packOption.locator('.pack-option-stock').boundingBox(),
    ]);
    expect(priceBox!.y).toBeGreaterThan(titleBox!.y);
    expect(stockBox!.y).toBeGreaterThan(priceBox!.y);
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

test('dense inventory cards keep portrait photos fitted and offer an uncropped preview', async ({ page }) => {
  await installAuthenticatedState(page);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1000, height: 800 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/inventory');

    const card = page.locator('.inventory-grid .item-card').first();
    const art = card.locator('.item-art');
    const frame = art.locator('.item-photo-frame');
    const photo = frame.locator('img');
    await expect(card).toBeVisible();
    await expect(photo).toHaveCSS('object-fit', 'contain');
    await expect(photo).toHaveCSS('object-position', '50% 50%');
    await expect(card.getByText('LAYOUT-100', { exact: true })).toBeVisible();
    await expect(card.getByText('Silk', { exact: true })).toBeVisible();
    await expect(card.getByText(/Midnight Black.*3 sizes.*30\.00 EGP.*4 packs/)).toBeVisible();

    const [cardBox, artBox, frameBox, photoBox] = await Promise.all([card.boundingBox(), art.boundingBox(), frame.boundingBox(), photo.boundingBox()]);
    expect(photoBox!.width).toBeLessThanOrEqual(artBox!.width);
    expect(photoBox!.height).toBeLessThanOrEqual(artBox!.height);
    expect(frameBox!.width).toBeLessThan(artBox!.width);
    expect(frameBox!.height).toBeLessThan(artBox!.height);
    if (viewport.width > 700) {
      expect(Math.round(artBox!.height)).toBe(180);
      expect(Math.round(cardBox!.height)).toBeGreaterThanOrEqual(180);
      expect(Math.round(artBox!.width)).toBe(viewport.width <= 1100 ? 145 : 160);
      await expect(card).toHaveCSS('flex-direction', 'row');
    } else {
      expect(Math.round(artBox!.width)).toBe(96);
      expect(Math.round(artBox!.height)).toBe(144);
      expect(cardBox!.height).toBeLessThan(300);
      await expect(card).toHaveCSS('display', 'grid');
      const chipsBox = await card.locator('.chips').boundingBox();
      expect(Math.abs(chipsBox!.width - cardBox!.width)).toBeLessThanOrEqual(2);
    }

    const editBox = await card.getByRole('button', { name: 'Edit LAYOUT-100' }).boundingBox();
    expect(editBox!.width).toBeGreaterThanOrEqual(viewport.width <= 700 ? 44 : 36);
    const previewButton = card.getByRole('button', { name: 'Preview full photo for LAYOUT-100' });
    await expect(previewButton).toBeVisible();
    expect((await previewButton.boundingBox())!.height).toBeGreaterThanOrEqual(viewport.width <= 700 ? 44 : 36);
    await previewButton.click();
    const viewer = page.getByRole('dialog', { name: 'LAYOUT-100' });
    const fullPhoto = viewer.getByAltText('Full photo of model LAYOUT-100');
    await expect(viewer).toBeVisible();
    await expect(fullPhoto).toHaveCSS('object-fit', 'contain');
    const [viewerBox, fullPhotoBox] = await Promise.all([viewer.boundingBox(), fullPhoto.boundingBox()]);
    expect(viewerBox!.width).toBeLessThanOrEqual(Math.min(640, viewport.width - 24));
    expect(fullPhotoBox!.width).toBeLessThanOrEqual(viewerBox!.width);
    expect(fullPhotoBox!.height).toBeLessThan(viewport.height);
    await page.getByRole('button', { name: 'Close photo preview' }).click();
    await expect(viewer).toBeHidden();
    await expectDocumentContained(page);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/inventory');
  const hoverFrame = page.locator('.inventory-grid .item-photo-frame').first();
  const beforeHover = await hoverFrame.boundingBox();
  await hoverFrame.hover();
  await expect.poll(async () => (await hoverFrame.boundingBox())!.width).toBeGreaterThan(beforeHover!.width * 1.3);
  await expect(hoverFrame.locator('..')).toHaveCSS('overflow', 'visible');
});
