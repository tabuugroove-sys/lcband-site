// @ts-check
import { test, expect } from '@playwright/test';

const path = '/sax/stereo-sax/';
const clips = '.leo-clips';

test.describe('Stereo Sax — adaptive live-video row', () => {
	test('centers all four original videos when the row fits', async ({ page }) => {
		await page.setViewportSize({ width: 2201, height: 1040 });
		await page.goto(path);

		const carousel = page.locator(`${clips} [data-carousel="clips"]`);
		await expect(carousel).toHaveClass(/is-static/);
		await expect(carousel.locator('[data-carousel-slide]:not([data-clone])')).toHaveCount(4);
		await expect(carousel.locator('[data-clone]')).toHaveCount(0);
		await expect(carousel.locator('[data-carousel-prev]')).toBeHidden();
		await expect(carousel.locator('[data-carousel-next]')).toBeHidden();
		await expect(page.locator(`${clips} [data-carousel-dots="clips"]`)).toBeHidden();

		const alignment = await carousel.evaluate((element) => {
			const viewport = element.querySelector('[data-carousel-viewport]').getBoundingClientRect();
			const track = element.querySelector('[data-carousel-track]').getBoundingClientRect();
			return {
				centerDelta: Math.abs((viewport.left + viewport.width / 2) - (track.left + track.width / 2)),
				leftSpace: track.left - viewport.left,
				rightSpace: viewport.right - track.right,
			};
		});
		expect(alignment.centerDelta).toBeLessThanOrEqual(1);
		expect(Math.abs(alignment.leftSpace - alignment.rightSpace)).toBeLessThanOrEqual(1);
	});

	test('becomes a seamless infinite carousel when the row no longer fits', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(path);

		const carousel = page.locator(`${clips} [data-carousel="clips"]`);
		await expect(carousel).not.toHaveClass(/is-static/);
		await expect(carousel.locator('[data-carousel-slide]:not([data-clone])')).toHaveCount(4);
		await expect(carousel.locator('[data-clone="before"]')).toHaveCount(2);
		await expect(carousel.locator('[data-clone="after"]')).toHaveCount(2);
		await expect(carousel.locator('[data-carousel-prev]')).toBeVisible();
		await expect(carousel.locator('[data-carousel-next]')).toBeVisible();
		await expect(page.locator(`${clips} [data-carousel-dot="0"]`)).toHaveClass(/is-active/);
		await expect.poll(() => carousel.evaluate((element) => {
			const viewport = element.querySelector('[data-carousel-viewport]').getBoundingClientRect();
			const first = element.querySelector('[data-carousel-slide][data-slide-index="0"]:not([data-clone])').getBoundingClientRect();
			return Math.abs((viewport.left + viewport.width / 2) - (first.left + first.width / 2));
		})).toBeLessThanOrEqual(1);

		await page.locator(`${clips} [data-carousel-dot="3"]`).click();
		await expect(page.locator(`${clips} [data-carousel-dot="3"]`)).toHaveClass(/is-active/);
		await carousel.locator('[data-carousel-next]').click();
		await expect(page.locator(`${clips} [data-carousel-dot="0"]`)).toHaveClass(/is-active/, { timeout: 2000 });
	});

	test('switches between centered and carousel layouts after resizing', async ({ page }) => {
		await page.setViewportSize({ width: 2201, height: 1040 });
		await page.goto(path);
		const carousel = page.locator(`${clips} [data-carousel="clips"]`);
		await expect(carousel).toHaveClass(/is-static/);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(carousel).not.toHaveClass(/is-static/);
		await expect(carousel.locator('[data-clone]')).toHaveCount(4);

		await page.setViewportSize({ width: 2201, height: 1040 });
		await expect(carousel).toHaveClass(/is-static/);
		await expect(carousel.locator('[data-clone]')).toHaveCount(0);
	});
});
