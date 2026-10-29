import { expect, test } from '@playwright/test';

async function chooseCostume(page, key) {
	await page.locator(`[data-hero-dot="${key}"]`).click();
	await expect.poll(() => page.locator(`[data-hero-img="${key}"]`).evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
	await expect(page.locator(`[data-hero-img="${key}"]`)).toHaveClass(/is-active/);
	await expect(page.locator('[data-hero]')).toHaveClass(/is-costume-view/);
}

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
		await chooseCostume(page, 'red');

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
		await expect.poll(() => under.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
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

test('keeps the last costume visible until a successful latest image selection loads', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	let releaseGold;
	let releaseBw;
	await page.route(/\/hero-gold[-.]/, route => { releaseGold = () => route.continue(); });
	await page.route(/\/hero-bw[-.]/, route => { releaseBw = () => route.continue(); });
	await page.route(/\/hero-white[-.]/, route => route.abort());
	await page.goto('/');
	await chooseCostume(page, 'red');
	await page.locator('[data-hero-dot="gold"]').click();
	await expect.poll(() => Boolean(releaseGold)).toBe(true);
	await expect(page.locator('[data-hero-img="red"]')).toHaveClass(/is-active/);
	await expect(page.locator('[data-hero-img="gold"]')).not.toHaveClass(/is-active/);
	await releaseGold();
	await expect(page.locator('[data-hero-img="gold"]')).toHaveClass(/is-active/);
	await page.locator('[data-hero-dot="white"]').click();
	await expect.poll(() => page.locator('[data-hero-img="white"]').evaluate(image => image.complete && image.naturalWidth === 0)).toBe(true);
	await expect(page.locator('[data-hero-img="gold"]')).toHaveClass(/is-active/);
	await page.locator('[data-hero-dot="bw"]').click();
	await expect.poll(() => Boolean(releaseBw)).toBe(true);
	await chooseCostume(page, 'red');
	await releaseBw();
	await expect.poll(() => page.locator('[data-hero-img="bw"]').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
	await expect(page.locator('[data-hero-img="red"]')).toHaveClass(/is-active/);
	await expect(page.locator('[data-hero-img="bw"]')).not.toHaveClass(/is-active/);
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
			for (const key of ['red', 'bw', 'gold', 'white']) await chooseCostume(page, key);

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

test.describe('Silent background lifecycle', () => {
	test('loads one responsive source after idle, keeps costumes deferred and respects pause states', async ({ page, isMobile }) => {
		await holdBackgroundIdle(page);
		await page.route('**/*.mp4*', route => route.request().url().includes('band-montage-') ? route.continue() : route.abort());
		const requested = [];
		page.on('request', request => requested.push(new URL(request.url()).pathname));
		await page.goto('/');
		const video = page.locator('[data-background-video]');
		const toggle = page.locator('[data-background-toggle]');
		await expect(video).not.toHaveAttribute('src', /.+/);
		await expect(page.locator('[data-hero-video]')).not.toHaveAttribute('src', /.+/);
		await expect(page.locator('[data-hero-img][src]')).toHaveCount(0);
		expect(requested.filter(path => /\/hero-(red|bw|gold|white)[-.]/.test(path))).toEqual([]);
		expect(new Set(requested.filter(path => /band-montage-.*\.webp$/.test(path))).size).toBe(1);
		await releaseBackgroundIdle(page);
		await expect(video).toHaveAttribute('src', new RegExp(`-${isMobile ? '360' : '540'}\\.mp4$`));
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await expect(video).toHaveClass(/is-ready/);
		expect(new Set(requested.filter(path => /band-montage-.*\.mp4$/.test(path))).size).toBe(1);
		await toggle.click();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await page.locator('footer').scrollIntoViewIfNeeded();
		await page.locator('[data-background-host]').scrollIntoViewIfNeeded();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await toggle.click();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.locator('footer').scrollIntoViewIfNeeded();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await page.locator('[data-background-host]').scrollIntoViewIfNeeded();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await chooseCostume(page, 'gold');
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await expect(page.locator('[data-hero-img="gold"]')).toHaveAttribute('src', /hero-gold/);
		await toggle.click();
		await expect(page.locator('[data-hero]')).not.toHaveClass(/is-costume-view/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.locator('[data-hero-play]').click();
		await expect(page.locator('[data-hero]')).toHaveClass(/is-playing/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
		await page.locator('[data-hero-close]').click();
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
	});

	for (const preference of ['saveData', '2g', '3g', 'reducedMotion']) {
		test(`${preference} retains the poster without requesting the montage`, async ({ page }) => {
			await holdBackgroundIdle(page);
			await page.addInitScript(value => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: value === 'saveData', effectiveType: value === '2g' || value === '3g' ? value : '4g' } }), preference);
			if (preference === 'reducedMotion') await page.emulateMedia({ reducedMotion: 'reduce' });
			const requests = [];
			page.on('request', request => { if (/band-montage-.*\.mp4/.test(request.url())) requests.push(request.url()); });
			await page.goto('/about/');
			await releaseBackgroundIdle(page);
			await expect(page.locator('[data-background-video]')).not.toHaveAttribute('src', /.+/);
			await expect.poll(() => page.locator('.hero-background__poster img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
			expect(requests).toEqual([]);
		});
	}

	test('pauses for the lightbox and hidden document, then follows orientation', async ({ page }) => {
		await holdBackgroundIdle(page);
		await page.route('**/*.mp4*', route => route.request().url().includes('band-montage-') ? route.continue() : route.abort());
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/about/');
		await releaseBackgroundIdle(page);
		const video = page.locator('[data-background-video]');
		await expect(video).toHaveAttribute('src', /-360\.mp4$/);
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
		await expect(video).toHaveAttribute('src', /-540\.mp4$/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(false);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(video).not.toHaveAttribute('src', /.+/);
		await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
	});
});
