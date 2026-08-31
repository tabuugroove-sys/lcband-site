import { expect, test } from '@playwright/test';

test.describe('Homepage hero swipe', () => {
	test('reveals the next image immediately under the dragged slide', async ({ page, isMobile }) => {
		test.skip(!isMobile, 'mobile swipe interaction');

		await page.goto('/');
		const hero = page.locator('[data-hero]');
		await expect(hero).toBeVisible();
		await expect.poll(() => page.locator('[data-hero-img]').evaluateAll(images =>
			images.every(image => image.complete && image.naturalWidth > 0)
		)).toBe(true);

		await hero.dispatchEvent('pointerdown', {
			pointerId: 1,
			pointerType: 'touch',
			clientX: 350,
			clientY: 280,
			bubbles: true,
		});
		await hero.dispatchEvent('pointermove', {
			pointerId: 1,
			pointerType: 'touch',
			clientX: 215,
			clientY: 292,
			bubbles: true,
		});

		const under = page.locator('.hero__bg.is-swipe-under');
		await expect(under).toHaveCount(1);
		await expect.poll(() => under.evaluate(image => Number.parseFloat(getComputedStyle(image).opacity)))
			.toBeGreaterThan(0.55);

		await hero.dispatchEvent('pointerup', {
			pointerId: 1,
			pointerType: 'touch',
			clientX: 215,
			clientY: 292,
			bubbles: true,
		});
	});
});
