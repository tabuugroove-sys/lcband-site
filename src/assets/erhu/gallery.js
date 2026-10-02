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
  document.addEventListener('click', event => {
    const link = event.target.closest('.play-item');
    if (!link || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    sceneVideo.pause();
    returnFocus = link;
    dialog.showModal();
    document.body.classList.add('modal-open');
    select(items.findIndex(item => item.slug === link.dataset.slug));
    dialog.querySelector('.close-player').focus();
  });
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
  const advanceBeforeEnd = () => {
    if (!dialog.open || document.hidden || document.querySelector('.video-share-dialog[open]') || video.seeking) return;
    if (video.paused && !video.ended) return;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || duration - video.currentTime > Math.min(3, duration / 2)) return;
    const playlist = cards.map((card, index) => card.hidden ? -1 : index).filter(index => index >= 0);
    if (playlist.length < 2) return;
    select(playlist[(playlist.indexOf(current) + 1) % playlist.length]);
  };
  video.addEventListener('timeupdate', advanceBeforeEnd);
  video.addEventListener('ended', advanceBeforeEnd);
  const track = document.querySelector('.video-grid');
  const carouselControls = document.querySelector('.carousel-controls');
  const carouselDots = document.querySelector('.carousel-dots');
  const carouselPrev = document.querySelector('.carousel-prev');
  const carouselNext = document.querySelector('.carousel-next');
  let slides = [];
  let visibleCards = [];
  let page = 0;
  let settling;
  const center = card => card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2;
  const nearest = () => slides.reduce((best, card, index) => Math.abs(center(card) - track.scrollLeft) < Math.abs(center(slides[best]) - track.scrollLeft) ? index : best, 0);
  const updateCarousel = () => {
    if (!slides.length) return;
    page = nearest() % visibleCards.length;
    [...carouselDots.children].forEach((dot, index) => dot.setAttribute('aria-current', String(index === page)));
    document.querySelector('.carousel-position').textContent = `${page + 1} / ${visibleCards.length}`;
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (track.classList.contains('is-dragging')) return;
      const index = nearest();
      if (index < visibleCards.length || index >= visibleCards.length * 2) {
        track.scrollTo({left: center(slides[visibleCards.length + page]), behavior: 'instant'});
      }
    }, 180);
  };
  const goToPage = index => {
    const actual = nearest();
    let target = actual - (actual % visibleCards.length) + index;
    if (target < 0 || target >= slides.length) {
      track.scrollTo({left: center(slides[visibleCards.length + page]), behavior: 'instant'});
      target = visibleCards.length + index;
    }
    track.scrollTo({left: center(slides[target]), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  };
  const rebuildCarousel = () => {
    track.querySelectorAll('[data-loop-clone]').forEach(card => card.remove());
    visibleCards = cards.filter(card => !card.hidden);
    const clone = card => {
      const copy = card.cloneNode(true);
      copy.dataset.loopClone = 'true';
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelectorAll('a, button').forEach(control => control.tabIndex = -1);
      return copy;
    };
    track.prepend(...visibleCards.map(clone));
    track.append(...visibleCards.map(clone));
    slides = [...track.children].filter(card => !card.hidden);
    carouselDots.replaceChildren(...visibleCards.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Видео ${index + 1}`);
      dot.setAttribute('aria-controls', 'video-carousel');
      dot.addEventListener('click', () => goToPage(index));
      return dot;
    }));
    carouselControls.hidden = visibleCards.length < 2;
    carouselPrev.disabled = carouselNext.disabled = false;
    track.scrollTo({left: center(slides[visibleCards.length]), behavior: 'instant'});
    updateCarousel();
  };
  carouselPrev.addEventListener('click', () => goToPage(page - 1));
  carouselNext.addEventListener('click', () => goToPage(page + 1));
  track.addEventListener('scroll', updateCarousel, {passive: true});
  track.addEventListener('keydown', event => {
    if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    goToPage(event.key === 'Home' ? 0 : event.key === 'End' ? visibleCards.length - 1 : page + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  let dragStart = null;
  let dragMoved = false;
  track.addEventListener('dragstart', event => event.preventDefault());
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    dragStart = {x: event.clientX, left: track.scrollLeft};
    dragMoved = false;
  });
  window.addEventListener('pointermove', event => {
    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    if (Math.abs(dx) > 5) {
      dragMoved = true;
      track.classList.add('is-dragging');
      track.scrollLeft = dragStart.left - dx;
    }
  });
  const endDrag = () => {
    if (!dragStart) return;
    dragStart = null;
    track.classList.remove('is-dragging');
    updateCarousel();
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  track.addEventListener('click', event => {
    if (dragMoved) { event.preventDefault(); event.stopPropagation(); dragMoved = false; }
  }, true);
  new ResizeObserver(rebuildCarousel).observe(track);
  rebuildCarousel();
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    cards.forEach(card => { card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter; });
    document.querySelector('.result-count').textContent = `${cards.filter(card => !card.hidden).length} видео`;
    track.scrollTo({left: 0, behavior: 'instant'});
    rebuildCarousel();
  }));
  const photoViewer = document.querySelector('.photo-viewer');
  const photoLinks = [...document.querySelectorAll('.photo-open')];
  let currentPhoto = 0;
  let photoReturnFocus;
  const selectPhoto = index => {
    currentPhoto = (index + photoLinks.length) % photoLinks.length;
    const link = photoLinks[currentPhoto];
    const full = photoViewer.querySelector('.photo-full');
    full.src = link.href;
    full.alt = link.querySelector('img').alt;
    photoViewer.querySelector('#photo-title').textContent = link.closest('figure').querySelector('h3').textContent;
    photoViewer.querySelector('.photo-count').textContent = `${currentPhoto + 1} / ${photoLinks.length}`;
    photoViewer.querySelector('.photo-download').href = link.href;
  };
  photoLinks.forEach((link, index) => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof photoViewer.showModal !== 'function') return;
    event.preventDefault();
    sceneVideo.pause();
    photoReturnFocus = link;
    selectPhoto(index);
    photoViewer.showModal();
    document.body.classList.add('modal-open');
    photoViewer.querySelector('.close-photo').focus();
  }));
  photoViewer.querySelector('.close-photo').addEventListener('click', () => photoViewer.close());
  photoViewer.querySelector('.photo-previous').addEventListener('click', () => selectPhoto(currentPhoto - 1));
  photoViewer.querySelector('.photo-next').addEventListener('click', () => selectPhoto(currentPhoto + 1));
  photoViewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectPhoto(currentPhoto + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  photoViewer.addEventListener('click', event => {
    if (event.target !== photoViewer) return;
    const bounds = photoViewer.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) photoViewer.close();
  });
  photoViewer.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    photoReturnFocus?.focus({preventScroll:true});
  });
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
