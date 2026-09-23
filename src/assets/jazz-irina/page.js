(() => {
  const tracks = [...document.querySelectorAll('.ji-track')];
  const viewer = document.querySelector('.ji-viewer');
  if (!tracks.length || !viewer) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let links = [];
  let current = 0;
  let opener;
  let previousOverflow = '';
  let afterClose = () => {};

  tracks.forEach(track => {
  const collection = track.closest('.ji-collection');
  const originals = [...track.children];
  if (!originals.length) return;
  const rowLinks = originals.map((card, index) => {
    const link = card.querySelector('.ji-media');
    link.dataset.index = index;
    return link;
  });
  const toggle = collection.querySelector('.ji-toggle');
  let paused = reduced.matches;
  let hovered = false;
  let focused = false;
  let visible = true;
  let cycle = 0;
  let position = 0;
  let lastTime = 0;
  let manualUntil = 0;
  let navigation = null;
  let drag = null;
  let suppressClick = false;
  let frameId = 0;

  // Outer copies make both ends continuous; only the original set is tabbable.
  const copy = () => originals.map(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.querySelectorAll('a').forEach(link => link.tabIndex = -1);
    clone.querySelectorAll('img').forEach(img => { img.loading = 'lazy'; img.removeAttribute('fetchpriority'); });
    return clone;
  });
  track.prepend(...copy());
  track.append(...copy());
  const toolbar = collection.querySelector('.ji-toolbar');
  if (toolbar) toolbar.hidden = false;
  const measure = () => {
    const oldCycle = cycle;
    cycle = track.children[originals.length * 2].offsetLeft - originals[0].offsetLeft;
    // Keep the next full cycle reachable even on displays wider than this row.
    while (cycle && track.scrollWidth - track.clientWidth < cycle * 2 + 1) track.append(...copy());
    const phase = oldCycle ? ((track.scrollLeft % oldCycle) + oldCycle) % oldCycle / oldCycle : 0;
    position = cycle * (1 + phase);
    track.scrollLeft = position;
    navigation = null;
  };
  const wrap = () => {
    if (!cycle) return;
    if (position < cycle || position >= cycle * 2) position = cycle + ((position - cycle) % cycle + cycle) % cycle;
  };
  const updateToggle = () => {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Запустить карусель' : 'Остановить карусель');
  };
  updateToggle();
  toggle?.addEventListener('click', () => { paused = !paused; updateToggle(); wake(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; updateToggle(); wake(); });
  function tick(time) {
    frameId = 0;
    const delta = Math.min(time - lastTime || 0, 50);
    lastTime = time;
    if (Math.abs(track.scrollLeft - position) > 1) position = track.scrollLeft;
    if (navigation) {
      const progress = Math.min((time - navigation.start) / 500, 1);
      position = navigation.from + (navigation.to - navigation.from) * (1 - (1 - progress) ** 3);
      if (progress === 1) { navigation = null; wrap(); }
      track.scrollLeft = position;
    } else if (!paused && !hovered && !focused && !drag && !viewer.open && time > manualUntil) {
      position += delta * .027;
      wrap();
      track.scrollLeft = position;
    }
    if (visible && !document.hidden) frameId = requestAnimationFrame(tick);
  }
  function wake() {
    if (!frameId && visible && !document.hidden) { lastTime = performance.now(); frameId = requestAnimationFrame(tick); }
  }
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; wake(); }, {rootMargin:'100px'}).observe(track);
  document.addEventListener('visibilitychange', wake);
  new ResizeObserver(measure).observe(track);
  measure();
  wake();
  track.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hovered = true; });
  track.addEventListener('pointerleave', () => { hovered = false; });
  track.addEventListener('focusin', () => { focused = true; });
  track.addEventListener('focusout', () => { focused = false; });
  track.addEventListener('scroll', () => {
    if (navigation || drag) return;
    if (Math.abs(track.scrollLeft - position) > 1) {
      position = track.scrollLeft;
      wrap();
      if (Math.abs(track.scrollLeft - position) > 1) track.scrollLeft = position;
    }
  }, {passive:true});
  track.addEventListener('wheel', () => { navigation = null; manualUntil = performance.now() + 1600; }, {passive:true});
  track.addEventListener('pointerdown', event => {
    navigation = null;
    manualUntil = performance.now() + 2000;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    suppressClick = false;
    drag = {x:event.clientX, left:track.scrollLeft, moved:false, id:event.pointerId};
  });
  track.addEventListener('pointermove', event => {
    if (!drag) return;
    const distance = event.clientX - drag.x;
    if (Math.abs(distance) > 6 && !drag.moved) {
      drag.moved = true;
      track.setPointerCapture(event.pointerId);
      track.classList.add('is-dragging');
    }
    if (drag.moved) { event.preventDefault(); position = drag.left - distance; track.scrollLeft = position; }
  });
  const endDrag = () => {
    if (!drag) return;
    suppressClick = drag.moved;
    if (track.hasPointerCapture(drag.id)) track.releasePointerCapture(drag.id);
    drag = null;
    track.classList.remove('is-dragging');
    position = track.scrollLeft;
    wrap();
    track.scrollLeft = position;
    manualUntil = performance.now() + 1600;
    setTimeout(() => { suppressClick = false; }, 0);
  };
  window.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('dragstart', event => event.preventDefault());
  const advance = direction => {
    navigation = null;
    position = track.scrollLeft;
    wrap();
    track.scrollLeft = position;
    const cards = [...track.children];
    const target = direction > 0
      ? cards.find(card => card.offsetLeft > position + 8)
      : [...cards].reverse().find(card => card.offsetLeft < position - 8);
    if (!target) return;
    const to = target.offsetLeft;
    if (reduced.matches) { position = to; wrap(); track.scrollLeft = position; }
    else navigation = {from:position, to, start:performance.now()};
    manualUntil = performance.now() + 2000;
    wake();
  };
  collection.querySelector('.ji-prev')?.addEventListener('click', () => advance(-1));
  collection.querySelector('.ji-next')?.addEventListener('click', () => advance(1));
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1); }
  });
  track.addEventListener('click', event => {
    const link = event.target.closest('.ji-media');
    if (!link) return;
    event.preventDefault();
    if (suppressClick) return;
    navigation = null;
    links = rowLinks;
    opener = links[Number(link.dataset.index)];
    afterClose = () => { manualUntil = performance.now() + 1600; };
    previousOverflow = document.body.style.overflow;
    viewer.setAttribute('aria-label', collection.getAttribute('aria-label'));
    viewer.showModal();
    document.body.style.overflow = 'hidden';
    show(Number(link.dataset.index));
  });
  });

  const holder = viewer.querySelector('.ji-viewer-media');
  const stopVideo = () => {
    const video = holder.querySelector('video');
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    holder.replaceChildren();
  };
  const show = index => {
    stopVideo();
    current = (index + links.length) % links.length;
    const link = links[current];
    const video = link.dataset.kind === 'video';
    const media = document.createElement(video ? 'video' : 'img');
    media.src = link.href;
    if (video) { media.controls = true; media.playsInline = true; media.poster = link.querySelector('img').src; media.setAttribute('aria-label', link.dataset.title); }
    else media.alt = link.dataset.title;
    holder.append(media);
    viewer.querySelector('figcaption').textContent = `${current + 1} / ${links.length} · ${link.dataset.title}`;
    const fallback = viewer.querySelector('.ji-fallback');
    fallback.hidden = !video;
    if (video) { fallback.href = link.dataset.youtube; media.play().catch(() => {}); }
  };
  viewer.querySelector('.ji-viewer-close').addEventListener('click', () => viewer.close());
  viewer.querySelector('.ji-viewer-prev').addEventListener('click', () => show(current - 1));
  viewer.querySelector('.ji-viewer-next').addEventListener('click', () => show(current + 1));
  viewer.addEventListener('keydown', event => {
    if (event.target.tagName === 'VIDEO') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1)); }
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => {
    stopVideo();
    document.body.style.overflow = previousOverflow;
    opener?.focus({preventScroll:true});
    afterClose();
  });
})();
