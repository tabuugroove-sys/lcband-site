import { expect, test } from '@playwright/test';

// Four silent reels 2×2 replaced the about photo block on the homepage (Mikhail, 29.10):
// the grid is 21:9 → 2:1 → 3:2 by width and four squares on phones, with square cuts there.
const reelVideos = page => page.locator('[data-reel-video]');
const allPlaying = list => list.every(video => !video.paused && video.readyState >= 2);

test.describe('Homepage reel', () => {
	test('shows one line, the learn-more button and four tiles in the screen format', async ({ page, isMobile }) => {
		await page.goto('/');
		const reel = page.locator('section#about[data-reel]');
		await expect(reel.locator('.reel__title')).toHaveText('Топовый кавер-бенд для вашего события.');
		await expect(reel.locator('.reel__more')).toHaveAttribute('href', '/about/');
		await expect(reel.locator('.reel__tile')).toHaveCount(4);
		const grid = await reel.locator('[data-reel-grid]').boundingBox();
		expect(grid.width / grid.height).toBeCloseTo(isMobile ? 1 : 21 / 9, 1);
		if (isMobile) {
			const tile = await reel.locator('.reel__tile').first().boundingBox();
			expect(Math.abs(tile.width - tile.height)).toBeLessThan(1);
		}
		await expect.poll(() => reel.locator('.reel__poster img').evaluateAll(images => {
			images.forEach(image => image.scrollIntoView());
			return images.every(image => image.complete && image.naturalWidth > 0);
		})).toBe(true);
	});

	for (const [width, ratio] of [[1600, 21 / 9], [1100, 2], [700, 3 / 2]]) {
		test(`grid is ${ratio.toFixed(2)}:1 at ${width}px`, async ({ page, isMobile }) => {
			test.skip(isMobile, 'desktop widths');
			await page.setViewportSize({ width, height: 900 });
			await page.goto('/');
			const grid = await page.locator('[data-reel-grid]').boundingBox();
			expect(grid.width / grid.height).toBeCloseTo(ratio, 1);
		});
	}

	test('plays the cut for the screen and pauses all four with one button', async ({ page, isMobile }) => {
		await page.goto('/');
		await page.locator('#about').scrollIntoViewIfNeeded();
		const videos = reelVideos(page);
		await expect.poll(() => videos.evaluateAll(allPlaying), { timeout: 15_000 }).toBe(true);
		const sources = await videos.evaluateAll(list => list.map(video => video.getAttribute('src')));
		for (const src of sources) expect(src).toMatch(isMobile ? /-square\.mp4$/ : /-wide\.mp4$/);

		const toggle = page.locator('[data-reel-toggle]');
		await expect(toggle).toBeVisible();
		await toggle.click();
		await expect.poll(() => videos.evaluateAll(list => list.every(video => video.paused))).toBe(true);
		await expect(toggle).toHaveAttribute('aria-label', 'Включить видео');
		await toggle.click();
		await expect.poll(() => videos.evaluateAll(allPlaying)).toBe(true);
		await expect(toggle).toHaveAttribute('aria-label', 'Пауза видео');
	});

	test('pauses all four when scrolled away', async ({ page }) => {
		await page.goto('/');
		await page.locator('#about').scrollIntoViewIfNeeded();
		const videos = reelVideos(page);
		await expect.poll(() => videos.evaluateAll(allPlaying), { timeout: 15_000 }).toBe(true);
		await page.locator('#book').scrollIntoViewIfNeeded();
		await expect.poll(() => videos.evaluateAll(list => list.every(video => video.paused))).toBe(true);
	});
});

test.describe('Homepage reel under reduced motion', () => {
	test('keeps the posters and never requests a video', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const requests = [];
		page.on('request', request => {
			if (/reel-20261029-[a-z0-9-]+\.mp4/.test(request.url())) requests.push(request.url());
		});
		await page.goto('/');
		await page.locator('#about').scrollIntoViewIfNeeded();
		await page.waitForTimeout(2500);
		expect(requests).toEqual([]);
		await expect(page.locator('[data-reel-toggle]')).toBeHidden();
	});
});
