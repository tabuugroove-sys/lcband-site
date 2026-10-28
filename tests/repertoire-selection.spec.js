import { test, expect } from '@playwright/test';

for (const { route, song } of [
  { route: '/assets/repertoire/', song: 'Смысловые галлюцинации' },
  { route: '/en/repertoire/catalog/', song: 'Smyslovye Gallyutsinatsii' },
]) {
  test(`${route} searches spelling variants and prints the complete published selection`, async ({ page }) => {
    await page.goto(route);
    const search = page.locator('input[type="search"]');
    await search.fill(' The Weekend');
    await expect(page.locator('.song-section li:visible')).toContainText(['The Weeknd']);
    await expect(page.locator('.song-section li:visible').filter({ hasText: 'Coldplay' })).toHaveCount(0);
    await search.fill('Hymn For The Weekend');
    await expect(page.locator('.song-section li:visible').first()).toContainText('Coldplay');
    await search.fill('Tons and I');
    await expect(page.locator('.song-section li:visible')).toContainText(['Tones and I']);
    await search.fill('Смысловые голлюцинации');
    expect(await page.locator('.song-section li:visible').count()).toBeGreaterThan(0);
    await expect(page.locator('.song-section li:visible').first()).toContainText(song);
    await search.fill('no-song-exists-762014');
    await expect(page.locator('.empty')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.song-section li:visible')).toHaveCount(420);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => { window.printCalled = false; window.print = () => { window.printCalled = true; }; });
    await page.locator('#print').click();
    expect(await page.evaluate(() => window.printCalled)).toBe(true);
  });
}

test('both overview pages expose working song search without another page navigation', async ({ page }) => {
  for (const prefix of ['', '/en']) {
    await page.goto(`${prefix}/repertoire/`);
    const frame = page.frameLocator('iframe[title*="Luxury Cover Band"]');
    await frame.locator('input[type="search"]').fill('Blinding Lights');
    expect(await frame.locator('.song-section li:visible').count()).toBeGreaterThan(0);
    await expect(frame.locator('.song-section li:visible').first()).toContainText('The Weeknd');
    expect(new URL(page.url()).pathname).toBe(`${prefix}/repertoire/`);
  }
});
