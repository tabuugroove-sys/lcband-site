(() => {
  const dialog = document.querySelector('.media-dialog');
  const video = dialog.querySelector('video');
  const photo = dialog.querySelector('.dialog-photo');
  const title = dialog.querySelector('#media-title');
  const direct = dialog.querySelector('.media-direct');
  const error = dialog.querySelector('.media-error');
  let returnFocus;

  document.querySelectorAll('[data-video], [data-photo]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || typeof dialog.showModal !== 'function') return;
      event.preventDefault();
      returnFocus = link;
      const isVideo = link.hasAttribute('data-video');
      title.textContent = link.dataset.title;
      direct.href = link.href;
      error.hidden = true;
      video.hidden = !isVideo;
      photo.hidden = isVideo;
      if (isVideo) {
        video.src = link.href;
        video.setAttribute('aria-label', link.dataset.title);
      } else {
        photo.src = link.href;
        photo.alt = link.querySelector('img')?.alt || link.dataset.title;
      }
      dialog.showModal();
      document.body.classList.add('modal-open');
      if (isVideo) video.play().catch(() => { /* Native controls allow manual play. */ });
    });
  });
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    photo.removeAttribute('src');
    document.body.classList.remove('modal-open');
    returnFocus?.focus({ preventScroll: true });
  });
  video.addEventListener('error', () => { if (dialog.open && !video.hidden) error.hidden = false; });

  const share = document.querySelector('.share');
  const toast = document.querySelector('.toast');
  let toastTimer;
  if (navigator.share || navigator.clipboard) {
    share.hidden = false;
    share.addEventListener('click', async () => {
      try {
        const url = location.href.split('#')[0];
        if (navigator.share) await navigator.share({ title: document.title, url });
        else {
          await navigator.clipboard.writeText(url);
          toast.textContent = 'Ссылка скопирована';
          toast.hidden = false;
          clearTimeout(toastTimer);
          toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        toast.textContent = 'Скопируйте адрес страницы из строки браузера';
        toast.hidden = false;
      }
    });
  }
})();
