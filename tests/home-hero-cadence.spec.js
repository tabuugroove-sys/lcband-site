import { expect, test } from '@playwright/test';

async function observeCadence(page) {
	await page.addInitScript(() => {
		window.heroCadence = [];
		document.addEventListener('load', event => {
			if (event.target?.dataset?.heroImg === 'red' && !window.heroCadence.length) {
				window.heroCadence.push({ key: 'red', time: performance.now() });
			}
		}, true);
		new MutationObserver(() => {
			const image = document.querySelector('[data-hero-img].is-active');
			const key = image?.dataset.heroImg;
			if (key && window.heroCadence.length && window.heroCadence.at(-1).key !== key) {
				window.heroCadence.push({ key, time: performance.now(), loaded: image.complete && image.naturalWidth > 0 });
			}
		}).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
	});
}

for (const cold of [false, true]) {
	test(`all four looks have equal intervals, including wraparound${cold ? ' on cold delayed load' : ''}`, async ({ page, isMobile }) => {
		test.setTimeout(45000);
		await observeCadence(page);
		if (cold) {
			await page.route('**/main.js?*', async route => {
				await new Promise(resolve => setTimeout(resolve, 1800));
				await route.continue();
			});
			await page.route(/hero-(bw|gold|white)-\d+\.webp/, async route => {
				await new Promise(resolve => setTimeout(resolve, 800));
				await route.continue();
			});
		}
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await expect.poll(() => page.evaluate(() => window.heroCadence.length), { timeout: 26000 }).toBeGreaterThanOrEqual(6);
		const events = await page.evaluate(() => window.heroCadence.slice(0, 6));
		expect(events.map(event => event.key)).toEqual(['red', 'bw', 'gold', 'white', 'red', 'bw']);
		const expected = isMobile ? 2000 : 5500 / 1.5;
		const intervals = events.slice(1).map((event, i) => event.time - events[i].time);
		for (const interval of intervals) expect(Math.abs(interval - expected)).toBeLessThan(650);
		for (const event of events.slice(1)) expect(event.loaded).toBe(true);
		expect(Math.max(...intervals) - Math.min(...intervals)).toBeLessThan(650);
		console.log(JSON.stringify({ cold, isMobile, intervals }));
	});
}

test('manual selection resumes at the same cadence without the extra waiting period', async ({ page, isMobile }) => {
	await page.goto('/');
	await page.locator('[data-hero-dot="white"]').click();
	await expect(page.locator('[data-hero-img="white"]')).toHaveClass(/is-active/);
	await expect(page.locator('[data-hero-img="red"]')).toHaveClass(/is-active/, { timeout: (isMobile ? 2000 : 5500 / 1.5) + 650 });
});
