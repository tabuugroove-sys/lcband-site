(() => {
  const videos = [...document.querySelectorAll('.ji-video-card video')];
  videos.forEach(video => video.addEventListener('play', () => videos.forEach(other => { if (other !== video) other.pause(); })));
  const modal = document.querySelector('.ji-lightbox');
  const photos = [...document.querySelectorAll('[data-ji-photo]')];
  if (!modal || !photos.length) return;
  let current = 0;
  let opener;
  const show = index => {
    current = (index + photos.length) % photos.length;
    const image = photos[current].querySelector('img');
    const target = modal.querySelector('img');
    target.src = image.src;
    target.alt = image.alt;
    modal.querySelector('figcaption').textContent = `${current + 1} / ${photos.length} · ${image.alt}`;
  };
  photos.forEach((button,index) => button.addEventListener('click', () => {
    opener = button; show(index); modal.showModal(); document.body.style.overflow = 'hidden';
  }));
  modal.querySelector('.ji-lightbox-close').addEventListener('click', () => modal.close());
  modal.querySelector('.ji-lightbox-prev').addEventListener('click', () => show(current - 1));
  modal.querySelector('.ji-lightbox-next').addEventListener('click', () => show(current + 1));
  modal.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
  });
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  modal.addEventListener('close', () => { document.body.style.overflow = ''; opener?.focus(); });
})();
