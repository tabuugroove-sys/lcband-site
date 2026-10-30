import { expect, test } from '@playwright/test';
import { serveHqMedia } from './hq-media.js';

async function holdBackgroundIdle(page) {
	await page.addInitScript(() => {
		window.backgroundIdle = [];
		window.requestIdleCallback = callback => window.backgroundIdle.push(callback);
	});
}

async function releaseBackgroundIdle(page) {
	await expect.poll(() => page.evaluate(() => window.backgroundIdle.length)).toBeGreaterThan(0);
	await page.evaluate(() => window.backgroundIdle.splice(0).forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 })));
}

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

test.describe('Homepage hero crop', () => {
	for (const viewport of [
		{ width: 1920, height: 640 },
		{ width: 2169, height: 640 },
		{ width: 3289, height: 850 },
	]) {
		test(`keeps every head below the navigation at ${viewport.width}x${viewport.height}`, async ({ page, isMobile }) => {
			test.skip(isMobile, 'desktop crop contract');

			await page.setViewportSize(viewport);
			await page.goto('/');
			await page.addStyleTag({ content: '.hero__bg.is-active { animation: none !important; }' });
			await expect.poll(() => page.locator('[data-hero-img]').evaluateAll(images =>
				images.every(image => image.complete && image.naturalWidth > 0)
			)).toBe(true);

			const headLines = await page.locator('[data-hero-img]').evaluateAll(images =>
				images.map(image => {
					const box = image.getBoundingClientRect();
					return box.top + box.width * (165 / 2400);
				})
			);

			expect(headLines).toHaveLength(4);
			for (const headLine of headLines) expect(headLine).toBeGreaterThanOrEqual(59);
		});
	}
});

// The silent montage stays on /about/ only; the homepage keeps the four costumes (Mikhail, 29.10).
test.describe('Silent background lifecycle on /about/', () => {
	for (const preference of ['saveData', '2g', '3g', 'reducedMotion']) {
		test(`${preference} retains the poster without requesting the montage`, async ({ page }) => {
			await holdBackgroundIdle(page);
			await page.addInitScript(value => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: value === 'saveData', effectiveType: value === '2g' || value === '3g' ? value : '4g' } }), preference);
			if (preference === 'reducedMotion') await page.emulateMedia({ reducedMotion: 'reduce' });
			const requests = [];
			page.on('request', request => { if (/(hq-20261029|lt2-20261030)-about-.*\.mp4/.test(request.url())) requests.push(request.url()); });
			await page.goto('/about/');
			await releaseBackgroundIdle(page);
			await expect(page.locator('[data-background-video]')).not.toHaveAttribute('src', /.+/);
			await expect.poll(() => page.locator('.hero-background__poster img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
			expect(requests).toEqual([]);
		});
	}

	test('pauses for the lightbox and hidden document, then follows orientation', async ({ page }) => {
		await holdBackgroundIdle(page);
		await page.route('**/*.mp4*', route => route.abort());
		await serveHqMedia(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/about/');
		await releaseBackgroundIdle(page);
		const video = page.locator('[data-background-video]');
		await expect(video).toHaveAttribute('src', /-916\.mp4$/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.locator('.about-hero [data-video]').click();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await page.keyboard.press('Escape');
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(video).toHaveAttribute('src', /-(1280|1920)\.mp4$/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(video).not.toHaveAttribute('src', /.+/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
	});
});
