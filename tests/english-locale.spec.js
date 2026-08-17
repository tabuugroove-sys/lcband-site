// @ts-check
import { test, expect } from '@playwright/test';

const ENGLISH_ROUTES = [
	'/en/',
	'/en/about/',
	'/en/programs/',
	'/en/programs/italian/',
	'/en/programs/french/',
	'/en/programs/spanish/',
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
	'/en/vocalists/',
	'/en/vocalists/irina/',
	'/en/vocalists/stas/',
	'/en/vocalists/teddy/',
	'/en/vocalists/laz/',
	'/en/costumes/',
	'/en/sax/',
	'/en/riders/',
	'/en/repertoire/',
	'/en/artists/',
	'/en/blog/',
];

const EXPECTED_MENU = [
	'Home',
	'Vocalists',
	'Themed Programs',
	'Costumes',
	'Formats',
	'Sax',
	'Events',
	'Riders',
	'Blog',
	'Message on Telegram',
];

for (const path of ENGLISH_ROUTES) {
	test(`${path} stays fully inside the English site`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.ok(), `${path} should return a successful response`).toBe(true);
		expect(new URL(page.url()).pathname).toBe(path);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');

		const bodyText = await page.locator('body').innerText();
		expect(bodyText, `${path} should not contain Russian UI text`).not.toMatch(/[А-Яа-яЁё]/);

		const menuLabels = await page
			.locator('header nav a')
			.evaluateAll((links) => links.map((link) => (link.textContent || '').trim()).filter(Boolean));
		expect(menuLabels).toEqual(EXPECTED_MENU);

		const wrongPageLinks = await page.locator('a[href]').evaluateAll((links) =>
			links.flatMap((link) => {
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

	await page.goto('/en/programs/spanish/');
	await page.locator('button[aria-label*="menu" i]').click();
	await page.getByRole('link', { name: 'Events', exact: true }).first().click();

	await expect(page).toHaveURL(/\/en\/events\/$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('body')).not.toContainText(/[А-Яа-яЁё]/);
});
