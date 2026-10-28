(() => {
  'use strict';
  // These events measure site interactions. A contact click is not a conversation
  // or booking; those outcomes must come from the CRM with a verified match.
  const counter = 110040914;
  const sent = new WeakMap();
  const report = (goal, details = {}) => {
    if (typeof window.ym !== 'function') return;
    window.ym(counter, 'reachGoal', goal, {
      page: location.pathname,
      language: document.documentElement.lang || 'ru',
      ...details,
    });
  };
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    const channel = url.hostname === 't.me' && /^\/Luxurycover_ru\/?$/i.test(url.pathname) ? 'telegram'
      : url.hostname === 'wa.me' && /^\/971502776169\/?$/.test(url.pathname) ? 'whatsapp' : null;
    if (channel) {
      const section = link.closest('[data-analytics-section]')?.dataset.analyticsSection
        || link.closest('section')?.id
        || (link.closest('header,nav') ? 'navigation' : link.closest('footer') ? 'footer' : 'content');
      report('contact_click', {channel, section});
    } else if (url.pathname.endsWith('/promo-package.php')) {
      report('promo_download', {quality:url.searchParams.get('quality') || 'original'});
    } else if (/\.pdf$/i.test(url.pathname)) {
      report('document_download', {document:url.pathname.split('/').pop()});
    }
  });
  document.addEventListener('playing', event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || video.matches('[data-background-video]') || video.closest('.story-rooms__gallery')) return;
    if (video.muted && video.loop) return;
    const source = video.currentSrc || video.src || video.querySelector('source[src]')?.src;
    if (!source || sent.get(video) === source) return;
    sent.set(video, source);
    report('video_play', {video:new URL(source, location.href).pathname.split('/').pop()});
  }, true);
})();
