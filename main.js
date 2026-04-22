/* Luxury Cover Band — main.js
   Nav, mobile burger, scroll-reveal, lightbox (image + video), hero switcher.
   Video player: 720p/1080p manual picker + auto-downgrade on slow network / stalls.
*/

(() => {
	'use strict';

	// ---------- Sticky nav ----------
	const nav = document.getElementById('nav');
	const onScroll = () => {
		if (window.scrollY > 40) nav.classList.add('is-scrolled');
		else nav.classList.remove('is-scrolled');
	};
	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	// ---------- Mobile burger ----------
	const burger = document.querySelector('.nav__burger');
	if (burger) {
		burger.addEventListener('click', () => {
			const isOpen = nav.classList.toggle('is-open');
			burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
			document.body.style.overflow = isOpen ? 'hidden' : '';
		});
		nav.querySelectorAll('.nav__links a').forEach(a => {
			a.addEventListener('click', () => {
				nav.classList.remove('is-open');
				burger.setAttribute('aria-expanded', 'false');
				document.body.style.overflow = '';
			});
		});
	}

	// ---------- Scroll reveal ----------
	const reveals = document.querySelectorAll('.reveal');
	if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					io.unobserve(entry.target);
				}
			});
		}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
		reveals.forEach(el => io.observe(el));
	} else {
		reveals.forEach(el => el.classList.add('is-visible'));
	}

	// ---------- Toast ----------
	let toastEl = null;
	let toastTimer = null;
	function showToast(msg) {
		if (!toastEl) {
			toastEl = document.createElement('div');
			toastEl.className = 'toast';
			document.body.appendChild(toastEl);
		}
		toastEl.textContent = msg;
		toastEl.classList.add('is-visible');
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 3000);
	}

	// ---------- Lightbox (image + video) ----------
	const lightbox = document.getElementById('lightbox');
	const lightboxImg = lightbox?.querySelector('.lightbox__img');
	const lightboxClose = lightbox?.querySelector('.lightbox__close');
	let lightboxVideoEl = null;
	let lightboxPicker = null;
	let currentVideoKey = null;
	let currentQuality = '1080';
	let stallCount = 0;
	let stallTimer = null;

	function networkSuggestsLow() {
		const c = navigator.connection;
		if (!c) return false;
		if (c.saveData) return true;
		if (c.effectiveType && /2g|3g/.test(c.effectiveType)) return true;
		if (typeof c.downlink === 'number' && c.downlink < 2) return true;
		return false;
	}

	function buildVideoUI() {
		if (lightboxVideoEl) return;

		lightboxVideoEl = document.createElement('video');
		lightboxVideoEl.className = 'lightbox__video';
		lightboxVideoEl.setAttribute('playsinline', '');
		lightboxVideoEl.setAttribute('controls', '');
		lightboxVideoEl.setAttribute('preload', 'metadata');
		lightbox.appendChild(lightboxVideoEl);

		lightboxPicker = document.createElement('div');
		lightboxPicker.className = 'lightbox__picker';
		lightboxPicker.innerHTML = `
			<button data-q="auto" class="is-active">Авто</button>
			<button data-q="720">720p</button>
			<button data-q="1080" class="hd">1080p</button>
		`;
		lightbox.appendChild(lightboxPicker);

		lightboxPicker.addEventListener('click', (e) => {
			const btn = e.target.closest('button');
			if (!btn) return;
			const q = btn.dataset.q;
			lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
			if (q === 'auto') {
				currentQuality = networkSuggestsLow() ? '720' : '1080';
				stallCount = 0;
			} else {
				currentQuality = q;
				stallCount = -999; // lock manual choice, no auto-downgrade
			}
			swapQuality();
		});

		// Stall detection → auto-downgrade
		lightboxVideoEl.addEventListener('waiting', () => {
			if (stallCount < 0) return; // manual mode
			stallCount += 1;
			if (stallTimer) clearTimeout(stallTimer);
			stallTimer = setTimeout(() => { stallCount = 0; }, 30000);
			if (stallCount >= 2 && currentQuality === '1080') {
				currentQuality = '720';
				const btn720 = lightboxPicker.querySelector('[data-q="720"]');
				lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn720));
				showToast('Медленная сеть — переключили на 720p');
				swapQuality();
			}
		});

		lightboxVideoEl.addEventListener('error', () => {
			if (currentQuality === '1080') {
				currentQuality = '720';
				showToast('1080p недоступно, переключили на 720p');
				swapQuality();
			} else {
				closeLightbox();
				showToast('Видео ещё загружается на хостинг');
			}
		});
	}

	function swapQuality() {
		if (!currentVideoKey || !lightboxVideoEl) return;
		const pos = lightboxVideoEl.currentTime || 0;
		const wasPaused = lightboxVideoEl.paused;
		const src = `assets/video/mp4/${currentVideoKey}-${currentQuality}.mp4`;
		lightboxVideoEl.src = src;
		lightboxVideoEl.currentTime = pos;
		if (!wasPaused) lightboxVideoEl.play().catch(() => {});
	}

	function openVideo(key, title, poster) {
		if (!lightbox) return;
		buildVideoUI();
		currentVideoKey = key;
		stallCount = 0;
		currentQuality = networkSuggestsLow() ? '720' : '1080';

		// Reset picker to Auto
		lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.q === 'auto'));

		if (lightboxImg) lightboxImg.style.display = 'none';
		lightboxVideoEl.style.display = 'block';
		lightboxVideoEl.poster = poster || '';
		lightboxVideoEl.src = `assets/video/mp4/${key}-${currentQuality}.mp4`;
		lightbox.classList.add('is-open');
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.style.overflow = 'hidden';
		lightboxVideoEl.play().catch(() => {/* autoplay blocked — user plays manually */});
	}

	function openImage(src, alt) {
		if (!lightbox || !lightboxImg) return;
		if (lightboxVideoEl) lightboxVideoEl.style.display = 'none';
		if (lightboxPicker) lightboxPicker.style.display = 'none';
		lightboxImg.style.display = '';
		lightboxImg.src = src;
		lightboxImg.alt = alt || '';
		lightbox.classList.add('is-open');
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.style.overflow = 'hidden';
	}

	function closeLightbox() {
		if (!lightbox) return;
		lightbox.classList.remove('is-open');
		lightbox.setAttribute('aria-hidden', 'true');
		document.body.style.overflow = '';
		if (lightboxImg) lightboxImg.src = '';
		if (lightboxVideoEl) {
			lightboxVideoEl.pause();
			lightboxVideoEl.removeAttribute('src');
			lightboxVideoEl.load();
		}
		if (lightboxPicker) lightboxPicker.style.display = '';
		currentVideoKey = null;
		stallCount = 0;
	}

	document.querySelectorAll('[data-lightbox]').forEach(a => {
		a.addEventListener('click', (e) => {
			e.preventDefault();
			const img = a.querySelector('img');
			openImage(a.getAttribute('href'), img?.alt || '');
		});
	});

	document.querySelectorAll('.video-card').forEach(card => {
		card.addEventListener('click', (e) => {
			e.preventDefault();
			const key = card.dataset.video;
			const name = card.querySelector('.video-card__name')?.textContent || 'Видео';
			const poster = card.querySelector('img')?.src;
			openVideo(key, name, poster);
		});
	});

	lightboxClose?.addEventListener('click', closeLightbox);
	lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

	// ---------- Hero 4-color switcher ----------
	const hero = document.querySelector('[data-hero]');
	if (hero) {
		const dots = hero.querySelectorAll('[data-hero-dot]');
		const imgs = hero.querySelectorAll('[data-hero-img]');
		const taglines = hero.querySelectorAll('[data-tagline]');
		const order = ['red', 'bw', 'gold', 'white'];
		let current = 'red';
		let autoTimer = null;
		let userInteracted = false;

		function setActive(key) {
			current = key;
			dots.forEach(d => {
				const on = d.dataset.heroDot === key;
				d.classList.toggle('is-active', on);
				d.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			imgs.forEach(i => i.classList.toggle('is-active', i.dataset.heroImg === key));
			taglines.forEach(t => t.classList.toggle('is-active', t.dataset.tagline === key));
		}

		function nextKey() {
			const idx = order.indexOf(current);
			return order[(idx + 1) % order.length];
		}

		function startAuto() {
			if (userInteracted) return;
			if (autoTimer) clearInterval(autoTimer);
			autoTimer = setInterval(() => setActive(nextKey()), 5500);
		}

		dots.forEach(d => {
			d.addEventListener('click', () => {
				userInteracted = true;
				if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
				setActive(d.dataset.heroDot);
			});
		});

		if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			startAuto();
		}
	}

	// ---------- Smooth anchor scroll ----------
	document.querySelectorAll('a[href^="#"]').forEach(a => {
		a.addEventListener('click', (e) => {
			const href = a.getAttribute('href');
			if (href.length < 2) return;
			const target = document.querySelector(href);
			if (target) {
				e.preventDefault();
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		});
	});

})();
