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
		if (log.at(-1).tiles.every(tile => tile.playing)) break;
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
	// Its video moves while the page is still loading, not after.
	expect(log[firstPlaying(0)].loading).toBe(true);
	// About a second or more between the first two, as before.
	expect(log[order[1]].t - log[order[0]].t).toBeGreaterThan(900);
});
