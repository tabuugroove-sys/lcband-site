import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('**/*.mp4*', route => route.abort());
});

test('about columns stay readable from phones to wide monitors', async ({page}) => {
  for (const width of [360,390,768,1024,1440,1920,2288,2560]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/about/');
    const geometry = await page.locator('.story-room__copy').first().evaluate(el => {
      const box=el.getBoundingClientRect(); const css=getComputedStyle(el);
      const text=el.querySelector('.story-room__text').getBoundingClientRect();
      return {copyWidth:box.width-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight), textWidth:text.width, pageWidth:document.documentElement.scrollWidth, viewport:innerWidth};
    });
    expect(geometry.copyWidth,`copy width at ${width}`).toBeGreaterThan(270);
    expect(geometry.textWidth,`text width at ${width}`).toBeGreaterThan(270);
    expect(geometry.pageWidth,`page overflow at ${width}`).toBeLessThanOrEqual(geometry.viewport+1);
    if (width<=900) {
      await expect(page.locator('.story-rooms')).not.toHaveClass(/is-enhanced/);
      await expect(page.locator('.story-room__watch').first()).toBeVisible();
    }
  }
});

test('mobile menu exposes formats/events over an opaque panel', async ({page}) => {
  await page.setViewportSize({width:390,height:900});
  for (const prefix of ['','/en']) {
    await page.goto(prefix+'/programs/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.locator('.nav__burger').click();
    await page.locator(`.nav__item[data-nav-path="${prefix}/programs/"] .nav__submenu-toggle`).click();
    const menu=page.locator('.nav__links');
    await expect(menu).toHaveCSS('background-color','rgb(16, 16, 18)');
    const format=menu.locator(`.nav__mobile-shortcut a[href="${prefix}/formats/"]`);
    await expect(format).toBeVisible();
    await expect(menu.locator(`.nav__mobile-shortcut a[href="${prefix}/events/"]`)).toBeVisible();
    await format.click();
    await expect(page).toHaveURL(new RegExp(prefix+'/formats/$'));
  }
});

test('Save-Data prevents automatic background/story video requests', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
  await page.goto('/about/');
  await expect(page.locator('[data-background-video]')).not.toHaveAttribute('src',/.+/);
  await expect(page.locator('.story-rooms')).not.toHaveClass(/is-enhanced/);
});

test('resizing a desktop about page switches to the mobile story layout', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/about/');
  await expect(page.locator('.story-rooms')).toHaveClass(/is-enhanced/);
  await page.setViewportSize({width:390,height:900});
  await expect(page.locator('.story-rooms')).not.toHaveClass(/is-enhanced/);
  await expect(page.locator('.story-room__watch').first()).toBeVisible();
  expect(await page.locator('.story-rooms__gallery video').evaluateAll(videos=>videos.every(video=>video.paused))).toBe(true);
});

test('contact and download events stay distinct from conversations and bookings', async ({page}) => {
  await page.addInitScript(()=>{ window.capturedGoals=[]; window.ym=(...args)=>window.capturedGoals.push(args); });
  await page.goto('/en/');
  await page.locator('header .nav__cta').evaluate(link=>{
    link.addEventListener('click',event=>event.preventDefault());
    link.click();
  });
  const calls=await page.evaluate(()=>window.capturedGoals);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual([110040914,'reachGoal','contact_click',{page:'/en/',language:'en',channel:'whatsapp',section:'navigation'}]);
});

test('a video request alone is not a video view, and social sharing is not a lead', async ({page}) => {
  await page.addInitScript(()=>{ window.capturedGoals=[]; window.ym=(...args)=>window.capturedGoals.push(args); });
  await page.goto('/en/');
  await page.evaluate(()=>{
    const video=document.querySelector('[data-hero-video]');
    video.src='/assets/video/mp4/test-1080.mp4';
    video.dispatchEvent(new Event('play'));
    const share=document.createElement('a'); share.href='https://wa.me/?text=example';
    share.addEventListener('click',event=>event.preventDefault()); document.body.append(share); share.click();
  });
  expect(await page.evaluate(()=>window.capturedGoals)).toEqual([]);
  await page.locator('[data-hero-video]').evaluate(video=>{video.dispatchEvent(new Event('playing'));video.dispatchEvent(new Event('playing'));});
  const goals=await page.evaluate(()=>window.capturedGoals);
  expect(goals).toHaveLength(1);
  expect(goals[0][2]).toBe('video_play');
});
