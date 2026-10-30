import { expect, test } from '@playwright/test';

// Mikhail, 30.10: «Главное — музыка» big over the videos, the promo downloads on a page
// for agencies (under «Райдеры» in the menu), sound waves behind «2000+», a new line
// in the booking block, and the zoom experiment on the reel tiles.
test.beforeEach(async ({ page }) => {
	await page.route('**/*.mp4*', route => route.abort());
});

test('the video section opens with one big line and no downloads', async ({ page }) => {
	await page.goto('/');
	const videos = page.locator('#videos');
	await expect(videos.locator('.music-title')).toHaveText(/Главное —\s*музыка\./);
	await expect(videos.locator('.promo-downloads')).toHaveCount(0);
	await expect(page.locator('#book h2')).toContainText('Давайте соберём всех друзей вместе');
	await expect(page.locator('[data-reel-grid][data-reel-zoom]')).toHaveCount(1);
});

test('«Райдеры» in the menu leads to the agencies page as well', async ({ page, isMobile }) => {
	await page.goto('/');
	const item = page.locator('#nav .nav__item[data-nav-path="/riders/"]');
	await expect(item.locator('a[href="/agencies/"]')).toHaveCount(1);
	if (!isMobile) {
		await item.locator('.nav__link').hover();
		await expect(item.locator('a[href="/agencies/"]')).toBeVisible();
	}
	await page.goto('/agencies/');
	await expect(page.locator('h1')).toHaveText('Агентствам');
	await expect(page.locator('.promo-downloads a.btn')).toHaveCount(2);
});

test('sound waves run behind 2000+ and stay away under reduced motion', async ({ page }) => {
	await page.goto('/');
	const waves = page.locator('[data-count-block] .about-count__waves span');
	await expect(waves).toHaveCount(4);
	expect(await waves.first().evaluate(span => getComputedStyle(span).animationName)).toBe('count-wave');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect(page.locator('[data-count-block] .about-count__waves')).toBeHidden();
});

test('direction cards wait lower near the bottom edge and stick in place further up', async ({ page, isMobile }) => {
	test.skip(isMobile, 'the shelf is a swipe carousel on phones');
	await page.goto('/');
	const card = page.locator('#directions [data-magnet] > li').nth(2);
	const placeAt = fraction => card.evaluate((element, f) => {
		const top = element.getBoundingClientRect().top + scrollY - (Number.parseFloat(getComputedStyle(element).transform.split(',')[5]) || 0);
		scrollTo({ top: top - innerHeight * f, behavior: 'instant' });
	}, fraction);
	const lift = () => card.evaluate(element => { const m = getComputedStyle(element).transform; return m === 'none' ? 0 : Number.parseFloat(m.split(',')[5]); });
	await placeAt(0.95);
	await expect.poll(lift).toBeGreaterThan(40);
	await placeAt(0.3);
	await expect.poll(lift).toBeLessThan(1);
});
