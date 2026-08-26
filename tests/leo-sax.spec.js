// @ts-check
import { test, expect } from '@playwright/test';

const path = '/sax/leo-sax/';

test.describe('Leo Sax — structure and vendor-only scope', () => {
	test('renders exactly four sections with the main navigation but no footer or forms', async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.ok()).toBe(true);

		await expect(page.locator('.leo > section')).toHaveCount(4);
		await expect(page.locator('.leo > section').nth(0)).toHaveClass(/leo-hero/);
		await expect(page.locator('.leo > section').nth(1)).toHaveClass(/leo-gallery/);
		await expect(page.locator('.leo > section').nth(2)).toHaveClass(/leo-moments/);
		await expect(page.locator('.leo > section').nth(3)).toHaveClass(/leo-repertoire/);
		await expect(page.locator('body > header.nav, body > header.nav nav')).toHaveCount(2);
		await expect(page.locator('body > footer, form')).toHaveCount(0);
		await expect(page.locator('a[href*="whatsapp" i], a[href*="wa.me" i], a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
		await expect(page.locator('h1')).toHaveText(/LEO\s+SAX/i);
		await expect(page.locator('.leo-repertoire__group')).toHaveCount(2);
		await expect(page.locator('.leo-repertoire__group li')).toHaveCount(70);
		await expect(page.locator('.leo-repertoire__group').nth(0)).toContainText('45 треков');
		await expect(page.locator('.leo-repertoire__group').nth(1)).toContainText('25 треков');
		await expect(page.locator('.leo-emblem')).toHaveAttribute('src', /leo-lion-sax-emblem\.webp$/);
		await expect(page.locator('.leo-crest__shield path')).toHaveCount(1);
		await expect(page.locator('.leo-gallery h1, .leo-gallery h2, .leo-gallery p')).toHaveCount(0);
	});

	test('ships canonical metadata and valid Leo-specific structured data', async ({ page }) => {
		await page.goto(path);
		await expect(page).toHaveTitle(/Leo Sax.*саксофонист/i);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://luxuryband.ru/sax/leo-sax/');
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /саксофон.*welcome.*церемонии.*ужина.*вечеринки/i);

		const graph = await page.locator('script[type="application/ld+json"]').evaluate((script) => {
			const data = JSON.parse(script.textContent || '{}');
			return data['@graph'];
		});
		expect(graph.map((entry) => entry['@type'])).toEqual(['WebPage', 'Person', 'VideoObject', 'BreadcrumbList']);
		expect(graph.find((entry) => entry['@type'] === 'VideoObject')?.duration).toBe('PT2M35S');

		await page.goto('/sax/');
		await expect(page.locator('a[href="/sax/leo-sax/"]')).toHaveText(/Leo Sax.*промо/i);
	});
});

