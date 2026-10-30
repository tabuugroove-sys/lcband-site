import { expect, test } from '@playwright/test';
import { serveHqMedia } from './hq-media.js';

// Mikhail 30.10 (screenshot, page still loading): «первые два появились одновременно и не
// двигаются. Должен появляться только первый ролик, прям с нижней границы, когда прокрутка
// идёт: появляется в два раза меньше и увеличивается, начинает двигаться, через секунду
// следующий, он тоже с середины появился и увеличился, затем остальные два по очереди».
// A visitor scrolls down slowly with the wheel while the rest of the page is still loading.
test.use({ viewport: { width: 1440, height: 800 } });

test('slow scroll during page load: one tile at a time, each grows in and moves before the next', async ({ page, isMobile }) => {
	test.skip(isMobile, 'phones have no reveal animation');
	test.setTimeout(60_000);
	await serveHqMedia(page);
	// Keep the page loading, as on a slow connection: one more picture answers only after 25 s.
	await page.route('**/__slow-picture.png', async route => { await new Promise(resolve => setTimeout(resolve, 25_000)); await route.abort().catch(() => {}); });
	await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
		const picture = new Image();
		picture.src = '/__slow-picture.png';
		picture.alt = '';
		picture.style.cssText = 'position:absolute;width:1px;height:1px';
		document.body.append(picture);
	}));
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await page.mouse.move(720, 400);

	const log = [];
	const sample = () => page.evaluate(() => {
		const grid = document.querySelector('[data-reel-grid]');
		const tiles = [...grid.querySelectorAll('.reel__tile')];
		return {
			t: performance.now(),
			loading: document.readyState !== 'complete',
			gridTop: grid.getBoundingClientRect().top / innerHeight,
			tiles: tiles.map(tile => {
				const m = new DOMMatrix(getComputedStyle(tile).transform);
				const box = tile.getBoundingClientRect();
				const video = tile.querySelector('video');
				return { shown: tile.classList.contains('is-shown'), scale: m.a, top: box.top / innerHeight, playing: video.currentTime > 0.05 && !video.paused };
			})
		};
	});
	for (let i = 0; i < 140; i++) {
		const grid = await page.evaluate(() => document.querySelector('[data-reel-grid]').getBoundingClientRect().top / innerHeight);
		if (grid > 0.15) await page.mouse.wheel(0, 40);
		await page.waitForTimeout(100);
		log.push(await sample());
		if (log.at(-1).tiles.every(tile => tile.shown && tile.playing)) break;
	}

	expect(log[0].loading).toBe(true);
	const firstShown = i => log.findIndex(s => s.tiles[i].shown);
	const firstPlaying = i => log.findIndex(s => s.tiles[i].playing);
	const order = [0, 1, 2, 3].map(firstShown);
	// All four came, in order, each one only after the one before is moving.
	for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
	for (let i = 1; i < 4; i++) {
		expect(order[i]).toBeGreaterThan(order[i - 1]);
		expect(firstPlaying(i - 1)).toBeGreaterThanOrEqual(0);
		expect(order[i]).toBeGreaterThanOrEqual(firstPlaying(i - 1));
	}
	// The first one comes alone, while the grid is still rising from the bottom edge.
	const first = log[order[0]];
	expect(first.tiles.filter(tile => tile.shown)).toHaveLength(1);
	expect(first.gridTop).toBeGreaterThan(0.45);
	// It is seen growing: small and on screen at the start, full size afterwards.
	expect(first.tiles[0].scale).toBeLessThan(0.9);
	expect(first.tiles[0].top).toBeLessThan(1);
	expect(log[order[0] + 10].tiles[0].scale).toBeCloseTo(1, 1);
	// The second tile also grows in from the middle.
	expect(log[order[1]].tiles[1].scale).toBeLessThan(0.9);
	// «Чтобы сразу двигалось, а не картинка висит» (30.10): every tile is already moving
	// when it grows in — its video warmed up while the one before it played.
	for (let i = 0; i < 4; i++) expect(firstPlaying(i)).toBeLessThanOrEqual(order[i] + 1);
	// Its video moves while the page is still loading, not after.
	expect(log[firstPlaying(0)].loading).toBe(true);
	// About a second or more between the first two, as before.
	expect(log[order[1]].t - log[order[0]].t).toBeGreaterThan(900);
});

