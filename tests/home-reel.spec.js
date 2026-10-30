import { expect, test } from '@playwright/test';
import { serveHqMedia } from './hq-media.js';

// Four silent reels 2×2 replaced the about photo block on the homepage (Mikhail, 29.10):
// the grid is 21:9 → 2:1 → 3:2 by width and four squares on phones, with square cuts there.
// 30.10: light cuts from 4K sources; a tile comes in only once the video before it is moving,
// and a video loads only when its tile is shown.
const reelVideos = page => page.locator('[data-reel-video]');
const allPlaying = list => list.every(video => !video.paused && video.readyState >= 2);

test.describe('Homepage reel', () => {
	test.beforeEach(({ page }) => serveHqMedia(page));

	test('shows one line, the learn-more button and four tiles in the screen format', async ({ page, isMobile }) => {
		await page.goto('/');
		const reel = page.locator('section#about[data-reel]');
		await expect(reel.locator('.reel__title')).toHaveText('Топовый кавер-бенд для вашего события.');
		await expect(reel.locator('.reel__more')).toHaveAttribute('href', '/about/');
		await expect(reel.locator('.reel__tile')).toHaveCount(4);
		const grid = await reel.locator('[data-reel-grid]').boundingBox();
		expect(grid.width / grid.height).toBeCloseTo(isMobile ? 1 : 21 / 9, 1);
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

	test('brings the tiles in one by one, each video starting with its tile', async ({ page, isMobile }) => {
		await page.goto('/');
		// An instant jump: a smooth scroll would itself speed the sequence up.
		await page.evaluate(() => {
			const grid = document.querySelector('[data-reel-grid]');
			scrollTo({ top: grid.getBoundingClientRect().top + scrollY - (innerHeight - grid.offsetHeight) / 2, behavior: 'instant' });
		});
		const tiles = page.locator('.reel__tile');
		const videos = reelVideos(page);
		await expect(tiles.nth(0)).toHaveClass(/is-shown/);
		await expect(tiles.nth(1)).not.toHaveClass(/is-shown/);
		expect(await videos.nth(3).getAttribute('src')).toBeNull();
		// The second tile waits until the first video is really moving.
		await expect(tiles.nth(1)).toHaveClass(/is-shown/, { timeout: 6_000 });
		expect(await videos.nth(0).evaluate(video => video.currentTime)).toBeGreaterThan(0);
		await expect(tiles.nth(3)).toHaveClass(/is-shown/, { timeout: 15_000 });
		await expect.poll(() => videos.evaluateAll(allPlaying), { timeout: 15_000 }).toBe(true);
		const sources = await videos.evaluateAll(list => list.map(video => video.getAttribute('src')));
		for (const src of sources) expect(src).toMatch(isMobile ? /-square\.mp4$/ : /-wide\.mp4$/);
	});

	test('a fast scroll brings all four in before the grid leaves the screen', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			const grid = document.querySelector('[data-reel-grid]');
			scrollTo(0, grid.getBoundingClientRect().top + scrollY - innerHeight * 0.6);
		});
		await expect(page.locator('.reel__tile').nth(0)).toHaveClass(/is-shown/);
		const shownWhenGone = await page.evaluate(async () => {
			const grid = document.querySelector('[data-reel-grid]');
			while (grid.getBoundingClientRect().bottom > 0) {
				scrollBy(0, 120);
				await new Promise(resolve => setTimeout(resolve, 30));
			}
			return document.querySelectorAll('.reel__tile.is-shown').length;
		});
		expect(shownWhenGone).toBe(4);
	});

	test('one button pauses and resumes the videos; scrolling away pauses them', async ({ page }) => {
		await page.goto('/');
		await page.locator('[data-reel-grid]').scrollIntoViewIfNeeded();
		const videos = reelVideos(page);
		await expect(page.locator('.reel__tile').nth(3)).toHaveClass(/is-shown/, { timeout: 15_000 });
		await expect.poll(() => videos.evaluateAll(allPlaying), { timeout: 15_000 }).toBe(true);

		const toggle = page.locator('[data-reel-toggle]');
		await expect(toggle).toBeVisible();
		await toggle.click();
		await expect.poll(() => videos.evaluateAll(list => list.every(video => video.paused))).toBe(true);
		await expect(toggle).toHaveAttribute('aria-label', 'Включить видео');
		await toggle.click();
		await expect.poll(() => videos.evaluateAll(allPlaying)).toBe(true);
		await expect(toggle).toHaveAttribute('aria-label', 'Пауза видео');

		await page.locator('#book').scrollIntoViewIfNeeded();
		await expect.poll(() => videos.evaluateAll(list => list.every(video => video.paused))).toBe(true);
	});
});

test.describe('Homepage reel under reduced motion', () => {
	test('shows all four tiles at once and never requests a video', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const requests = [];
		page.on('request', request => {
			if (/(hq-20261029|lt2-20261030)-[a-z0-9-]+\.mp4/.test(request.url())) requests.push(request.url());
		});
		await page.goto('/');
		await page.locator('#about').scrollIntoViewIfNeeded();
		await page.waitForTimeout(2500);
		expect(requests).toEqual([]);
		await expect(page.locator('[data-reel-toggle]')).toBeHidden();
		await expect(page.locator('[data-reel-grid]')).not.toHaveClass(/is-sequenced/);
		expect(await page.locator('.reel__tile').evaluateAll(tiles =>
			tiles.every(tile => getComputedStyle(tile).opacity === '1' && getComputedStyle(tile).transform === 'none'))).toBe(true);
	});
});