test.describe('Leo Sax — hero and responsive player', () => {
	test('balances a larger left LEO SAX wordmark with a smaller right-side heraldic shield', async ({ page, isMobile }) => {
		await page.goto(path);
		const geometry = await page.evaluate(() => {
			const wordmark = document.querySelector('.leo-wordmark').getBoundingClientRect();
			const shield = document.querySelector('.leo-crest__mark').getBoundingClientRect();
			const wordmarkSize = parseFloat(getComputedStyle(document.querySelector('.leo-wordmark h1')).fontSize);
			return { wordmark, shield, wordmarkSize, viewportWidth: innerWidth };
		});
		expect(geometry.wordmark.right).toBeLessThan(geometry.viewportWidth * 0.3);
		expect(geometry.shield.left).toBeGreaterThan(geometry.viewportWidth * 0.7);
		expect(geometry.wordmarkSize).toBeGreaterThanOrEqual(isMobile ? 15 : 25);
		expect(geometry.shield.width).toBeLessThanOrEqual(178);

		await page.setViewportSize({ width: 320, height: 720 });
		await page.goto(path);
		const narrow = await page.evaluate(() => ({
			wordmark: document.querySelector('.leo-wordmark').getBoundingClientRect().toJSON(),
			shield: document.querySelector('.leo-crest__mark').getBoundingClientRect().toJSON(),
		}));
		expect(narrow.wordmark.left).toBeLessThanOrEqual(10);
		expect(narrow.shield.right).toBeLessThanOrEqual(316);
		expect(narrow.shield.width).toBeLessThanOrEqual(62);
		expect(narrow.wordmark.right).toBeLessThan(narrow.shield.left);
	});

	test('does not request the 155-second video until Play is pressed', async ({ page }) => {
		const requests = [];
		page.on('request', (request) => {
			if (/leo-sax-promo-\d+\.mp4/.test(request.url())) requests.push(request.url());
		});

		await page.goto(path);
		await page.waitForTimeout(350);
		expect(requests).toEqual([]);
		await expect(page.locator('[data-leo-video]')).not.toHaveAttribute('src');
		await expect(page.locator('[data-leo-video] source')).toHaveCount(0);
	});

	test('Play stays outside the face safe zone and opens the appropriate profile', async ({ page, isMobile }) => {
		await page.addInitScript(() => {
			const addMediaListener = HTMLMediaElement.prototype.addEventListener;
			HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
				if (type === 'error' || type === 'waiting') return;
				return addMediaListener.call(this, type, listener, options);
			};
			HTMLMediaElement.prototype.load = function load() {};
			HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
		});
		await page.route('**/assets/video/mp4/leo-sax-promo-*.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
		await page.goto(path);
		await expect(page.locator('[data-player-ui]')).toHaveAttribute('inert', '');

		const geometry = await page.evaluate(() => {
			const button = document.querySelector('[data-leo-play]').getBoundingClientRect();
			return {
				button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom },
				viewport: { width: innerWidth, height: innerHeight },
			};
		});
		const face = {
			left: geometry.viewport.width * 0.43,
			right: geometry.viewport.width * 0.57,
			top: geometry.viewport.height * 0.12,
			bottom: geometry.viewport.height * 0.42,
		};
		const overlapsFace = !(
			geometry.button.right < face.left || geometry.button.left > face.right ||
			geometry.button.bottom < face.top || geometry.button.top > face.bottom
		);
		expect(overlapsFace).toBe(false);

		await page.locator('[data-leo-play]').click();
		await expect(page.locator('[data-leo-hero]')).toHaveClass(/is-playing/);
		await expect(page.locator('[data-player-ui]')).toHaveAttribute('aria-hidden', 'false');
		await expect(page.locator('[data-player-ui]')).not.toHaveAttribute('inert', '');
		await expect(page.locator('[data-leo-video]')).toHaveAttribute('src', new RegExp(`leo-sax-promo-${isMobile ? '720' : '1080'}\\.mp4$`));

		await page.locator('[data-video-close]').click();
		await expect(page.locator('[data-leo-hero]')).not.toHaveClass(/is-playing/);
		await expect(page.locator('[data-leo-video]')).not.toHaveAttribute('src');
		await expect(page.locator('[data-player-ui]')).toHaveAttribute('inert', '');
	});

	test('Save-Data starts with the smallest 480p profile', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'connection', {
				configurable: true,
				value: { saveData: true, effectiveType: '2g' },
			});
			const addMediaListener = HTMLMediaElement.prototype.addEventListener;
			HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
				if (type === 'error' || type === 'waiting') return;
				return addMediaListener.call(this, type, listener, options);
			};
			HTMLMediaElement.prototype.load = function load() {};
			HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
		});
		await page.route('**/assets/video/mp4/leo-sax-promo-*.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
		await page.goto(path);
		await page.locator('[data-leo-play]').click();
		await expect(page.locator('[data-leo-video]')).toHaveAttribute('src', /leo-sax-promo-480\.mp4$/);
		await expect(page.locator('[data-video-quality="480"]')).toHaveClass(/is-active/);
	});

	test('one sustained stall automatically steps down to a lighter profile', async ({ page, isMobile }) => {
		await page.addInitScript(() => {
			const nativeSetTimeout = window.setTimeout.bind(window);
			window.setTimeout = ((callback, delay, ...args) => {
				const acceleratedDelay = delay === 5500 || delay === 8000 ? 40 : delay;
				return nativeSetTimeout(callback, acceleratedDelay, ...args);
			});
			const addMediaListener = HTMLMediaElement.prototype.addEventListener;
			HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
				if (type === 'error') return;
				return addMediaListener.call(this, type, listener, options);
			};
			HTMLMediaElement.prototype.load = function load() {};
			HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
		});
		await page.route('**/assets/video/mp4/leo-sax-promo-*.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
		await page.goto(path);
		await page.locator('[data-leo-play]').click();

		const initial = isMobile ? '720' : '1080';
		const fallback = isMobile ? '480' : '720';
		await expect(page.locator('[data-leo-video]')).toHaveAttribute('src', new RegExp(`leo-sax-promo-${initial}\\.mp4$`));
		await page.locator('[data-leo-video]').dispatchEvent('waiting');
		await expect(page.locator('[data-leo-video]')).toHaveAttribute('src', new RegExp(`leo-sax-promo-${fallback}\\.mp4$`), { timeout: 2000 });
	});

	test('uses the iPhone video fullscreen fallback and exits it on close', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
			Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
			Object.defineProperty(HTMLVideoElement.prototype, 'webkitDisplayingFullscreen', {
				configurable: true,
				get() { return Boolean(window.__leoWebkitDisplaying); },
			});
			Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', {
				configurable: true,
				value() {
					window.__leoWebkitDisplaying = true;
					window.__leoWebkitEntered = true;
				},
			});
			Object.defineProperty(HTMLVideoElement.prototype, 'webkitExitFullscreen', {
				configurable: true,
				value() {
					window.__leoWebkitDisplaying = false;
					window.__leoWebkitExited = true;
				},
			});
			const addMediaListener = HTMLMediaElement.prototype.addEventListener;
			HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
				if (type === 'error' || type === 'waiting') return;
				return addMediaListener.call(this, type, listener, options);
			};
			HTMLMediaElement.prototype.load = function load() {};
			HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
		});
		await page.route('**/assets/video/mp4/leo-sax-promo-*.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
		await page.goto(path);
		await page.locator('[data-leo-play]').click();
		await page.locator('[data-video-fullscreen]').click();
		expect(await page.evaluate(() => window.__leoWebkitEntered)).toBe(true);
		await page.locator('[data-video-close]').click();
		expect(await page.evaluate(() => window.__leoWebkitExited)).toBe(true);
	});
});

