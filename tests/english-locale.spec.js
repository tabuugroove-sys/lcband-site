// @ts-check
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.route(url => /\.mp4$/i.test(url.pathname), route => route.abort());
});

const ENGLISH_ROUTES = [
	'/en/',
	'/en/about/',
	'/en/programs/',
	'/en/programs/italian/',
	'/en/programs/french/',
	'/en/programs/latin/',
	'/en/programs/retro/',
	'/en/programs/jazz/',
	'/en/programs/rock/',
	'/en/events/',
	'/en/events/corporate/',
	'/en/events/wedding/',
	'/en/events/birthday/',
	'/en/events/new-year/',
	'/en/events/private-party/',
	'/en/events/tv/',
	'/en/events/abroad/',
	'/en/formats/',
	'/en/formats/choir-collab/',
	'/en/formats/home-band/',
	'/en/formats/karaoke/',
	'/en/formats/welcome/',
	'/en/formats/gitarist-u-kostra/',
	'/en/vocalists/',
	'/en/vocalists/irina/',
	'/en/vocalists/stas/',
	'/en/vocalists/teddy/',
	'/en/vocalists/laz/',
	'/en/costumes/',
	'/en/sax/',
	'/en/riders/',
	'/en/repertoire/',
	'/en/repertoire/catalog/',
	'/en/artists/',
	'/en/blog/',
	'/en/blog/kaver-gruppa-ili-didzhej/',
	'/en/blog/skolko-stoit-kaver-gruppa/',
	'/en/sax/leo-sax/',
	'/en/sax/stereo-sax/',
];

const EXPECTED_MENU = [
	'Home',
	'Vocalists',
	'Programs and Formats',
	'Costumes',
	'Saxophone',
	'Riders',
	'Blog',
	'Message on WhatsApp',
];

for (const path of ENGLISH_ROUTES) {
	test(`${path} stays fully inside the English site`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.ok(), `${path} should return a successful response`).toBe(true);
		expect(new URL(page.url()).pathname).toBe(path);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');

		const bodyText = await page.locator('body').innerText();
		expect(bodyText, `${path} should not contain Russian UI text`).not.toMatch(/[А-Яа-яЁё]/);
		await expect(page.locator('a[href*="t.me"]')).toHaveCount(0);
		expect(await page.locator('a[href^="https://wa.me/971502776169"]').count()).toBeGreaterThan(0);

		const menuLabels = await page
			.locator('header nav a.nav__link')
			.evaluateAll((links) => links.map((link) => (link.textContent || '').trim()).filter(Boolean));
		if (path !== '/en/repertoire/catalog/') expect(menuLabels).toEqual(EXPECTED_MENU);
		if (path === '/en/repertoire/catalog/') await expect(page.locator('.song-section li')).toHaveCount(420);

		const wrongPageLinks = await page.locator('a[href]').evaluateAll((links) =>
			links.flatMap((link) => {
				if (link.hasAttribute('hreflang')) return [];
				const url = new URL(link.getAttribute('href') || '', window.location.href);
				const isInternal = url.origin === window.location.origin;
				const isPage = url.pathname.endsWith('/') || url.pathname.endsWith('.html');
				if (!isInternal || !isPage || url.pathname.startsWith('/en/')) return [];
				return [{ text: (link.textContent || '').trim(), href: url.pathname }];
			})
		);
		expect(wrongPageLinks, `${path} links to a non-English HTML page`).toEqual([]);
	});
}

test('mobile menu keeps navigation in the English locale', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'mobile navigation regression');

	await page.goto('/en/programs/latin/');
	await page.locator('button[aria-label*="menu" i]').click();
	await page.getByRole('link', { name: 'Programs and Formats', exact: true }).click();

	await expect(page).toHaveURL(/\/en\/programs\/$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('body')).not.toContainText(/[А-Яа-яЁё]/);
});

test('the root URL stays Russian even after visiting an explicit locale', async ({ page }) => {
	await page.goto('/en/');
	await page.evaluate(() => localStorage.setItem('lcb_locale', 'en'));

	await page.goto('/');

	expect(new URL(page.url()).pathname).toBe('/');
	await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
	expect(await page.evaluate(() => localStorage.getItem('lcb_locale'))).toBe('ru');
});

