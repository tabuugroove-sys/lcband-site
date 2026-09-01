// @ts-check
import { test, expect } from '@playwright/test';

const PATH = '/formats/gitarist-u-kostra/';
const VIDEO_KEYS = [
	'yuriy-acoustic-vocal',
	'yuriy-live-stage',
	'yuriy-instrumental',
];

test.describe('гитарист у костра — rich media page', () => {
	test('renders SEO copy, three videos and four distinct photos without PDF', async ({ page }) => {
		await page.goto(PATH);

		await expect(page).toHaveTitle('Гитарист у костра в Москве — заказать на праздник — LC Band');
		await expect(page.locator('h1')).toHaveText('Гитарист у костра на праздник в Москве');
		await expect(page.locator('.video-card--portrait')).toHaveCount(3);

		const keys = await page.locator('.video-card--portrait').evaluateAll((cards) =>
			cards.map((card) => card.getAttribute('data-video'))
		);
		expect(keys).toEqual(VIDEO_KEYS);

		const photos = page.locator('.campfire-hero__media img, .format-artist__portrait img, .format-gallery img');
		await expect(photos).toHaveCount(4);
		for (const image of await photos.all()) {
			await expect(image).toHaveAttribute('alt', /\S+/);
			await image.scrollIntoViewIfNeeded();
			await expect.poll(() => image.evaluate((el) => /** @type {HTMLImageElement} */ (el).naturalWidth)).toBeGreaterThan(0);
		}

		await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Посмотреть репертуар' })).toHaveAttribute('href', 'https://disk.yandex.ru/i/PwjcZgMDCZ6KOA');

		const graph = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
			scripts.flatMap((script) => {
				const data = JSON.parse(script.textContent || '{}');
				return data['@graph'] || [];
			})
		);
		expect(graph.filter((node) => node['@type'] === 'VideoObject')).toHaveLength(3);
		expect(graph.some((node) => node['@type'] === 'BreadcrumbList')).toBe(true);
		expect(graph.filter((node) => node['@type'] === 'MusicGroup')).toHaveLength(1);
		expect(graph.filter((node) => node['@type'] === 'LocalBusiness')).toHaveLength(1);
		const entityIds = graph.map((node) => node['@id']).filter(Boolean);
		expect(new Set(entityIds).size).toBe(entityIds.length);
	});

	test('carousel controls work and the page has no horizontal overflow', async ({ page }) => {
		await page.goto(PATH);
		const shelf = page.locator('[data-video-carousel]');
		await shelf.scrollIntoViewIfNeeded();

		const before = await shelf.evaluate((el) => el.scrollLeft);
		await page.locator('[data-video-carousel-next]').click();
		await expect.poll(() => shelf.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);

		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('keyboard opens the first video in the shared lightbox and Escape closes it', async ({ page }) => {
		await page.goto(PATH);
		const firstVideo = page.locator('.video-card--portrait').first();
		await firstVideo.focus();
		await page.keyboard.press('Enter');

		const lightbox = page.locator('#lightbox');
		await expect(lightbox).toHaveClass(/is-open/);
		await expect(lightbox.locator('video.lightbox__video')).toHaveAttribute('src', /yuriy-acoustic-vocal-720\.mp4/);
		await expect(lightbox.locator('[data-q="1080"]')).toBeHidden();

		await page.keyboard.press('Escape');
		await expect(lightbox).not.toHaveClass(/is-open/);
	});
});
