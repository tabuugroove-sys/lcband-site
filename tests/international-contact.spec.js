import { test, expect } from '@playwright/test';

const locales = [
  { path:'/en/', lang:'en', close:'Close', auto:'Auto', share:'Share', download:'Download video', loading:'Loading video…' },
  { path:'/ae/', lang:'ar', close:'إغلاق', auto:'تلقائي', share:'مشاركة', download:'تنزيل الفيديو', loading:'جارٍ تحميل الفيديو…' },
  { path:'/br/', lang:'pt-BR', close:'Fechar', auto:'Automático', share:'Compartilhar', download:'Baixar vídeo', loading:'Carregando vídeo…' },
];

test.beforeEach(async ({ page }) => {
  // These regressions test interface language and destinations, not media delivery.
  await page.route('**/*.mp4*', route => route.abort());
});

for (const locale of locales) {
  test(`${locale.lang}: localized page, accessibility labels, schema and booking links`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(locale.path);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    const audit = await page.evaluate(() => {
      const text = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('script,style')) text.push(walker.currentNode.textContent);
      const attributes = [...document.querySelectorAll('[aria-label],[alt],[placeholder],[title]')].flatMap(el => ['aria-label','alt','placeholder','title'].map(key => el.getAttribute(key) || ''));
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(el => JSON.parse(el.textContent));
      const wrongLinks = [...document.querySelectorAll('a[href]')].flatMap(el => {
        if (el.hasAttribute('hreflang')) return [];
        const url = new URL(el.href);
        if (![location.origin,'https://luxuryband.ru'].includes(url.origin)) return [];
        const prefix = location.pathname.startsWith('/en/') ? '/en/' : location.pathname;
        if (url.pathname.endsWith('/') && !url.pathname.startsWith(prefix)) return [url.href];
        if (url.pathname === location.pathname && url.hash && !document.getElementById(decodeURIComponent(url.hash.slice(1)))) return [url.href];
        return [];
      });
      return { text:text.join(' '), attributes, schemas, wrongLinks };
    });
    expect(audit.text).not.toMatch(/[А-Яа-яЁё]/);
    expect(audit.attributes.join(' ')).not.toMatch(/[А-Яа-яЁё]/);
    expect(JSON.stringify(audit.schemas)).not.toMatch(/[А-Яа-яЁё]/);
    expect(audit.wrongLinks).toEqual([]);
    await expect(page.locator('a[href*="t.me"]')).toHaveCount(0);
    expect(await page.locator('a[href="https://wa.me/971502776169"]').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test(`${locale.lang}: player, CSS loading label and sharing keep their language`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(locale.path);
    await page.waitForFunction(() => document.querySelector('.video-rail--big .video-rail__track')?.dataset.loopReady === '1');
    await page.locator('.video-rail--big').scrollIntoViewIfNeeded();
    const trigger = await page.evaluateHandle(() => [...document.querySelectorAll('.video-rail--big [data-video]')].find(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    }));
    expect(trigger.asElement()).not.toBeNull();
    await trigger.asElement().click();
    const player = page.locator('#lightbox');
    await expect(player).toHaveClass(/is-open/);
    await expect(player.locator('[data-q="auto"]')).toHaveText(locale.auto);
    await expect(player.locator('.lightbox__close')).toHaveAttribute('aria-label', locale.close);
    const loading = await player.evaluate(el => {
      el.classList.add('is-video-loading');
      const content = getComputedStyle(el,'::after').content;
      el.classList.remove('is-video-loading');
      el.querySelector('video').dispatchEvent(new Event('play'));
      return content;
    });
    expect(loading).toContain(locale.loading);
    await player.locator('.video-share-actions button').filter({hasText:locale.share}).first().click();
    const share = page.locator('.video-share-dialog');
    await expect(share).toBeVisible();
    expect(await share.innerText()).not.toMatch(/[А-Яа-яЁё]/);
    await expect(share.locator('.video-share-download')).toContainText(locale.download);
    const shared = new URL(await share.locator('.video-share-url').inputValue());
    expect(shared.searchParams.get('lang')).toBe(locale.lang);
    await expect(share.locator('a[href*="t.me"]')).toHaveCount(0);
    await share.locator('.video-share-close').click();
    await page.keyboard.press('Escape');
    await expect(player).not.toHaveClass(/is-open/);
    expect(errors).toEqual([]);
  });

  test(`${locale.lang}: standalone shared player localizes errors and download`, async ({ page }) => {
    await page.goto(`/embed/?lang=${locale.lang}`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.lang);
    expect(await page.locator('body').innerText()).not.toMatch(/[А-Яа-яЁё]/);
    await expect(page.locator('#download')).toContainText(locale.download);
    await expect(page.locator('#error')).toBeVisible();
    await expect(page.locator('#home')).toHaveAttribute('href','https://luxuryband.ru'+locale.path);
  });
}

test('Russian booking stays on Telegram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang','ru');
  await expect(page.locator('header .nav__cta')).toHaveAttribute('href','https://t.me/Luxurycover_ru');
  await expect(page.locator('header .nav__cta')).toHaveText('Написать в Телеграм');
});