test('costume promo finishes into the page language playlist', async ({ page }) => {
	await page.route('**/promo-costume-*.mp4', () => {});
	const openingPromos = async () => page
		.locator('.video-rail--big .vtile__link[data-video]')
		.evaluateAll((links) => links.slice(0, 2).map((link) => link.dataset.video));
	const heroVideoSource = async () => page.locator('[data-hero-video]').getAttribute('src');
	const finishHeroVideo = async () => page
		.locator('[data-hero-video]')
		.evaluate((video) => video.dispatchEvent(new Event('ended')));

	await page.goto('/');
	expect(await openingPromos()).toEqual(['promo-main-reel', 'promo-egoistka']);
	await page.waitForTimeout(600);
	await page.locator('[data-hero-play]').click();
	expect(await heroVideoSource()).toMatch(/promo-costume-red-[a-f0-9]{12}-\d+\.mp4$/);
	await finishHeroVideo();
	expect(await heroVideoSource()).toMatch(/promo-main-reel-[a-f0-9]{12}-\d+\.mp4$/);

	await page.goto('/en/');
	expect(await openingPromos()).toEqual(['promo-lets-get-it-started', 'promo-danza-cuduro']);
	await page.waitForTimeout(600);
	await page.locator('[data-hero-play]').click();
	expect(await heroVideoSource()).toContain('/promo-costume-red-');
	await finishHeroVideo();
	expect(await heroVideoSource()).toContain('/promo-lets-get-it-started-');
});

for (const route of ['/', '/en/', '/ae/', '/br/']) {
	test(`${route} costume photo opens its matching short promo`, async ({ page, isMobile }) => {
		await page.route('**/promo-costume-*.mp4', () => {});
		await page.emulateMedia({ reducedMotion: 'reduce' });
		for (const costume of ['red', 'bw', 'gold', 'white']) {
			await page.goto(route);
			const dot = page.locator(`[data-hero-dot="${costume}"]`);
			await dot.click();
			await expect(dot).toHaveAttribute('aria-selected', 'true');
			await expect(page.locator(`[data-hero-img="${costume}"]`)).toHaveClass(/is-active/);
			await page.locator('[data-hero-play]').click();
			await expect(page.locator('[data-hero-video]')).toHaveAttribute('src',
				new RegExp(`promo-costume-${costume}-[a-f0-9]{12}-${isMobile ? '720' : '1080'}\\.mp4$`));
		}
	});
}

for (const supported of [true, false]) {
	test(`costume 4K respects device codec support: ${supported}`, async ({ page }) => {
		await page.route('**/promo-costume-*.mp4', () => {});
		await page.addInitScript(value => {
			const original = HTMLMediaElement.prototype.canPlayType;
			HTMLMediaElement.prototype.canPlayType = function(type) {
				return type.includes('hvc1') ? (value ? 'probably' : '') : original.call(this, type);
			};
		}, supported);
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await page.locator('[data-hero-play]').click();
		const button = page.locator('[data-hero-q="2160"]');
		if (supported) {
			await expect(button).toBeVisible();
			await button.click();
			await expect(page.locator('[data-hero-video]')).toHaveAttribute('src', /promo-costume-red-[a-f0-9]{12}-2160\.mp4$/);
		} else {
			await expect(button).toBeHidden();
			await expect(page.locator('[data-hero-video]')).toHaveAttribute('src', /promo-costume-red-[a-f0-9]{12}-(720|1080)\.mp4$/);
		}
		const family = await page.evaluate(() => window.LCBPromoVideoSources['promo-costume-red'].family);
		await page.goto(`/embed/?src=${encodeURIComponent(`/assets/video/mp4/${family}-2160.mp4`)}`, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('video')).toHaveAttribute('src',
			new RegExp(`${family}-${supported ? '2160' : '1080'}\\.mp4$`));
	});
}

test('English sax page is a translated structural twin of the Russian page', async ({ page }) => {
	const sectionSignature = async () => page.locator('.sx > section').evaluateAll((sections) =>
		sections.map((section) => ({
			className: section.className,
			id: section.id,
			headingCount: section.querySelectorAll('h1, h2, h3').length,
			imageCount: section.querySelectorAll('img, video').length,
		}))
	);

	await page.goto('/sax/');
	const russianStructure = await sectionSignature();

	await page.goto('/en/sax/');
	const englishStructure = await sectionSignature();

	expect(englishStructure).toEqual(russianStructure);
	await expect(page.locator('.sx-hero__media')).toHaveAttribute('poster', /sax-night\.jpg$/);
	await expect(page.locator('.sx-gallery img')).toHaveCount(2);
	await expect(page.locator('.sx-group')).toHaveCount(3);
	await expect(page.locator('.faq__item')).toHaveCount(5);
	await expect(page.locator('link[rel="alternate"][hreflang="ru"]')).toHaveAttribute('href', /\/sax\/$/);
	await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/en\/sax\/$/);

	const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
		scripts.map((script) => JSON.parse(script.textContent || '{}'))
	);
	const serializedSchemas = JSON.stringify(schemas);
	expect(serializedSchemas).not.toMatch(/[А-Яа-яЁё]/);
	expect(serializedSchemas).toContain('"@type":"FAQPage"');
	expect(serializedSchemas).toContain('https://luxuryband.ru/en/');
});
