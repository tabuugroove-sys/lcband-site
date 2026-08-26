// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Regression coverage for the homepage video rails (#videos).
 *
 * Bug found 2026-08-04: on desktop, hovering a rail and spinning a normal
 * mouse wheel scrolled the PAGE instead of the rail — the track has no
 * scrollbar or arrows, so it looked frozen. First fixed by translating
 * vertical wheel deltas into horizontal rail scroll (pointer:fine only).
 *
 * Regression found 2026-08-05: that fix couldn't distinguish a real mouse
 * wheel from a trackpad's normal vertical two-finger scroll (both fire the
 * same `wheel` event and both match `pointer: fine`), so it also hijacked
 * ordinary page scrolling for trackpad users whenever the cursor happened to
 * be over a rail — trapping the page instead of letting it scroll past.
 * main.js now leaves wheel/trackpad scroll alone entirely; click-and-drag
 * (with a grab-cursor affordance) is the desktop-mouse interaction instead.
 */

/** Returns an ElementHandle for a tile that is fully inside the viewport. */
async function findVisibleTile(page, railSelector) {
	const handle = await page.evaluateHandle((sel) => {
		const links = [...document.querySelectorAll(`${sel} .vtile__link[data-video]`)];
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		return links.find((a) => {
			const r = a.getBoundingClientRect();
			return r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh;
		}) || null;
	}, railSelector);
	const el = handle.asElement();
	if (!el) throw new Error(`No fully-visible tile found in ${railSelector}`);
	return el;
}

test.describe('video rails — infinite loop setup', () => {
	for (const path of ['/', '/ae/', '/br/', '/en/']) {
		test(`${path} — both rails init with tripled (original + 2 clone) copies`, async ({ page }) => {
			await page.goto(path);
			await page.waitForFunction(
				() => [...document.querySelectorAll('.video-rail__track')].every((t) => t.dataset.loopReady === '1')
			);
			const state = await page.evaluate(() =>
				[...document.querySelectorAll('.video-rail__track')].map((t) => t.children.length)
			);
			expect(state.length).toBe(2);
			for (const childCount of state) {
				expect(childCount).toBeGreaterThan(0);
				expect(childCount % 3).toBe(0); // originals + left clones + right clones
			}
		});
	}
});

test.describe('video rails — open + play', () => {
	test('clicking a tile opens the lightbox and starts real playback', async ({ page }) => {
		const consoleErrors = [];
		const unexpected404s = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});
		page.on('pageerror', (err) => consoleErrors.push(String(err)));
		page.on('response', (res) => {
			// The quality picker HEAD-probes 4K to decide whether to show that
			// button; a 404 there is an expected "not available" answer, not a bug.
			if (res.status() === 404 && !/-2160\.mp4(\?|$)/.test(res.url())) unexpected404s.push(res.url());
		});

		await page.goto('/');
		await page.locator('#videos').scrollIntoViewIfNeeded();
		await page.waitForTimeout(400); // reveal-on-scroll fade-in

		const tile = await findVisibleTile(page, '.video-rail--big');
		await tile.click();

		const lightbox = page.locator('#lightbox');
		await expect(lightbox).toHaveClass(/is-open/);

		const video = lightbox.locator('video.lightbox__video');
		await expect(video).toHaveJSProperty('paused', false, { timeout: 8000 });
		await expect
			.poll(() => video.evaluate((el) => el.readyState), { timeout: 8000, message: 'video never buffered real data' })
			.toBeGreaterThanOrEqual(2);
		await expect(lightbox.locator('[data-q="2160"]')).toBeVisible();

		const otherErrors = consoleErrors.filter((t) => !/Failed to load resource.*404/.test(t));
		expect(otherErrors, 'no unexpected console errors').toEqual([]);
		expect(unexpected404s, 'no unexpected 404s besides the 4K availability probe').toEqual([]);
	});

	test('every video with an original 4K master exposes the 4K selector', async ({ page }) => {
		const original4kVideos = [
			{ key: 'promo-egoistka', path: '/' },
			{ key: 'promo-letet', path: '/' },
			{ key: 'promo-loca-loca', path: '/' },
			{ key: 'thematic-retro-heart', path: '/' },
			{ key: 'promo-danza-cuduro', path: '/' },
			{ key: 'latin-music-luxury-cover-band', path: '/programs/spanish/' }
		];

		let currentPath = '';
		for (const { key, path } of original4kVideos) {
			if (path !== currentPath) {
				await page.goto(path);
				currentPath = path;
			}
			const tile = page.locator(`[data-video="${key}"]`).first();
			await expect(tile, `${key} should be present on the homepage`).toHaveCount(1);
			await tile.evaluate((el) => el.click());

			const lightbox = page.locator('#lightbox');
			await expect(lightbox).toHaveClass(/is-open/);
			await expect(lightbox.locator('[data-q="2160"]'), `${key} should offer 4K`).toBeVisible();

			await page.keyboard.press('Escape');
			await expect(lightbox).not.toHaveClass(/is-open/);
		}
	});
});

