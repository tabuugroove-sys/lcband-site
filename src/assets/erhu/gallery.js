(() => {
  const scene = document.querySelector('.living-scene');
  const sceneVideo = scene.querySelector('video');
  const sceneStart = scene.querySelector('.scene-start');
  const sceneControls = scene.querySelector('.scene-controls');
  const sceneToggle = scene.querySelector('.scene-toggle');
  const sceneSeek = scene.querySelector('.scene-seek');
  const sceneMute = scene.querySelector('.scene-mute');
  const sceneError = scene.querySelector('.scene-error');
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const playScene = async () => {
    sceneError.hidden = true;
    if (!sceneVideo.getAttribute('src')) sceneVideo.src = sceneVideo.dataset.src;
    sceneStart.disabled = true;
    sceneStart.setAttribute('aria-busy', 'true');
    try {
      await sceneVideo.play();
    } catch {
      sceneError.hidden = false;
    } finally {
      sceneStart.disabled = false;
      sceneStart.removeAttribute('aria-busy');
    }
  };
  sceneStart.addEventListener('click', playScene);
  sceneVideo.addEventListener('playing', () => {
    const moveFocus = document.activeElement === sceneStart;
    scene.classList.add('is-playing');
    sceneStart.hidden = true;
    sceneControls.hidden = false;
    sceneToggle.textContent = 'Ⅱ';
    sceneToggle.setAttribute('aria-label', 'Пауза');
    if (moveFocus) sceneToggle.focus({preventScroll: true});
  });
  sceneVideo.addEventListener('pause', () => {
    sceneToggle.textContent = '▶';
    sceneToggle.setAttribute('aria-label', 'Продолжить видео');
  });
  sceneVideo.addEventListener('ended', () => {
    scene.classList.remove('is-playing');
    const moveFocus = sceneControls.contains(document.activeElement);
    sceneControls.hidden = true;
    sceneStart.hidden = false;
    if (moveFocus) sceneStart.focus({preventScroll: true});
  });
  sceneVideo.addEventListener('error', () => { sceneError.hidden = false; });
  sceneToggle.addEventListener('click', () => {
    if (sceneVideo.paused) playScene();
    else sceneVideo.pause();
  });
  sceneVideo.addEventListener('timeupdate', () => {
    scene.querySelector('.scene-time').textContent = clock(sceneVideo.currentTime);
    if (Number.isFinite(sceneVideo.duration)) {
      sceneSeek.value = sceneVideo.currentTime / sceneVideo.duration * 100;
      sceneSeek.setAttribute('aria-valuetext', `${clock(sceneVideo.currentTime)} / ${clock(sceneVideo.duration)}`);
    }
  });
  sceneSeek.addEventListener('input', () => {
    if (Number.isFinite(sceneVideo.duration)) sceneVideo.currentTime = Number(sceneSeek.value) / 100 * sceneVideo.duration;
  });
  sceneMute.addEventListener('click', () => {
    sceneVideo.muted = !sceneVideo.muted;
    sceneMute.setAttribute('aria-pressed', String(sceneVideo.muted));
    sceneMute.setAttribute('aria-label', sceneVideo.muted ? 'Включить звук' : 'Выключить звук');
    sceneMute.textContent = sceneVideo.muted ? '×♪' : '♪';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sceneVideo.pause();
  });
  const dialog = document.querySelector('.player');
  const video = dialog.querySelector('video');
  const cards = [...document.querySelectorAll('.video-card')];
  const items = cards.map(card => ({
    title: card.querySelector('h3').textContent,
    url: card.querySelector('.thumbnail').href,
    poster: card.querySelector('img').src,
    slug: card.querySelector('.thumbnail').dataset.slug,
  }));
  let current = 0;
  let returnFocus;
  let toastTimer;
  const error = dialog.querySelector('.playback-error');
  const select = index => {
    current = (index + items.length) % items.length;
    const item = items[current];
    video.pause();
    video.src = item.url;
    video.poster = item.poster;
    dialog.querySelector('#player-title').textContent = item.title;
    dialog.querySelector('.player-count').textContent = `${current + 1} / ${items.length}`;
    const download = dialog.querySelector('.player-download');
    download.href = item.url;
    download.download = `${item.title.replaceAll('/', '—')}.mp4`;
    error.hidden = true;
    video.load();
    video.play().catch(() => { /* Native controls remain usable when autoplay is blocked. */ });
  };
  document.querySelectorAll('.play-item').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    sceneVideo.pause();
    returnFocus = link;
    dialog.showModal();
    document.body.classList.add('modal-open');
    select(items.findIndex(item => item.slug === link.dataset.slug));
    dialog.querySelector('.close-player').focus();
  }));
  dialog.querySelector('.close-player').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    error.hidden = true;
    document.body.classList.remove('modal-open');
    returnFocus?.focus({preventScroll:true});
  });
  video.addEventListener('error', () => { if (video.getAttribute('src')) error.hidden = false; });
  dialog.querySelector('.previous').addEventListener('click', () => select(current - 1));
  dialog.querySelector('.next').addEventListener('click', () => select(current + 1));
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    cards.forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
    document.querySelector('.result-count').textContent = `${cards.filter(card => !card.hidden).length} видео`;
  }));
  document.querySelector('.share').addEventListener('click', async () => {
    const url = 'https://luxuryband.ru/promo/erhu/';
    const toast = document.querySelector('.toast');
    try {
      await navigator.clipboard.writeText(url);
      toast.textContent = 'Ссылка скопирована';
    } catch {
      toast.textContent = url;
    }
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  });
})();
