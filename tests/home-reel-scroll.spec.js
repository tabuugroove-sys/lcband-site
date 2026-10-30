import { expect, test } from '@playwright/test';
import { serveHqMedia } from './hq-media.js';

// Mikhail 30.10: each tile comes in at its own scroll point, measured from the screen's bottom edge.
test.use({ viewport: { width: 1440, height: 800 } });

const geometry = page => page.evaluate(() => {
	const grid = document.querySelector('[data-reel-grid]');
	const tiles = grid.querySelectorAll('.reel__tile');
	return { row: tiles[0].offsetHeight, second: tiles[2].offsetTop, ribbon: grid.getBoundingClientRect().top - document.querySelector('.reel__ribbon').getBoundingClientRect().top };
});
// Puts the screen's bottom edge `edge` px below the grid's top.
const setEdge = (page, edge) => page.evaluate(value => {
	const grid = document.querySelector('[data-reel-grid]');
	scrollTo({ top: grid.getBoundingClientRect().top + scrollY - innerHeight + value, behavior: 'instant' });
}, edge);
const shown = page => page.locator('.reel__tile').evaluateAll(tiles => tiles.map(tile => (tile.classList.contains('is-shown') ? 1 : 0)).join(''));
const scaleOf = (page, i) => page.locator('.reel__bloom').nth(i).evaluate(bloom => new DOMMatrix(getComputedStyle(bloom).transform).a);
// Once the tile has settled: a value seen on the way there proves nothing.
const settledScale = async (page, i) => { await page.waitForTimeout(700); return scaleOf(page, i); };
const playing = (page, i) => page.locator('[data-reel-video]').nth(i).evaluate(video => !video.paused && video.currentTime > 0.05);

