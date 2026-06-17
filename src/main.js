/* Luxury Cover Band — main.js
   Nav, mobile burger, scroll-reveal, lightbox (image + video), hero switcher.
   Video player: 720p/1080p manual picker + auto-downgrade on slow network / stalls.
*/

(() => {
	'use strict';

	// ---------- Locale memory + redirect ----------
	try {
		const path = window.location.pathname;
		const base = (document.querySelector('base')?.getAttribute('href') || '/').replace(/\/+$/, '/');
		const rel = path.startsWith(base) ? path.slice(base.length - 1) : path;
		const match = rel.match(/^\/(br|ae)(\/|$)/);
		if (match) {
			localStorage.setItem('lcb_locale', match[1]);
		} else if (rel === '/' || rel === '') {
			const saved = localStorage.getItem('lcb_locale');
			if (saved === 'br' || saved === 'ae') {
				window.location.replace(base + saved + '/');
				return;
			}
		}
	} catch (e) { /* storage blocked — ignore */ }

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
	let lightboxPrev = null;
	let lightboxNext = null;
	let currentVideoKey = null;
	let currentVideoTitle = '';
	let currentVideoPoster = '';
	let currentQuality = '1080';
	let stallCount = 0;
	let stallTimer = null;
	let playAttemptId = 0;

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

		lightboxPrev = document.createElement('button');
		lightboxPrev.className = 'lightbox__nav lightbox__nav--prev';
		lightboxPrev.type = 'button';
		lightboxPrev.setAttribute('aria-label', 'Предыдущее видео');
		lightboxPrev.innerHTML = '<span aria-hidden="true">‹</span>';
		lightbox.appendChild(lightboxPrev);

		lightboxNext = document.createElement('button');
		lightboxNext.className = 'lightbox__nav lightbox__nav--next';
		lightboxNext.type = 'button';
		lightboxNext.setAttribute('aria-label', 'Следующее видео');
		lightboxNext.innerHTML = '<span aria-hidden="true">›</span>';
		lightbox.appendChild(lightboxNext);

		lightboxPrev.addEventListener('click', (e) => {
			e.stopPropagation();
			openAdjacentVideo(-1);
		});

		lightboxNext.addEventListener('click', (e) => {
			e.stopPropagation();
			openAdjacentVideo(1);
		});

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
			lightbox?.classList.add('is-video-loading');
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

		['canplay', 'playing', 'loadeddata'].forEach(eventName => {
			lightboxVideoEl.addEventListener(eventName, () => {
				lightbox?.classList.remove('is-video-loading');
			});
		});

		lightboxVideoEl.addEventListener('loadstart', () => {
			lightbox?.classList.add('is-video-loading');
		});

		lightboxVideoEl.addEventListener('error', () => {
			if (currentQuality === '1080') {
				currentQuality = '720';
				showToast('1080p недоступно, переключили на 720p');
				swapQuality();
			} else {
				lightbox?.classList.remove('is-video-loading');
				showToast('Видео ещё загружается на хостинг');
			}
		});
	}

	function videoUrl(key, quality) {
		const base = (window.SITE_BASE || "/").replace(/\/?$/, "/");
		return `${base}assets/video/mp4/${key}-${quality}.mp4`;
	}

	function swapQuality() {
		if (!currentVideoKey || !lightboxVideoEl) return;
		const pos = lightboxVideoEl.currentTime || 0;
		const wasPaused = lightboxVideoEl.paused;
		const attempt = ++playAttemptId;
		lightbox?.classList.add('is-video-loading');
		lightboxVideoEl.src = videoUrl(currentVideoKey, currentQuality);
		lightboxVideoEl.addEventListener('loadedmetadata', () => {
			if (attempt !== playAttemptId || !Number.isFinite(pos) || pos <= 0) return;
			lightboxVideoEl.currentTime = Math.min(pos, Math.max(lightboxVideoEl.duration - 0.2, 0));
		}, { once: true });
		if (!wasPaused) lightboxVideoEl.play().catch(() => {
			lightbox?.classList.remove('is-video-loading');
		});
	}

	function getVideoItems() {
		const nodes = [...document.querySelectorAll('.vtile__link[data-video], .video-card[data-video], [data-video].page-hero__play')];
		const seen = new Set();
		return nodes.reduce((items, node) => {
			const key = node.dataset.video;
			if (!key || seen.has(key)) return items;
			seen.add(key);
			const title = node.querySelector('.vtile__title, .video-card__name')?.textContent?.trim() || node.getAttribute('aria-label') || 'Видео';
			const poster = node.querySelector('img')?.src || '';
			items.push({ key, title, poster });
			return items;
		}, []);
	}

	function updateVideoNav() {
		const items = getVideoItems();
		const show = !!currentVideoKey && items.length > 1;
		[lightboxPrev, lightboxNext].forEach(btn => {
			if (!btn) return;
			btn.style.display = show ? 'flex' : 'none';
		});
	}

	function openAdjacentVideo(direction) {
		const items = getVideoItems();
		if (!currentVideoKey || items.length < 2) return;
		const index = items.findIndex(item => item.key === currentVideoKey);
		if (index < 0) return;
		const next = items[(index + direction + items.length) % items.length];
		openVideo(next.key, next.title, next.poster);
	}

	function openVideo(key, title, poster) {
		if (!lightbox) return;
		buildVideoUI();
		currentVideoKey = key;
		currentVideoTitle = title || 'Видео';
		currentVideoPoster = poster || '';
		stallCount = 0;
		currentQuality = '720';
		const attempt = ++playAttemptId;

		// Reset picker to Auto
		lightboxPicker.style.display = '';
		lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.q === 'auto'));

		if (lightboxImg) lightboxImg.style.display = 'none';
		updateVideoNav();
		lightboxVideoEl.style.display = 'block';
		lightboxVideoEl.poster = currentVideoPoster;
		lightboxVideoEl.src = videoUrl(key, currentQuality);
		lightbox.classList.add('is-open');
		lightbox.classList.add('is-video-loading');
		lightbox.setAttribute('aria-hidden', 'false');
		document.body.style.overflow = 'hidden';
		lightboxVideoEl.play().catch(() => {
			if (attempt === playAttemptId) lightbox.classList.remove('is-video-loading');
		});
	}

	function openImage(src, alt) {
		if (!lightbox || !lightboxImg) return;
		if (lightboxVideoEl) lightboxVideoEl.style.display = 'none';
		if (lightboxPicker) lightboxPicker.style.display = 'none';
		if (lightboxPrev) lightboxPrev.style.display = 'none';
		if (lightboxNext) lightboxNext.style.display = 'none';
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
		lightbox.classList.remove('is-video-loading');
		if (lightboxPicker) lightboxPicker.style.display = '';
		if (lightboxPrev) lightboxPrev.style.display = 'none';
		if (lightboxNext) lightboxNext.style.display = 'none';
		currentVideoKey = null;
		currentVideoTitle = '';
		currentVideoPoster = '';
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

	document.querySelectorAll('[data-video-carousel]').forEach(track => {
		const section = track.closest('.program-video-carousel') || document;
		const prev = section.querySelector('[data-video-carousel-prev]');
		const next = section.querySelector('[data-video-carousel-next]');
		const scrollByCard = (dir) => {
			const card = track.querySelector('.video-card');
			const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0') || 0;
			const amount = card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.82;
			track.scrollBy({ left: amount * dir, behavior: 'smooth' });
		};
		prev?.addEventListener('click', () => scrollByCard(-1));
		next?.addEventListener('click', () => scrollByCard(1));
	});

	document.addEventListener('click', (e) => {
		const a = e.target.closest('.vtile__link[data-video]');
			if (!a) return;
			e.preventDefault();
			e.stopPropagation();
			a.blur();
			openVideo(a.dataset.video, a.querySelector('.vtile__title')?.textContent || '', a.querySelector('img')?.src);
		});

	lightboxClose?.addEventListener('click', closeLightbox);
	lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeLightbox();
		if (!lightbox?.classList.contains('is-open') || !currentVideoKey) return;
		if (e.key === 'ArrowLeft') openAdjacentVideo(-1);
		if (e.key === 'ArrowRight') openAdjacentVideo(1);
	});

	// ---------- Hero 4-color switcher + inline video ----------
	const hero = document.querySelector('[data-hero]');
	if (hero) {
		const dots = hero.querySelectorAll('[data-hero-dot]');
		const imgs = hero.querySelectorAll('[data-hero-img]');
		const heroPlay = hero.querySelector('[data-hero-play]');
		const heroClose = hero.querySelector('[data-hero-close]');
		const heroVideo = hero.querySelector('[data-hero-video]');
		const heroQualityBtns = hero.querySelectorAll('[data-hero-q]');
		const heroToggle = hero.querySelector('[data-hero-toggle]');
		const heroProgress = hero.querySelector('[data-hero-progress]');
		const heroProgressFilled = hero.querySelector('[data-hero-progress-filled]');
		const heroTime = hero.querySelector('[data-hero-time]');
		let heroQuality = '1080';

		function fmtTime(sec) {
			if (!isFinite(sec)) return '0:00';
			const m = Math.floor(sec / 60);
			const s = Math.floor(sec % 60);
			return `${m}:${s < 10 ? '0' : ''}${s}`;
		}
		const order = ['red', 'bw', 'gold', 'white'];
		// Costume → matching clip (sourced from LCB promo 2025 reels):
		//   red   = Эгоистка (red suits, red LED)
		//   bw    = LAZ Loca Loca (black-white styling)
		//   gold  = РЕТРО "You're my heart" (gold, glam)
		//   white = Лететь по белому свету (white suits, starfield)
		const heroVideoMap = {
			red:   'promo-egoistka',
			bw:    'promo-loca-loca',
			gold:  'thematic-retro-heart',
			white: 'promo-letet'
		};
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

		function stopAuto() {
			if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
		}

		function playHeroVideo() {
			if (!heroVideo) return;
			const key = heroVideoMap[current] || 'promo-main-reel';
			const slow = navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || ''));
			if (slow && heroQuality === '1080') heroQuality = '720';
			syncQualityButtons();
			const base = (window.SITE_BASE || '/').replace(/\/?$/, '/');
			heroVideo.src = `${base}assets/video/mp4/${key}-${heroQuality}.mp4`;
			stopAuto();
			userInteracted = true;
			hero.classList.add('is-playing');
			const p = heroVideo.play();
			if (p && typeof p.catch === 'function') {
				p.catch(() => {
					heroVideo.muted = true;
					heroVideo.play().catch(() => {});
				});
			}
		}

		function syncQualityButtons() {
			heroQualityBtns.forEach(b => b.classList.toggle('is-active', b.dataset.heroQ === heroQuality));
		}

		function changeQuality(q) {
			if (q === heroQuality) return;
			heroQuality = q;
			syncQualityButtons();
			if (!heroVideo || !hero.classList.contains('is-playing')) return;
			const key = heroVideoMap[current] || 'promo-main-reel';
			const base = (window.SITE_BASE || '/').replace(/\/?$/, '/');
			const wasPlaying = !heroVideo.paused;
			const currentTime = heroVideo.currentTime;
			heroVideo.src = `${base}assets/video/mp4/${key}-${heroQuality}.mp4`;
			heroVideo.currentTime = currentTime;
			if (wasPlaying) heroVideo.play().catch(() => {});
		}

		function stopHeroVideo() {
			if (!heroVideo) return;
			heroVideo.pause();
			heroVideo.removeAttribute('src');
			heroVideo.load();
			heroVideo.muted = false;
			hero.classList.remove('is-playing');
		}

		function togglePlayPause() {
			if (!heroVideo) return;
			if (heroVideo.paused) heroVideo.play().catch(() => {});
			else heroVideo.pause();
		}

		dots.forEach(d => {
			d.addEventListener('click', () => {
				userInteracted = true;
				stopAuto();
				if (hero.classList.contains('is-playing')) stopHeroVideo();
				setActive(d.dataset.heroDot);
			});
		});

		heroPlay?.addEventListener('click', playHeroVideo);
		heroClose?.addEventListener('click', stopHeroVideo);
		heroVideo?.addEventListener('ended', stopHeroVideo);
		heroQualityBtns.forEach(b => {
			b.addEventListener('click', () => changeQuality(b.dataset.heroQ));
		});

		heroToggle?.addEventListener('click', togglePlayPause);
		heroVideo?.addEventListener('play',  () => heroToggle?.classList.remove('is-paused'));
		heroVideo?.addEventListener('pause', () => heroToggle?.classList.add('is-paused'));
		heroVideo?.addEventListener('timeupdate', () => {
			if (!heroVideo.duration) return;
			const pct = (heroVideo.currentTime / heroVideo.duration) * 100;
			if (heroProgressFilled) heroProgressFilled.style.width = pct + '%';
			if (heroTime) heroTime.textContent = `${fmtTime(heroVideo.currentTime)} / ${fmtTime(heroVideo.duration)}`;
		});
		heroProgress?.addEventListener('click', (e) => {
			if (!heroVideo?.duration) return;
			const rect = heroProgress.getBoundingClientRect();
			const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
			heroVideo.currentTime = pct * heroVideo.duration;
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && hero.classList.contains('is-playing')) stopHeroVideo();
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

	// ---------- Video rails: infinite loop scroll ----------
	document.querySelectorAll('.video-rail__track').forEach(track => {
		if (track.dataset.loopReady === '1') return;
		track.dataset.loopReady = '1';
		const originals = Array.from(track.children);
		if (originals.length < 2) return;
		const n = originals.length;
		[...originals].reverse().forEach(item => track.insertBefore(item.cloneNode(true), track.firstChild));
		originals.forEach(item => track.appendChild(item.cloneNode(true)));

		const copies = 3;
		const setWidth = () => track.scrollWidth / copies;

		const isSmallRail = !!track.closest('.video-rail--small');

		const alignOn = (idx) => {
			const el = track.children[idx];
			if (!el) return;
			if (isSmallRail) {
				track.scrollLeft = el.offsetLeft;
				return;
			}
			track.scrollLeft = el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2;
		};

		requestAnimationFrame(() => {
			alignOn(n);
		});

		let rafId = null;
		let jumping = false;
		track.addEventListener('scroll', () => {
			if (jumping || rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				const w = setWidth();
				const left = track.scrollLeft;
				if (left < w * 0.5) {
					jumping = true;
					track.scrollLeft = left + w;
					requestAnimationFrame(() => { jumping = false; });
				} else if (left > w * 2.5) {
					jumping = true;
					track.scrollLeft = left - w;
					requestAnimationFrame(() => { jumping = false; });
				}
			});
		}, { passive: true });

		window.addEventListener('resize', () => requestAnimationFrame(() => {
			alignOn(n);
		}), { passive: true });
	});

})();
