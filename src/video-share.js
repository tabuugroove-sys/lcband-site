(() => {
  'use strict';
  const origin = 'https://luxuryband.ru';
  const en = document.documentElement.lang === 'en';
  const label = (ru, english) => en ? english : ru;
  const attached = new WeakSet();
  const observedPlayers = new WeakSet();
  const openedPlayers = new WeakSet();
  const playerHost = video => video.closest('.lightbox, .hero, [data-leo-hero]') || video.parentElement;
  const playerIsOpen = video => {
    const host = playerHost(video);
    if (video.matches('.lightbox__video')) return host.classList.contains('is-open');
    if (video.matches('[data-hero-video], [data-leo-video]')) return host.classList.contains('is-playing');
    return openedPlayers.has(video);
  };
  const validSource = value => {
    try {
      if (!value) return null;
      const candidate = new URL(value, origin);
      const url = candidate.origin === location.origin ? new URL(candidate.pathname + candidate.search, origin) : candidate;
      if (url.origin !== origin || !/^\/assets\/video\/mp4\/[a-zA-Z0-9_-]+\.mp4$/.test(url.pathname)) return null;
      url.searchParams.delete('download');
      if (/\/live-icon-(720|1080)\.mp4$/.test(url.pathname)) url.searchParams.set('v', '20261002cut6');
      return url;
    } catch { return null; }
  };
  const dialog = document.createElement('dialog');
  dialog.className = 'video-share-dialog';
  dialog.setAttribute('aria-labelledby', 'video-share-title');
  dialog.innerHTML = `<form method="dialog"><button class="video-share-close" aria-label="${label('Закрыть', 'Close')}">×</button></form>
    <h2 id="video-share-title">${label('Поделиться видео', 'Share video')}</h2>
    <p class="video-share-name"></p>
    <label>${label('Ссылка на видео', 'Video link')}<input readonly class="video-share-url"></label>
    <div class="video-share-options"><button type="button" data-copy="url">${label('Скопировать ссылку', 'Copy link')}</button><button type="button" data-native>${label('Поделиться…', 'Share…')}</button></div>
    <div class="video-share-social"><a data-social="telegram" target="_blank" rel="noopener">Telegram</a><a data-social="whatsapp" target="_blank" rel="noopener">WhatsApp</a><a data-social="vk" target="_blank" rel="noopener">ВКонтакте</a></div>
    <label>${label('Код для встраивания плеера', 'Player embed code')}<textarea readonly class="video-share-embed" rows="3"></textarea></label>
    <button type="button" data-copy="embed">${label('Скопировать код', 'Copy code')}</button>
    <p class="video-share-help">${label('Если соцсеть не поддерживает вставку плеера, отправьте ссылку или скачайте видео и загрузите его в публикацию.', 'If the platform does not support embedded players, share the link or download the video and upload it to your post.')}</p>
    <a class="video-share-download" download>${label('Скачать видео', 'Download video')} ↓</a><p class="video-share-status" role="status"></p>`;
  document.body.append(dialog);
  let returnFocus;
  let sharedTitle;
  const urlInput = dialog.querySelector('.video-share-url');
  const embedInput = dialog.querySelector('.video-share-embed');
  const status = dialog.querySelector('.video-share-status');
  function show(source, title, button) {
    const url = validSource(source);
    if (!url) return;
    sharedTitle = title || 'Luxury Band';
    returnFocus = button;
    const player = new URL('/embed/', origin);
    player.searchParams.set('src', url.pathname + url.search);
    player.searchParams.set('title', sharedTitle);
    urlInput.value = player.href;
    embedInput.value = `<iframe src="${player.href.replaceAll('&', '&amp;')}" title="Luxury Band video" width="640" height="360" style="max-width:100%;aspect-ratio:16/9;border:0" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    dialog.querySelector('.video-share-name').textContent = sharedTitle;
    const download = new URL('/download.php', origin);
    download.searchParams.set('file', url.pathname.split('/').pop());
    dialog.querySelector('.video-share-download').href = download.href;
    dialog.querySelector('[data-social="telegram"]').href = `https://t.me/share/url?url=${encodeURIComponent(player.href)}&text=${encodeURIComponent(sharedTitle)}`;
    dialog.querySelector('[data-social="whatsapp"]').href = `https://wa.me/?text=${encodeURIComponent(sharedTitle + ' ' + player.href)}`;
    dialog.querySelector('[data-social="vk"]').href = `https://vk.com/share.php?url=${encodeURIComponent(player.href)}&title=${encodeURIComponent(sharedTitle)}`;
    dialog.querySelector('[data-native]').hidden = !navigator.share;
    status.textContent = '';
    dialog.showModal();
  }
  dialog.addEventListener('close', () => returnFocus?.focus({ preventScroll: true }));
  dialog.addEventListener('click', async event => {
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const field = copy.dataset.copy === 'url' ? urlInput : embedInput;
      try {
        await navigator.clipboard.writeText(field.value);
        status.textContent = label('Скопировано', 'Copied');
      } catch {
        field.focus(); field.select();
        status.textContent = label('Скопируйте выделенный текст', 'Copy the selected text');
      }
    }
    if (event.target.closest('[data-native]')) {
      try { await navigator.share({ title: sharedTitle, url: urlInput.value }); }
      catch (error) { if (error.name !== 'AbortError') status.textContent = label('Используйте ссылку ниже', 'Use the link below'); }
    }
  });
  function toolbar(node, getSource, host, overlay = false) {
    if (attached.has(node)) return;
    attached.add(node);
    const bar = document.createElement('div');
    bar.className = 'video-share-actions' + (overlay ? ' video-share-actions--overlay' : '');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label('Поделиться', 'Share') + ' ↗';
    const download = document.createElement('a');
    download.textContent = label('Скачать', 'Download') + ' ↓';
    download.download = '';
    bar.append(button, download);
    host.append(bar);
    const update = () => {
      const source = validSource(getSource());
      bar.hidden = !source || !playerIsOpen(node);
      if (source) {
        const address = new URL('/download.php', origin);
        address.searchParams.set('file', source.pathname.split('/').pop());
        download.href = address.href;
      }
    };
    update();
    if (node.tagName === 'VIDEO') {
      new MutationObserver(update).observe(node, { attributes: true, attributeFilter: ['src'], childList: true });
      new MutationObserver(update).observe(host, { attributes: true, attributeFilter: ['class', 'open'] });
      node.addEventListener('loadstart', update);
      if (!node.matches('.lightbox__video, [data-hero-video], [data-leo-video]')) window.LCBVideoQuality.attach(node, bar);
    }
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      show(getSource(), node.querySelector?.('.vtile__title, .video-card__name')?.textContent?.trim() || node.closest('.video-card')?.querySelector('h3')?.textContent || node.getAttribute('aria-label') || 'Luxury Band', button);
    });
    download.addEventListener('click', event => { event.stopPropagation(); update(); });
  }
  function scan() {
    document.querySelectorAll('video.lightbox__video, video[data-hero-video], video[data-leo-video], video[controls]').forEach(video => {
      if (observedPlayers.has(video)) return;
      observedPlayers.add(video);
      const open = () => {
        openedPlayers.add(video);
        if (!playerIsOpen(video)) return;
        const host = playerHost(video);
        const overlay = host !== video.parentElement || host.matches('.lightbox, .hero');
        toolbar(video, () => video.getAttribute('src') || video.querySelector('source')?.getAttribute('src'), host, overlay);
      };
      video.addEventListener('play', open);
      if (!video.paused) open();
    });
  }
  scan();
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches('video, [data-video], .play-item') || node.querySelector('video, [data-video], .play-item'))))) scan();
  }).observe(document.body, { childList: true, subtree: true });
})();