test.describe('Homepage reel, scroll points', () => {
	test.beforeEach(async ({ page, isMobile }) => {
		test.skip(isMobile, 'phones have no reveal animation');
		await serveHqMedia(page);
	});

	test('each tile starts and finishes at its point on the way down', async ({ page }) => {
		test.setTimeout(60_000);
		await page.goto('/');
		const { row, second, ribbon } = await geometry(page);
		await setEdge(page, 60 - ribbon);
		await expect.poll(() => shown(page)).toBe('0000');
		// The ribbon has risen a couple of centimetres: the first tile starts, alone.
		await setEdge(page, 110 - ribbon);
		await expect.poll(() => shown(page)).toBe('1000');
		// The edge at the middle of the first row: the first tile is whole, the second starting.
		await setEdge(page, row * 0.5);
		expect(await settledScale(page, 0)).toBeCloseTo(1, 2);
		await expect.poll(() => shown(page)).toBe('1100');
		// The edge touches the bottom of the first row: the second is whole and moving.
		await setEdge(page, row);
		expect(await settledScale(page, 1)).toBeCloseTo(1, 2);
		await expect.poll(() => playing(page, 1), { timeout: 15_000 }).toBe(true);
		expect(await shown(page)).toBe('1100');
		// A couple of centimetres of the second row: the third starts.
		await setEdge(page, second + 110);
		await expect.poll(() => shown(page)).toBe('1110');
		// The edge touches the bottom of the second row: the fourth is whole and moving.
		await setEdge(page, second + row);
		expect(await settledScale(page, 3)).toBeCloseTo(1, 2);
		await expect.poll(() => playing(page, 3), { timeout: 15_000 }).toBe(true);
	});

	test('a tile grows from half size, seen on screen', async ({ page }) => {
		await page.goto('/');
		const { row, ribbon } = await geometry(page);
		await setEdge(page, 110 - ribbon);
		await expect.poll(() => shown(page)).toBe('1000');
		expect(await scaleOf(page, 0)).toBeLessThan(0.9);
		await setEdge(page, row * 0.5);
		expect(await settledScale(page, 0)).toBeCloseTo(1, 2);
	});

	test('going back up the top row leaves together at the first tile\'s points; the bottom row stays and keeps playing', async ({ page }) => {
		test.setTimeout(60_000);
		await page.goto('/');
		const { row, second, ribbon } = await geometry(page);
		await setEdge(page, second + row);
		await expect.poll(() => playing(page, 2), { timeout: 15_000 }).toBe(true);
		// The bottom of the first row passed on the way up: the right tile has not gone before the left.
		await setEdge(page, row * 0.7);
		expect(await settledScale(page, 1)).toBeCloseTo(1, 2);
		// Below the middle of the row both shrink, by the same amount.
		await setEdge(page, row * 0.25);
		const left = await settledScale(page, 0);
		expect(left).toBeLessThan(0.999);
		expect(await scaleOf(page, 1)).toBeCloseTo(left, 2);
		expect(await shown(page)).toBe('1111');
		await setEdge(page, 60 - ribbon);
		await expect.poll(() => shown(page)).toBe('0011');
		// Going down again, the order is as before: the left first, the right after it.
		await setEdge(page, 110 - ribbon);
		await expect.poll(() => shown(page)).toBe('1011');
		await setEdge(page, second + 20);
		await expect.poll(() => shown(page)).toBe('1111');
		await expect.poll(() => playing(page, 2), { timeout: 15_000 }).toBe(true);
	});

	test('the first video moves while the rest of the page is still loading', async ({ page }) => {
		test.setTimeout(60_000);
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
		const { row } = await geometry(page);
		await setEdge(page, row * 0.5);
		await expect.poll(() => playing(page, 0), { timeout: 15_000 }).toBe(true);
		expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
	});

	test('the first tile comes at once, poster first, even before its video can play', async ({ page }) => {
		await page.unrouteAll();
		await page.route(/\/assets\/video\/mp4\//, async route => { await new Promise(resolve => setTimeout(resolve, 15_000)); await route.abort().catch(() => {}); });
		await page.goto('/');
		const { row } = await geometry(page);
		await setEdge(page, row * 0.5);
		await expect.poll(() => page.locator('.reel__bloom').first().evaluate(bloom => getComputedStyle(bloom).opacity)).toBe('1');
		expect(await page.locator('.reel__bloom img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
	});

	test('the tiles are hidden before main.js arrives, so no poster flashes and vanishes', async ({ page }) => {
		let release;
		const held = new Promise(resolve => { release = resolve; });
		await page.route(/\/main\.js/, async route => { await held; await route.continue(); });
		// A deferred script holds DOMContentLoaded, so wait only for the grid's markup.
		await page.goto('/', { waitUntil: 'commit' });
		await page.waitForSelector('#reviews', { state: 'attached' });
		await setEdge(page, 400);
		expect(await page.evaluate(() => window.LCBReelSequence)).toBeUndefined();
		expect(await page.locator('.reel__bloom').evaluateAll(blooms => blooms.map(bloom => getComputedStyle(bloom).opacity))).toEqual(['0', '0', '0', '0']);
		release();
		await expect(page.locator('.reel__tile').first()).toHaveClass(/is-shown/);
	});

	test('without main.js the tiles come back after 8 s', async ({ page }) => {
		await page.route(/\/main\.js/, route => route.abort());
		await page.goto('/');
		await setEdge(page, 400);
		await expect.poll(() => page.locator('.reel__bloom').first().evaluate(bloom => getComputedStyle(bloom).opacity), { timeout: 12_000 }).toBe('1');
	});

	test('the upper video rail under the title stands still', async ({ page }) => {
		await page.goto('/');
		const rail = page.locator('.video-rail--big').first();
		expect(await rail.getAttribute('data-magnet-item')).toBeNull();
		await rail.evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - innerHeight + 60, behavior: 'instant' }));
		await page.waitForTimeout(400);
		expect(await rail.evaluate(node => getComputedStyle(node).transform)).toBe('none');
	});

	// Measured on the live apple.com/apple-music on 30.10: straight in the scroll from the bottom edge.
	for (const [name, selector] of [['lower video rail', '.video-rails > .video-rail--small[data-magnet-item]'], ['direction card', '#directions [data-magnet] > li:nth-child(3)']]) {
		test(`the ${name} sticks within 200 px of the bottom edge, straight in the scroll`, async ({ page }) => {
			await page.unrouteAll();
			await page.route('**/*.mp4*', route => route.abort());
			await page.goto('/');
			const element = page.locator(selector).first();
			const lift = () => element.evaluate(node => { const m = getComputedStyle(node).transform; return m === 'none' ? 0 : Number.parseFloat(m.split(',')[5]); });
			const past = distance => element.evaluate((node, d) => {
				const top = node.getBoundingClientRect().top + scrollY - (Number.parseFloat(getComputedStyle(node).transform.split(',')[5]) || 0);
				scrollTo({ top: top - innerHeight + d, behavior: 'instant' });
			}, distance);
			await past(100);
			await expect.poll(lift).toBeGreaterThan(36);
			await expect.poll(lift).toBeLessThan(44);
			expect(Number(await element.evaluate(node => getComputedStyle(node).opacity))).toBeCloseTo(0.5, 0);
			await past(205);
			await expect.poll(lift).toBeLessThan(1);
			// Back to the same point: it comes unstuck again.
			await past(100);
			await expect.poll(lift).toBeGreaterThan(36);
		});
	}
});
