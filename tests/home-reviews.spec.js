import { expect, test } from '@playwright/test';

// Reviews on the homepage: an endless strip that moves by itself (Mikhail, 30.10).
const track = page => page.locator('.reviews-rail__track');
const scrollLeft = page => track(page).evaluate(element => element.scrollLeft);

test.beforeEach(async ({ page }) => {
	await page.route('**/*.mp4*', route => route.abort());
});

test('repeats the reviews on both sides and drifts on its own', async ({ page }) => {
	await page.goto('/');
	const originals = await page.locator('.reviews-rail__track > .review:not([data-loop-clone])').count();
	expect(originals).toBeGreaterThan(1);
	await expect(page.locator('.reviews-rail__track > [data-loop-clone][aria-hidden="true"]')).toHaveCount(originals * 2);
	await page.locator('#reviews').scrollIntoViewIfNeeded();
	await page.waitForTimeout(400);
	const start = await scrollLeft(page);
	await expect.poll(async () => (await scrollLeft(page)) - start, { timeout: 5_000 }).toBeGreaterThan(20);
});

test('the pause button stops the strip and starts it again', async ({ page }) => {
	await page.goto('/');
	await page.locator('#reviews').scrollIntoViewIfNeeded();
	const toggle = page.locator('[data-reviews-toggle]');
	await expect(toggle).toBeVisible();
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-label', 'Прокручивать отзывы');
	await page.mouse.move(0, 0);
	const stopped = await scrollLeft(page);
	await page.waitForTimeout(1500);
	expect(await scrollLeft(page)).toBe(stopped);
	await toggle.click();
	await page.mouse.move(0, 0);
	await toggle.blur();
	await expect.poll(async () => (await scrollLeft(page)) - stopped, { timeout: 6_000 }).toBeGreaterThan(20);
});

test('stands still under reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	await page.locator('#reviews').scrollIntoViewIfNeeded();
	await expect(page.locator('[data-reviews-toggle]')).toBeHidden();
	const start = await scrollLeft(page);
	await page.waitForTimeout(1500);
	expect(await scrollLeft(page)).toBe(start);
});