test.describe('video rails — desktop mouse (pointer: fine)', () => {
	test.skip(({ isMobile }) => isMobile, 'desktop-only input methods');

	test('vertical wheel scroll over a rail scrolls the page, not the rail (does not trap it)', async ({ page }) => {
		await page.goto('/');
		await page.locator('#videos').scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);

		const trackSel = '.video-rail--big .video-rail__track';
		const box = await page.locator(trackSel).boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

		const before = await page.evaluate(
			(sel) => ({ scrollLeft: document.querySelector(sel).scrollLeft, pageY: window.scrollY }),
			trackSel
		);
		await page.mouse.wheel(0, 300);
		await page.waitForTimeout(200);
		const after = await page.evaluate(
			(sel) => ({ scrollLeft: document.querySelector(sel).scrollLeft, pageY: window.scrollY }),
			trackSel
		);

		expect(after.scrollLeft, 'rail should NOT have hijacked the scroll').toBe(before.scrollLeft);
		expect(after.pageY, 'page should have scrolled normally').not.toBe(before.pageY);
	});

	test('click-and-drag scrolls the rail without opening the lightbox', async ({ page }) => {
		await page.goto('/');
		await page.locator('#videos').scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);

		const trackSel = '.video-rail--big .video-rail__track';
		const tile = await findVisibleTile(page, '.video-rail--big');
		const box = await tile.boundingBox();
		const before = await page.evaluate((sel) => document.querySelector(sel).scrollLeft, trackSel);

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(200);

		const after = await page.evaluate((sel) => document.querySelector(sel).scrollLeft, trackSel);
		expect(after, 'rail should have scrolled from the drag').not.toBe(before);

		const isOpen = await page.evaluate(() => document.getElementById('lightbox').classList.contains('is-open'));
		expect(isOpen, 'a drag must not be interpreted as a tile click').toBe(false);
	});

	test('a plain click (no movement) still opens the lightbox after drag support was added', async ({ page }) => {
		await page.goto('/');
		await page.locator('#videos').scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);

		const tile = await findVisibleTile(page, '.video-rail--big');
		const box = await tile.boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.up(); // no movement between down/up — a genuine click, not a drag

		const isOpen = await page.evaluate(() => document.getElementById('lightbox').classList.contains('is-open'));
		expect(isOpen).toBe(true);
	});
});

test.describe('video rails — mobile loop math', () => {
	test.skip(({ isMobile }) => !isMobile, 'exercises the boundary-jump path a fast swipe triggers');

	test('scrolling deep into a clone copy realigns back into the middle (original) copy', async ({ page }) => {
		await page.goto('/');
		await page.locator('#videos').scrollIntoViewIfNeeded();
		await page.waitForFunction(
			() => document.querySelector('.video-rail--big .video-rail__track')?.dataset.loopReady === '1'
		);

		const trackSel = '.video-rail--big .video-rail__track';
		const result = await page.evaluate((sel) => {
			const track = document.querySelector(sel);
			const w = track.scrollWidth / 3;
			track.scrollLeft = w * 0.1; // deep into the left clone third, as a fast left-swipe would leave it
			track.dispatchEvent(new Event('scroll'));
			return new Promise((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve({ scrollLeft: track.scrollLeft, w })));
			});
		}, trackSel);

		expect(result.scrollLeft).toBeGreaterThanOrEqual(result.w - 1);
		expect(result.scrollLeft).toBeLessThanOrEqual(result.w * 2 + 1);
	});
});
