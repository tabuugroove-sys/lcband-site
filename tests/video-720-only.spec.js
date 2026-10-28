import { test, expect } from '@playwright/test';

for (const { key, path } of [
  { key: 'sax-welcome', path: '/events/private-party/' },
  { key: 'yuriy-acoustic-vocal', path: '/formats/gitarist-u-kostra/' },
  { key: 'yuriy-live-stage', path: '/formats/gitarist-u-kostra/' },
  { key: 'yuriy-instrumental', path: '/formats/gitarist-u-kostra/' },
]) {
  test(`${key}: Auto keeps the available 720p source even on a fast connection`, async ({ page }) => {
    // Prevent production media downloads. A fast connection must not make Auto
    // request a nonexistent 1080p variant after the initial 720p request.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: false, effectiveType: '4g', downlink: 100, rtt: 10 },
      });
    });
    const requestedQualities = [];
    await page.route('**/*.mp4*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes(`/${key}-`)) {
        requestedQualities.push(url.pathname.match(/-(\d+)\.mp4$/)?.[1]);
      }
      return route.abort();
    });
    await page.goto(path);
    await page.locator(`[data-video="${key}"]`).first().evaluate(link => link.click());
    const lightbox = page.locator('#lightbox');
    const picker = lightbox.locator('.lightbox__picker');
    await expect(lightbox).toHaveClass(/is-open/);
    await expect(picker.locator('[data-q="720"]')).toBeVisible();
    await expect(picker.locator('[data-q="1080"]')).toBeHidden();
    await expect(picker.locator('[data-q="2160"]')).toBeHidden();
    await expect.poll(() => requestedQualities.length).toBeGreaterThan(0);

    const previousRequestCount = requestedQualities.length;
    await picker.locator('[data-q="auto"]').click();
    await expect.poll(() => requestedQualities.length).toBeGreaterThan(previousRequestCount);
    await expect(lightbox.locator('video.lightbox__video')).toHaveAttribute('src', new RegExp(`/${key}-720\\.mp4$`));
    expect(requestedQualities.every(quality => quality === '720'), 'Only the available 720p file may be requested').toBe(true);
  });
}
