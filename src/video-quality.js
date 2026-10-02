(() => {
  'use strict';
  const availability = new Map();
  const attached = new WeakSet();
  const suffix = /-(480|720|1080|2160)\.mp4$/;

  function exists(source) {
    const url = new URL(source, location.href).href;
    if (!availability.has(url)) {
      const request = fetch(url, { method: 'HEAD', cache: 'no-cache', signal: AbortSignal.timeout(10000) })
        .then(response => response.ok && /^video\/mp4(?:;|$)/i.test(response.headers.get('content-type') || ''))
        .catch(() => {
          availability.delete(url); // A transient network error must not permanently hide 4K.
          return false;
        });
      availability.set(url, request);
    }
    return availability.get(url);
  }

  // Native players (About and shared embeds) do not have the main player's picker.
  // Offer their real variants without changing the initial playback quality.
  function attach(video, host) {
    if (attached.has(video)) return;
    attached.add(video);
    const picker = document.createElement('span');
    picker.className = 'video-quality-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', document.documentElement.lang === 'en' ? 'Video quality' : 'Качество видео');
    picker.hidden = true;
    host.append(picker);
    let currentKey = '';
    let revision = 0;
    let switchAttempt = 0;
    const source = () => video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
    const selected = () => {
      const quality = new URL(source(), location.href).pathname.match(suffix)?.[1];
      picker.querySelectorAll('button').forEach(button => {
        const active = button.dataset.quality === quality;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };
    async function update() {
      const value = source();
      if (!value) { currentKey = ''; revision++; picker.hidden = true; return; }
      const url = new URL(value, location.href);
      const match = url.pathname.match(suffix);
      if (!match) { currentKey = ''; revision++; picker.hidden = true; return; }
      // Ignore only the quality suffix, retaining asset-version query parameters.
      const family = url.origin + url.pathname.replace(suffix, '') + url.search;
      if (family === currentKey) { selected(); return; }
      currentKey = family;
      const attempt = ++revision;
      picker.hidden = true;
      picker.replaceChildren();
      const variant = quality => {
        const next = new URL(url);
        next.pathname = next.pathname.replace(suffix, `-${quality}.mp4`);
        return next.href;
      };
      if (!await exists(variant('2160')) || attempt !== revision) return;
      const qualities = [...new Set([match[1], '720', '1080', '2160'])].sort((a, b) => Number(a) - Number(b));
      const available = await Promise.all(qualities.map(async quality => ({ quality, url: variant(quality), available: await exists(variant(quality)) })));
      if (attempt !== revision) return;
      for (const item of available.filter(item => item.available)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.quality = item.quality;
        button.dataset.source = item.url;
        button.textContent = item.quality === '2160' ? '4K' : `${item.quality}p`;
        picker.append(button);
      }
      selected();
      picker.hidden = false;
    }
    picker.addEventListener('click', event => {
      const button = event.target.closest('button[data-source]');
      if (!button || button.getAttribute('aria-pressed') === 'true') return;
      event.preventDefault();
      event.stopPropagation();
      const time = video.currentTime;
      const playing = !video.paused;
      const attempt = ++switchAttempt;
      video.pause();
      video.src = button.dataset.source;
      video.addEventListener('loadedmetadata', () => {
        if (attempt !== switchAttempt) return;
        if (Number.isFinite(time) && Number.isFinite(video.duration)) video.currentTime = Math.min(time, Math.max(0, video.duration - 0.2));
        if (playing) video.play().catch(() => {});
      }, { once: true });
      video.load();
      selected();
    });
    new MutationObserver(update).observe(video, { attributes: true, attributeFilter: ['src'], childList: true, subtree: true });
    video.addEventListener('loadstart', update);
    update();
  }

  window.LCBVideoQuality = { exists, attach };
})();