test.describe('Leo Sax — swipe carousel', () => {
	test('uses a white, text-free gallery and advances automatically', async ({ page }) => {
		await page.addInitScript(() => {
			const nativeSetTimeout = window.setTimeout.bind(window);
			window.setTimeout = ((callback, delay, ...args) => nativeSetTimeout(callback, delay === 4300 ? 80 : delay, ...args));
		});
		await page.goto(path);
		await page.locator('.leo-gallery').scrollIntoViewIfNeeded();
		await expect(page.locator('.leo-gallery')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
		await expect(page.locator('[data-carousel-dot="1"]')).toHaveClass(/is-active/, { timeout: 2000 });
	});

	test('starts centered with visible adjacent photos on both sides', async ({ page, isMobile }) => {
		await page.goto(path);
		await page.locator('.leo-gallery').scrollIntoViewIfNeeded();
		await expect.poll(() => page.locator('[data-carousel-track] > [data-carousel-slide]').count()).toBe(11);

		const peeks = await page.evaluate(() => {
			const slides = [...document.querySelectorAll('[data-carousel-track] > [data-carousel-slide]')];
			const before = slides[1].getBoundingClientRect();
			const first = slides[2].getBoundingClientRect();
			const next = slides[3].getBoundingClientRect();
			const leftPeek = slides
				.filter((slide) => slide.dataset.clone === 'before')
				.map((slide) => slide.getBoundingClientRect())
				.find((rect) => rect.left < 0 && rect.right > 0);
			return {
				before: { left: before.left, right: before.right },
				first: { left: first.left, right: first.right },
				next: { left: next.left, right: next.right },
				leftPeek: leftPeek ? { left: leftPeek.left, right: leftPeek.right } : null,
				width: innerWidth,
			};
		});
		expect(peeks.first.left).toBeGreaterThan(0);
		expect(peeks.first.right).toBeLessThan(peeks.width);
		expect(peeks.before.right).toBeGreaterThan(0);
		expect(peeks.next.left).toBeLessThan(peeks.width);
		expect(peeks.leftPeek).not.toBeNull();
		if (isMobile) {
			expect(peeks.before.left).toBeLessThan(0);
			expect(peeks.next.right).toBeGreaterThan(peeks.width);
		} else {
			expect(peeks.before.right).toBeLessThan(peeks.first.left);
			expect(peeks.next.left).toBeGreaterThan(peeks.first.right);
		}
	});

	test('native horizontal movement advances the active photo', async ({ page }) => {
		await page.goto(path);
		await page.locator('.leo-gallery').scrollIntoViewIfNeeded();
		await expect.poll(() => page.locator('[data-carousel-track] > [data-carousel-slide]').count()).toBe(11);

		await page.evaluate(() => {
			const viewport = document.querySelector('[data-carousel-viewport]');
			const second = document.querySelector('[data-carousel-slide][data-slide-index="1"]:not([data-clone])');
			const left = second.offsetLeft - (viewport.clientWidth - second.clientWidth) / 2;
			viewport.scrollTo({ left, behavior: 'auto' });
		});
		await expect(page.locator('[data-carousel-dot="1"]')).toHaveClass(/is-active/, { timeout: 2000 });
	});
});