test.describe('Homepage reel, desktop details (Mikhail 30.10)', () => {
	test.beforeEach(({ isMobile }) => test.skip(isMobile, 'desktop animation'));

	const placeGrid = (page, fraction) => page.evaluate(f => {
		const grid = document.querySelector('[data-reel-grid]');
		scrollTo({ top: grid.getBoundingClientRect().top + scrollY - innerHeight * f, behavior: 'instant' });
	}, fraction);
	const shownFlags = page => page.locator('.reel__tile').evaluateAll(tiles => tiles.map(tile => tile.classList.contains('is-shown')));

	test('scrolling back up, the tiles shrink away last first; scrolling down brings them again', async ({ page }) => {
		test.setTimeout(60_000);
		await serveHqMedia(page);
		await page.goto('/');
		await placeGrid(page, 0.15);
		await expect.poll(() => shownFlags(page), { timeout: 20_000 }).toEqual([true, true, true, true]);
		const seen = [];
		for (let i = 0; i < 60; i++) {
			await page.mouse.wheel(0, -40);
			await page.waitForTimeout(80);
			const flags = (await shownFlags(page)).map(Number).join('');
			if (seen.at(-1) !== flags) seen.push(flags);
			if (flags === '0000') break;
		}
		// Last first, one at a time.
		expect(seen).toEqual(['1111', '1110', '1100', '1000', '0000']);
		// A hidden tile is half size and invisible again.
		const back = await page.locator('.reel__tile').first().evaluate(tile => ({ o: getComputedStyle(tile).opacity, s: new DOMMatrix(getComputedStyle(tile).transform).a }));
		await expect.poll(() => page.locator('.reel__tile').first().evaluate(tile => new DOMMatrix(getComputedStyle(tile).transform).a)).toBeLessThan(0.6);
		expect(back).toBeTruthy();
		await placeGrid(page, 0.6);
		await expect(page.locator('.reel__tile').first()).toHaveClass(/is-shown/);
	});

	test('the first tile comes at once, poster first, even before its video can play', async ({ page }) => {
		await page.route(/\/assets\/video\/mp4\//, async route => { await new Promise(resolve => setTimeout(resolve, 15_000)); await route.abort().catch(() => {}); });
		await page.goto('/');
		await placeGrid(page, 0.6);
		await expect(page.locator('.reel__tile').first()).toHaveClass(/is-shown/, { timeout: 500 });
		await expect.poll(() => page.locator('.reel__tile').first().evaluate(tile => getComputedStyle(tile).opacity)).toBe('1');
		expect(await page.locator('.reel__tile').first().locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
	});

	test('the tiles are hidden before main.js arrives, so no poster flashes and vanishes', async ({ page }) => {
		let release;
		const held = new Promise(resolve => { release = resolve; });
		await page.route(/\/main\.js/, async route => { await held; await route.continue(); });
		// A deferred script holds DOMContentLoaded, so wait only for the grid's markup.
		await page.goto('/', { waitUntil: 'commit' });
		await page.waitForSelector('#reviews', { state: 'attached' });
		await placeGrid(page, 0.5);
		expect(await page.evaluate(() => window.LCBReelSequence)).toBeUndefined();
		expect(await page.locator('.reel__tile').evaluateAll(tiles => tiles.map(tile => getComputedStyle(tile).opacity))).toEqual(['0', '0', '0', '0']);
		release();
		await expect(page.locator('.reel__tile').first()).toHaveClass(/is-shown/);
	});

	test('without main.js the tiles come back after 8 s', async ({ page }) => {
		await page.route(/\/main\.js/, route => route.abort());
		await page.goto('/');
		await placeGrid(page, 0.5);
		await expect.poll(() => page.locator('[data-reel-grid]').getAttribute('class'), { timeout: 12_000 }).not.toMatch(/is-sequenced/);
	});

	test('the lower video rail waits lower and fainter, then sticks under the upper one', async ({ page }) => {
		await page.route('**/*.mp4*', route => route.abort());
		await page.goto('/');
		const rail = page.locator('.video-rails[data-magnet] > .video-rail--small');
		const placeAt = fraction => rail.evaluate((element, f) => {
			const top = element.getBoundingClientRect().top + scrollY - (Number.parseFloat(getComputedStyle(element).transform.split(',')[5]) || 0);
			scrollTo({ top: top - innerHeight * f, behavior: 'instant' });
		}, fraction);
		const lift = () => rail.evaluate(element => { const m = getComputedStyle(element).transform; return m === 'none' ? 0 : Number.parseFloat(m.split(',')[5]); });
		await placeAt(0.95);
		await expect.poll(lift).toBeGreaterThan(40);
		await placeAt(0.3);
		await expect.poll(lift).toBeLessThan(1);
	});
});
