/* Luxury Cover Band — main.js
   Nav, mobile burger, scroll-reveal, lightbox (image + video), hero switcher.
   Video player: 720p/1080p/4K manual picker + auto-downgrade on slow network / stalls.
*/

(() => {
	'use strict';

	// ---------- Locale memory + redirect ----------
	try {
		const path = window.location.pathname;
		const base = (document.querySelector('base')?.getAttribute('href') || '/').replace(/\/+$/, '/');
		const rel = path.startsWith(base) ? path.slice(base.length - 1) : path;
		const match = rel.match(/^\/(br|ae|en)(\/|$)/);
		if (match) {
			localStorage.setItem('lcb_locale', match[1]);
		} else if (rel === '/' || rel === '') {
			const saved = localStorage.getItem('lcb_locale');
			if (saved === 'br' || saved === 'ae' || saved === 'en') {
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
		const submenuToggles = nav.querySelectorAll('.nav__submenu-toggle');
		const closeSubmenus = () => {
			submenuToggles.forEach(toggle => {
				toggle.setAttribute('aria-expanded', 'false');
				toggle.closest('.nav__item--has-dropdown')?.classList.remove('is-submenu-open');
			});
		};
		const closeMobileNav = () => {
			nav.classList.remove('is-open');
			burger.setAttribute('aria-expanded', 'false');
			document.body.style.overflow = '';
			closeSubmenus();
		};
		burger.addEventListener('click', () => {
			const isOpen = nav.classList.toggle('is-open');
			burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
			document.body.style.overflow = isOpen ? 'hidden' : '';
			if (!isOpen) closeSubmenus();
		});
		submenuToggles.forEach(toggle => {
			toggle.addEventListener('click', () => {
				const item = toggle.closest('.nav__item--has-dropdown');
				const willOpen = !item?.classList.contains('is-submenu-open');
				closeSubmenus();
				if (willOpen && item) {
					item.classList.add('is-submenu-open');
					toggle.setAttribute('aria-expanded', 'true');
				}
			});
		});
		nav.querySelectorAll('.nav__links a').forEach(a => {
			a.addEventListener('click', closeMobileNav);
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && nav.classList.contains('is-open')) closeMobileNav();
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

	// ---------- Program tabs scrollspy (/programs/) ----------
	const programTabs = document.querySelectorAll('.program-tabs__link');
	if (programTabs.length && 'IntersectionObserver' in window) {
		const tabsBySlug = new Map();
		programTabs.forEach(tab => tabsBySlug.set(tab.dataset.programTab, tab));
		const sections = [...tabsBySlug.keys()]
			.map(slug => document.getElementById('program-' + slug))
			.filter(Boolean);
		const spy = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (!entry.isIntersecting) return;
				const slug = entry.target.id.replace(/^program-/, '');
				programTabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.programTab === slug));
			});
		}, { rootMargin: '-45% 0px -50% 0px' });
		sections.forEach(el => spy.observe(el));
	}

	// ---------- Story rooms: pinned screen + scroll-scrubbed wipes (/about/) ----------
	// Механика как section-rooms на apple.com/apple-tv-4k/: слои экрана —
	// translateY-шторка снизу вверх, прогресс = f(позиция скролла), без
	// таймеров; реверс скролла = реверс шторки. Без JS / reduced-motion
	// секция остаётся статичной (постер + текст в каждой полосе).
	const storyRooms = document.querySelector('[data-story-rooms]');
	if (storyRooms && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		storyRooms.classList.add('is-enhanced');
		const rooms = Array.from(storyRooms.querySelectorAll('[data-room]'));
		const layers = Array.from(storyRooms.querySelectorAll('[data-story-layer]'));
		const videos = layers.map(l => l.querySelector('video'));
		let roomTops = [];
		let vh = window.innerHeight;
		let ticking = false;
		let activeIndex = -1;

		const measure = () => {
			vh = window.innerHeight;
			const y = window.scrollY;
			roomTops = rooms.map(r => r.getBoundingClientRect().top + y);
		};

		const render = () => {
			ticking = false;
			const y = window.scrollY;
			// wipe привязан к геометрии экрана: старт — верх полосы достиг НИЖНЕЙ
			// границы плеера, финиш — верх полосы дошёл до ВЕРХНЕЙ границы.
			// Меряем ВНУТРЕННЕЕ поле видео (слой, без безеля) — тогда край
			// шторки внутри экрана стоит ровно в уровень с краем полосы снаружи.
			const frameRect = layers[0].getBoundingClientRect();
			// прогресс каждого перехода: старт — верх полосы достиг НИЖНЕЙ границы
			// плеера, финиш — верх полосы дошёл до ВЕРХНЕЙ (меряем ВНУТРЕННЕЕ поле
			// видео, без безеля — шов в экране ровно в уровень с краем полосы)
			const progress = layers.map((layer, i) =>
				i === 0 || !roomTops[i]
					? 0
					: Math.min(1, Math.max(0, (frameRect.bottom - (roomTops[i] - y)) / frameRect.height)));
			// наезд: входящий слой выезжает снизу поверх неподвижного предыдущего;
			// шов в экране ровно в уровень с краем полосы снаружи
			layers.forEach((layer, i) => {
				if (i === 0) return;
				layer.style.transform = 'translateY(' + ((1 - progress[i]) * 100) + '%)';
			});
			// видео играет СРАЗУ, как только слой начал появляться (progress > 0),
			// и ставится на паузу, когда его полностью перекрыл следующий слой.
			// Вне секции на паузе всё.
			const firstTop = roomTops[0] - y;
			const lastBottom = roomTops[rooms.length - 1] - y + rooms[rooms.length - 1].offsetHeight;
			const inSection = firstTop < vh && lastBottom > 0;
			const playing = [];
			if (inSection) {
				layers.forEach((layer, i) => {
					const shown = i === 0 || progress[i] > 0;
					const covered = i < layers.length - 1 && progress[i + 1] >= 1;
					if (shown && !covered) playing.push(i);
				});
			}
			const playKey = playing.join(',');
			if (playKey !== activeIndex) {
				activeIndex = playKey;
				videos.forEach((v, i) => {
					if (!v) return;
					if (playing.indexOf(i) !== -1) { v.play && v.play().catch(() => {}); }
					else if (v.pause) { v.pause(); }
				});
			}
		};

		const onScroll = () => {
			if (!ticking) { ticking = true; requestAnimationFrame(render); }
		};
		const onResize = () => { measure(); render(); };

		measure();
		render();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize, { passive: true });
		// после догрузки шрифтов/картинок выше по странице — перемерить
		window.addEventListener('load', onResize);
	}

	// ---------- Photo wall: scroll-linked rows (/about/) ----------
	// Ряды статичны сами по себе и двигаются ТОЛЬКО от скролла: прогресс
	// прохождения стены через вьюпорт (0..1) → небольшой translateX.
	// Скорость по модулю равная у всех рядов, средний ряд — в противофазе.
	const photoWall = document.querySelector('.photo-wall');
	if (photoWall && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		const wallRows = [
			photoWall.querySelector('.photo-wall__row--a'),
			photoWall.querySelector('.photo-wall__row--b'),
			photoWall.querySelector('.photo-wall__row--c')
		].filter(Boolean);
		let wallTop = 0;
		let wallH = 0;
		let wallShift = 0;
		let wallVh = window.innerHeight;
		let wallTicking = false;

		const measureWall = () => {
			wallVh = window.innerHeight;
			const r = photoWall.getBoundingClientRect();
			wallTop = r.top + window.scrollY;
			wallH = r.height;
			// небольшое смещение: ≤40% ширины вьюпорта, с запасом по длине ряда
			const maxRow = Math.max.apply(null, wallRows.map(row => row.scrollWidth));
			wallShift = Math.min(window.innerWidth * 0.4, maxRow / 4);
		};

		const renderWall = () => {
			wallTicking = false;
			const p = Math.min(1, Math.max(0,
				(wallVh - (wallTop - window.scrollY)) / (wallVh + wallH)));
			wallRows.forEach((row, i) => {
				const mid = i === 1;
				const dir = mid ? 1 : -1;
				const base = mid ? -wallShift : 0;
				row.style.transform = 'translateX(' + (base + dir * p * wallShift) + 'px)';
			});
		};

		const onWallScroll = () => {
			if (!wallTicking) { wallTicking = true; requestAnimationFrame(renderWall); }
		};
		const onWallResize = () => { measureWall(); renderWall(); };

		measureWall();
		renderWall();
		window.addEventListener('scroll', onWallScroll, { passive: true });
		window.addEventListener('resize', onWallResize, { passive: true });
		window.addEventListener('load', onWallResize);
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
	let currentVideoRail = null; // carousel the open video belongs to — arrows stay within it
	let currentQuality = '1080';
	let stallCount = 0;
	let stallTimer = null;
	let playAttemptId = 0;
	const qualityAvailability = new Map();

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
			<button data-q="2160" class="hd" hidden>4K</button>
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
			if (stallCount >= 2 && (currentQuality === '1080' || currentQuality === '2160')) {
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
			if (currentQuality === '2160') {
				currentQuality = '1080';
				showToast('4K недоступно, переключили на 1080p');
				swapQuality();
			} else if (currentQuality === '1080') {
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

	function setPickerQuality(quality) {
		if (!lightboxPicker) return;
		lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.q === quality));
	}

	function videoQualityExists(key, quality) {
		const cacheKey = `${key}-${quality}`;
		if (qualityAvailability.has(cacheKey)) return qualityAvailability.get(cacheKey);
		const request = fetch(videoUrl(key, quality), { method: 'HEAD', cache: 'force-cache' })
			.then(res => res.ok)
			.catch(() => false);
		qualityAvailability.set(cacheKey, request);
		return request;
	}

	function updatePickerAvailability(key) {
		const btn4k = lightboxPicker?.querySelector('[data-q="2160"]');
		if (!btn4k) return;
		btn4k.hidden = true;
		videoQualityExists(key, '2160').then(exists => {
			if (currentVideoKey !== key) return;
			btn4k.hidden = !exists;
			if (!exists && currentQuality === '2160') {
				currentQuality = '1080';
				setPickerQuality(currentQuality);
				swapQuality();
			}
		});
	}

	function swapQuality() {
		if (!currentVideoKey || !lightboxVideoEl) return;
		const pos = lightboxVideoEl.currentTime || 0;
		const wasPaused = lightboxVideoEl.paused;
		const attempt = ++playAttemptId;
		lightbox?.classList.add('is-video-loading');
		lightboxVideoEl.pause();
		lightboxVideoEl.removeAttribute('src');
		lightboxVideoEl.load();
		lightboxVideoEl.src = videoUrl(currentVideoKey, currentQuality);
		lightboxVideoEl.load();
		lightboxVideoEl.addEventListener('loadedmetadata', () => {
			if (attempt !== playAttemptId || !Number.isFinite(pos) || pos <= 0) return;
			lightboxVideoEl.currentTime = Math.min(pos, Math.max(lightboxVideoEl.duration - 0.2, 0));
		}, { once: true });
		if (!wasPaused) lightboxVideoEl.play().catch(() => {
			lightbox?.classList.remove('is-video-loading');
		});
	}

	function getVideoItems() {
		const scope = currentVideoRail || document; // keep arrow-nav within the same carousel
		const nodes = [...scope.querySelectorAll('.vtile__link[data-video], .video-card[data-video], [data-video].page-hero__play')];
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
		setPickerQuality('auto');
		updatePickerAvailability(key);

		if (lightboxImg) lightboxImg.style.display = 'none';
		updateVideoNav();
		lightboxVideoEl.style.display = 'block';
		lightboxVideoEl.poster = currentVideoPoster;
		lightboxVideoEl.pause();
		lightboxVideoEl.removeAttribute('src');
		lightboxVideoEl.load();
		lightboxVideoEl.src = videoUrl(key, currentQuality);
		lightboxVideoEl.load();
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
		currentVideoRail = null;
		stallCount = 0;
	}

	document.querySelectorAll('[data-lightbox]').forEach(a => {
		a.addEventListener('click', (e) => {
			e.preventDefault();
			const img = a.querySelector('img');
			openImage(a.getAttribute('href'), img?.alt || '');
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
		const a = e.target.closest('.vtile__link[data-video], .video-card[data-video], [data-video].page-hero__play');
			if (!a) return;
			e.preventDefault();
			e.stopPropagation();
			a.blur();
			const title = a.querySelector('.vtile__title, .video-card__name')?.textContent?.trim() || a.getAttribute('aria-label') || 'Видео';
			const poster = a.querySelector('img')?.src || a.closest('.page-hero')?.querySelector('.page-hero__media img')?.src || '';
			currentVideoRail = a.closest('.video-rail, [data-video-carousel], .program-video-carousel') || null;
			openVideo(a.dataset.video, title, poster);
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
		const taglines = hero.querySelectorAll('[data-tagline]');
		const heroStage = hero.querySelector('.hero__stage');
		const heroPlay = hero.querySelector('[data-hero-play]');
		const heroClose = hero.querySelector('[data-hero-close]');
		const heroVideo = hero.querySelector('[data-hero-video]');
		const heroQualityBtns = hero.querySelectorAll('[data-hero-q]');
		const heroToggle = hero.querySelector('[data-hero-toggle]');
		const heroProgress = hero.querySelector('[data-hero-progress]');
		const heroProgressFilled = hero.querySelector('[data-hero-progress-filled]');
		const heroTime = hero.querySelector('[data-hero-time]');
		const heroRecommendations = hero.querySelector('[data-hero-recommendations]');
		const heroRecommendationButtons = hero.querySelectorAll('[data-hero-recommendation]');
		const desktopHeroRecommendations = window.matchMedia('(min-width: 735px)');
		const reducedHeroMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const coarseHeroPointer = window.matchMedia('(pointer: coarse)');
		let heroQuality = (coarseHeroPointer.matches || window.matchMedia('(max-width: 734px)').matches) ? '720' : '1080';
		let heroQualityKey = '';
		let currentHeroVideoKey = '';
		let heroSourceAttemptId = 0;

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
		const heroPromoPlaylist = [...document.querySelectorAll('.video-rail--big .vtile__link[data-video]')]
			.map(link => link.dataset.video)
			.filter((key, index, list) => key && list.indexOf(key) === index);
		const heroClips = {
			'promo-egoistka': {
				title: 'Эгоистка', costume: 'red', costumeLabel: 'Красный образ',
				poster: 'promo-egoistka-2026-red-stage.jpg?v=20260620i'
			},
			'promo-lets-get-it-started': {
				title: "Let's Get It Started", costume: 'red', costumeLabel: 'Красный образ',
				poster: 'promo-lets-get-it-started.jpg?v=20260620i'
			},
			'thematic-retro-heart': {
				title: "You're My Heart", costume: 'gold', costumeLabel: 'Золотой образ',
				poster: 'thematic-retro-heart-2026.jpg?v=20260620i'
			},
			'promo-cold-heart': {
				title: 'Cold Heart', costume: 'gold', costumeLabel: 'Золотой образ',
				poster: 'promo-cold-heart.jpg?v=20260620i'
			},
			'promo-amore-no': {
				title: 'Amore No', costume: 'gold', costumeLabel: 'Золотой образ',
				poster: 'promo-amore-no.jpg?v=20260620i'
			},
			'promo-letet': {
				title: 'Лететь', costume: 'white', costumeLabel: 'Белый образ',
				poster: 'promo-letet.jpg?v=20260620i'
			},
			'thematic-italian': {
				title: 'Cosa sei', costume: 'white', costumeLabel: 'Белый образ',
				poster: 'thematic-italian.jpg?v=20260620i'
			},
			'interact-wedding-shallow': {
				title: 'Shallow', costume: 'white', costumeLabel: 'Белый образ',
				poster: 'interact-wedding-shallow.jpg?v=20260620i'
			},
			'promo-loca-loca': {
				title: 'Loca Loca', costume: 'bw', costumeLabel: 'Чёрно-белый образ',
				poster: 'promo-loca-loca.jpg?v=20260620i'
			},
			'promo-danza-cuduro': {
				title: 'Danza Cuduro', costume: 'bw', costumeLabel: 'Чёрно-белый образ',
				poster: 'promo-danza-cuduro-2026.jpg?v=20260620i'
			}
		};
		const heroCostumeClips = {
			red: ['promo-egoistka', 'promo-lets-get-it-started'],
			gold: ['thematic-retro-heart', 'promo-cold-heart', 'promo-amore-no'],
			white: ['promo-letet', 'thematic-italian', 'interact-wedding-shallow'],
			bw: ['promo-loca-loca', 'promo-danza-cuduro']
		};
		const heroNextCostumes = {
			red: ['gold', 'white'],
			gold: ['white', 'bw'],
			white: ['bw', 'red'],
			bw: ['red', 'gold']
		};
		const watchedHeroClips = new Set();
		let current = 'red';
		let autoTimer = null;
		let autoResumeTimer = null;
		let heroOrientationTimer = null;

		function isMobileHeroViewport() {
			return coarseHeroPointer.matches || Math.min(window.innerWidth, window.innerHeight) <= 734;
		}

		function heroFullscreenElement() {
			return document.fullscreenElement || document.webkitFullscreenElement || null;
		}

		function requestHeroFullscreen() {
			if (!heroVideo || !hero.classList.contains('is-playing') || !isMobileHeroViewport()) return;
			if (heroFullscreenElement() || heroVideo.webkitDisplayingFullscreen) return;
			const fallbackToNativeVideo = () => {
				if (typeof heroVideo.webkitEnterFullscreen !== 'function') return;
				try { heroVideo.webkitEnterFullscreen(); } catch (_) {}
			};
			try {
				if (typeof hero.requestFullscreen === 'function') {
					const promise = hero.requestFullscreen({ navigationUI: 'hide' });
					if (promise?.catch) promise.catch(fallbackToNativeVideo);
					return;
				}
				if (typeof hero.webkitRequestFullscreen === 'function') {
					hero.webkitRequestFullscreen();
					return;
				}
			} catch (_) {}
			fallbackToNativeVideo();
		}

		function exitHeroFullscreen() {
			const fullscreenElement = heroFullscreenElement();
			if (fullscreenElement && (fullscreenElement === hero || hero.contains(fullscreenElement))) {
				const exit = document.exitFullscreen || document.webkitExitFullscreen;
				if (typeof exit === 'function') {
					try {
						const promise = exit.call(document);
						if (promise?.catch) promise.catch(() => {});
					} catch (_) {}
				}
			} else if (heroVideo?.webkitDisplayingFullscreen && typeof heroVideo.webkitExitFullscreen === 'function') {
				try { heroVideo.webkitExitFullscreen(); } catch (_) {}
			}
		}

		function syncHeroFullscreenAfterRotate() {
			if (heroOrientationTimer) clearTimeout(heroOrientationTimer);
			heroOrientationTimer = setTimeout(() => {
				if (!hero.classList.contains('is-playing')) return;
				if (window.matchMedia('(orientation: landscape)').matches) requestHeroFullscreen();
			}, 180);
		}

		function preloadHeroClip(key = heroVideoMap[current]) {
			if (!heroVideo || !key || hero.classList.contains('is-playing')) return;
			if (navigator.connection?.saveData) return;
			const source = videoUrl(key, heroQuality);
			if (heroVideo.getAttribute('src') === source) return;
			heroVideo.preload = 'metadata';
			heroVideo.src = source;
			heroVideo.load();
		}

		function setActive(key) {
			current = key;
			dots.forEach(d => {
				const on = d.dataset.heroDot === key;
				d.classList.toggle('is-active', on);
				d.setAttribute('aria-selected', on ? 'true' : 'false');
			});
			imgs.forEach(i => i.classList.toggle('is-active', i.dataset.heroImg === key));
			taglines.forEach(line => line.classList.toggle('is-active', line.dataset.tagline === key));
			preloadHeroClip(heroVideoMap[key]);
		}

		function nextKey() {
			const idx = order.indexOf(current);
			return order[(idx + 1) % order.length];
		}

		function startAuto() {
			if (reducedHeroMotion.matches || hero.classList.contains('is-playing')) return;
			if (autoTimer) clearInterval(autoTimer);
			autoTimer = setInterval(() => setActive(nextKey()), 5500);
		}

		function stopAuto() {
			if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
		}

		function scheduleAutoResume() {
			if (autoResumeTimer) clearTimeout(autoResumeTimer);
			if (reducedHeroMotion.matches) return;
			autoResumeTimer = setTimeout(startAuto, 7000);
		}

		function setHeroLoading(loading) {
			hero.classList.toggle('is-video-loading', loading);
			hero.setAttribute('aria-busy', loading ? 'true' : 'false');
		}

		function requestHeroPlayback(attempt) {
			const playPromise = heroVideo?.play();
			if (!playPromise || typeof playPromise.catch !== 'function') return;
			playPromise.catch(() => {
				if (attempt !== heroSourceAttemptId || !heroVideo) return;
				heroVideo.muted = true;
				heroVideo.play().then(() => {
					showToast('Видео запущено без звука — коснитесь видео, чтобы включить звук');
				}).catch(() => {
					setHeroLoading(false);
					showToast('Не удалось запустить видео. Нажмите ещё раз.');
				});
			});
		}

		function loadHeroSource(key, quality, restoreTime = 0, autoplay = true) {
			if (!heroVideo) return;
			const attempt = ++heroSourceAttemptId;
			const source = videoUrl(key, quality);
			const sourceIsReady = heroVideo.getAttribute('src') === source;
			setHeroLoading(true);
			heroVideo.pause();
			heroVideo.preload = 'auto';
			if (restoreTime > 0) {
				const restorePlaybackTime = () => {
					if (attempt !== heroSourceAttemptId || !Number.isFinite(heroVideo.duration)) return;
					heroVideo.currentTime = Math.min(restoreTime, Math.max(heroVideo.duration - 0.2, 0));
				};
				if (heroVideo.readyState >= 1) restorePlaybackTime();
				else heroVideo.addEventListener('loadedmetadata', restorePlaybackTime, { once: true });
			}
			if (!sourceIsReady) {
				if (heroVideo.getAttribute('src')) {
					heroVideo.removeAttribute('src');
					heroVideo.load();
				}
				heroVideo.src = source;
				heroVideo.load();
			}
			if (autoplay) requestHeroPlayback(attempt);
		}

		function hideHeroRecommendations() {
			hero.classList.remove('is-ended');
			heroRecommendations?.setAttribute('aria-hidden', 'true');
		}

		function nextUnwatchedClip(costume, afterKey = '') {
			const clips = heroCostumeClips[costume] || [];
			if (!clips.length) return '';
			const start = Math.max(clips.indexOf(afterKey), 0);
			const rotated = clips.slice(start + 1).concat(clips.slice(0, start + 1));
			return rotated.find(key => key !== afterKey && !watchedHeroClips.has(key)) || '';
		}

		function firstClipForCostume(costume) {
			const clips = heroCostumeClips[costume] || [];
			return clips.find(key => !watchedHeroClips.has(key)) || clips[0] || '';
		}

		function getHeroRecommendations(key) {
			const clip = heroClips[key];
			if (!clip) return [];
			const group = heroCostumeClips[clip.costume] || [];
			const groupComplete = group.every(groupKey => watchedHeroClips.has(groupKey));
			const nextCostumes = heroNextCostumes[clip.costume] || [];
			const choices = [];
			if (!groupComplete) choices.push(nextUnwatchedClip(clip.costume, key));
			nextCostumes.forEach(costume => choices.push(firstClipForCostume(costume)));
			const fallback = Object.keys(heroClips).filter(candidate => !watchedHeroClips.has(candidate));
			return [...choices, ...fallback]
				.filter((candidate, index, list) => candidate && candidate !== key && list.indexOf(candidate) === index)
				.slice(0, 2);
		}

		function showHeroRecommendations() {
			if (!heroRecommendations || !desktopHeroRecommendations.matches || !currentHeroVideoKey) {
				stopHeroVideo();
				return;
			}
			watchedHeroClips.add(currentHeroVideoKey);
			const recommendations = getHeroRecommendations(currentHeroVideoKey);
			const base = (window.SITE_BASE || '/').replace(/\/?$/, '/');
			heroRecommendationButtons.forEach((button, index) => {
				const key = recommendations[index];
				const clip = heroClips[key];
				button.hidden = !clip;
				if (!clip) return;
				button.dataset.heroVideoKey = key;
				button.setAttribute('aria-label', `Смотреть ${clip.title}. ${clip.costumeLabel}`);
				const poster = button.querySelector('[data-hero-rec-poster]');
				const costume = button.querySelector('[data-hero-rec-costume]');
				const title = button.querySelector('[data-hero-rec-title]');
				if (poster) poster.src = `${base}assets/video/posters/${clip.poster}`;
				if (costume) costume.textContent = clip.costumeLabel;
				if (title) title.textContent = clip.title;
			});
			heroRecommendations.setAttribute('aria-hidden', 'false');
			hero.classList.add('is-ended');
		}

		function playNextHeroPromo() {
			if (!currentHeroVideoKey || !hero.classList.contains('is-playing')) return;
			watchedHeroClips.add(currentHeroVideoKey);
			const playlist = heroPromoPlaylist.length ? heroPromoPlaylist : Object.keys(heroClips);
			if (!playlist.length) {
				stopHeroVideo();
				return;
			}
			const currentIndex = playlist.indexOf(currentHeroVideoKey);
			const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % playlist.length;
			playHeroClip(playlist[nextIndex]);
		}

		function playHeroClip(key) {
			if (!heroVideo) return;
			const clip = heroClips[key];
			if (clip) setActive(clip.costume);
			currentHeroVideoKey = key;
			heroQualityKey = key;
			const slow = navigator.connection && (navigator.connection.saveData || /2g|3g/.test(navigator.connection.effectiveType || ''));
			if (slow && heroQuality === '1080') heroQuality = '720';
			syncQualityButtons();
			updateHeroQualityAvailability(key);
			stopAuto();
			if (autoResumeTimer) clearTimeout(autoResumeTimer);
			hideHeroRecommendations();
			hero.classList.add('is-playing');
			document.body.classList.add('hero-video-open');
			heroVideo.muted = false;
			loadHeroSource(key, heroQuality, 0, true);
			requestHeroFullscreen();
		}

		function playHeroVideo() {
			playHeroClip(heroVideoMap[current] || 'promo-main-reel');
		}

		function syncQualityButtons() {
			heroQualityBtns.forEach(b => b.classList.toggle('is-active', b.dataset.heroQ === heroQuality));
		}

		function updateHeroQualityAvailability(key) {
			const btn4k = hero.querySelector('[data-hero-q="2160"]');
			if (!btn4k) return;
			btn4k.hidden = true;
			videoQualityExists(key, '2160').then(exists => {
				if (heroQualityKey !== key) return;
				btn4k.hidden = !exists;
				if (!exists && heroQuality === '2160') changeQuality('1080');
			});
		}

		function changeQuality(q) {
			if (q === heroQuality) return;
			heroQuality = q;
			syncQualityButtons();
			if (!heroVideo || !hero.classList.contains('is-playing')) return;
			const key = currentHeroVideoKey || heroVideoMap[current] || 'promo-main-reel';
			const wasPlaying = !heroVideo.paused;
			const currentTime = heroVideo.currentTime;
			loadHeroSource(key, heroQuality, currentTime, wasPlaying);
		}

		function stopHeroVideo() {
			if (!heroVideo) return;
			hideHeroRecommendations();
			exitHeroFullscreen();
			hero.classList.remove('is-playing', 'is-ended');
			document.body.classList.remove('hero-video-open');
			heroVideo.pause();
			heroSourceAttemptId += 1;
			heroVideo.removeAttribute('src');
			heroVideo.load();
			heroVideo.muted = false;
			currentHeroVideoKey = '';
			heroQualityKey = '';
			if (heroProgressFilled) heroProgressFilled.style.width = '0%';
			if (heroTime) heroTime.textContent = '0:00 / 0:00';
			setHeroLoading(false);
			preloadHeroClip(heroVideoMap[current]);
			scheduleAutoResume();
		}

		function togglePlayPause() {
			if (!heroVideo) return;
			if (heroVideo.paused) {
				heroVideo.muted = false;
				heroVideo.play().catch(() => {});
			}
			else heroVideo.pause();
		}

		dots.forEach(d => {
			d.addEventListener('click', () => {
				stopAuto();
				if (hero.classList.contains('is-playing')) stopHeroVideo();
				setActive(d.dataset.heroDot);
				scheduleAutoResume();
			});
		});

		let swipeStartX = 0;
		let swipeStartY = 0;
		let swipePointerId = null;
		let lastHeroSwipeAt = 0;
		hero.addEventListener('pointerdown', (e) => {
			if (hero.classList.contains('is-playing')) return;
			swipeStartX = e.clientX;
			swipeStartY = e.clientY;
			swipePointerId = e.pointerId;
		});
		hero.addEventListener('pointerup', (e) => {
			if (hero.classList.contains('is-playing') || e.pointerId !== swipePointerId) return;
			const dx = e.clientX - swipeStartX;
			const dy = e.clientY - swipeStartY;
			swipePointerId = null;
			if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
			e.preventDefault();
			lastHeroSwipeAt = performance.now();
			stopAuto();
			const idx = order.indexOf(current);
			const next = dx < 0
				? order[(idx + 1) % order.length]
				: order[(idx - 1 + order.length) % order.length];
			setActive(next);
			scheduleAutoResume();
		});
		hero.addEventListener('pointercancel', () => {
			swipeStartX = 0;
			swipeStartY = 0;
			swipePointerId = null;
		});
		hero.addEventListener('click', (e) => {
			if (performance.now() - lastHeroSwipeAt > 500) return;
			e.preventDefault();
			e.stopPropagation();
		}, true);
		heroStage?.addEventListener('dragstart', (e) => e.preventDefault());

		heroPlay?.addEventListener('click', playHeroVideo);
		heroClose?.addEventListener('click', stopHeroVideo);
		heroVideo?.addEventListener('ended', playNextHeroPromo);
		heroRecommendationButtons.forEach(button => {
			button.addEventListener('click', () => {
				const key = button.dataset.heroVideoKey;
				if (key) playHeroClip(key);
			});
		});
		const syncHeroRecommendationsViewport = () => {
			if (!desktopHeroRecommendations.matches && hero.classList.contains('is-ended')) stopHeroVideo();
		};
		if (desktopHeroRecommendations.addEventListener) desktopHeroRecommendations.addEventListener('change', syncHeroRecommendationsViewport);
		else desktopHeroRecommendations.addListener(syncHeroRecommendationsViewport);
		window.addEventListener('orientationchange', syncHeroFullscreenAfterRotate);
		window.addEventListener('resize', syncHeroFullscreenAfterRotate);
		if (screen.orientation?.addEventListener) screen.orientation.addEventListener('change', syncHeroFullscreenAfterRotate);
		heroQualityBtns.forEach(b => {
			b.addEventListener('click', () => changeQuality(b.dataset.heroQ));
		});

		heroToggle?.addEventListener('click', togglePlayPause);
		heroVideo?.addEventListener('click', () => {
			if (heroVideo.muted) {
				heroVideo.muted = false;
				return;
			}
			togglePlayPause();
		});
		heroVideo?.addEventListener('loadstart', () => {
			if (hero.classList.contains('is-playing')) setHeroLoading(true);
		});
		['loadeddata', 'canplay', 'playing'].forEach(eventName => {
			heroVideo?.addEventListener(eventName, () => setHeroLoading(false));
		});
		heroVideo?.addEventListener('error', () => {
			if (!hero.classList.contains('is-playing') || !currentHeroVideoKey) return;
			if (heroQuality === '2160') {
				showToast('4K недоступно, переключаем на 1080p');
				changeQuality('1080');
			} else if (heroQuality === '1080') {
				showToast('1080p недоступно, переключаем на 720p');
				changeQuality('720');
			} else {
				setHeroLoading(false);
				showToast('Видео временно недоступно');
			}
		});
		heroVideo?.addEventListener('play',  () => {
			heroToggle?.classList.remove('is-paused');
			heroToggle?.setAttribute('aria-label', 'Пауза');
		});
		heroVideo?.addEventListener('pause', () => {
			heroToggle?.classList.add('is-paused');
			heroToggle?.setAttribute('aria-label', 'Продолжить');
		});
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

		if (!reducedHeroMotion.matches) {
			startAuto();
		}
		preloadHeroClip();
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

	// ---------- Horizontal rails: infinite loop scroll ----------
	function initInfiniteRail(track) {
		if (track.dataset.loopReady === '1') return;
		const originals = Array.from(track.children);
		if (originals.length < 2) return;
		track.dataset.loopReady = '1';
		const n = originals.length;
		const clones = [];
		const cloneItem = (item) => {
			const clone = item.cloneNode(true);
			clone.dataset.loopClone = '1';
			clone.setAttribute('aria-hidden', 'true');
			clone.querySelectorAll('a, button').forEach(control => control.setAttribute('tabindex', '-1'));
			clones.push(clone);
			return clone;
		};
		[...originals].reverse().forEach(item => track.insertBefore(cloneItem(item), track.firstChild));
		originals.forEach(item => track.appendChild(cloneItem(item)));

		const copies = 3;
		const setWidth = () => track.scrollWidth / copies;

		const alignOn = (idx) => {
			const el = track.children[idx];
			if (!el) return;
			track.scrollLeft = el.offsetLeft + el.offsetWidth / 2 - track.clientWidth / 2;
		};

		requestAnimationFrame(() => {
			alignOn(n);
		});

		let rafId = null;
		let jumping = false;
		const onScroll = () => {
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
		};
		track.addEventListener('scroll', onScroll, { passive: true });

		const onResize = () => requestAnimationFrame(() => {
			alignOn(n);
		});
		window.addEventListener('resize', onResize, { passive: true });

		return () => {
			track.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			if (rafId) cancelAnimationFrame(rafId);
			clones.forEach(clone => clone.remove());
			delete track.dataset.loopReady;
			track.scrollLeft = 0;
		};
	}

	document.querySelectorAll('.video-rail__track').forEach(track => initInfiniteRail(track));

	// ---------- Desktop mouse: drag-to-scroll on video rails ----------
	// A mouse-only desktop user hovering the rail has no scrollbar/arrows to
	// move it, so click-and-drag (with a grab cursor affordance, see
	// styles.css) is the interaction. We deliberately do NOT hijack the wheel:
	// `wheel` deltaY can't be reliably told apart from a trackpad's normal
	// vertical two-finger scroll (both report the same event, both match
	// `pointer: fine`), so converting it to horizontal rail movement traps
	// anyone trying to scroll the page past the rail — a worse bug than the
	// "rail looks frozen" one it was meant to fix (regression found 2026-08-05).
	document.querySelectorAll('.video-rail__track').forEach(track => {
		track.addEventListener('dragstart', (e) => e.preventDefault());

		let dragging = false;
		let dragMoved = false;
		let startX = 0;
		let startScroll = 0;
		track.addEventListener('pointerdown', (e) => {
			if (e.pointerType !== 'mouse') return;
			dragging = true;
			dragMoved = false;
			startX = e.clientX;
			startScroll = track.scrollLeft;
			track.classList.add('is-dragging');
		});
		window.addEventListener('pointermove', (e) => {
			if (!dragging) return;
			const dx = e.clientX - startX;
			if (Math.abs(dx) > 4) dragMoved = true;
			track.scrollLeft = startScroll - dx;
		});
		const endDrag = () => {
			if (!dragging) return;
			dragging = false;
			track.classList.remove('is-dragging');
			if (dragMoved) {
				track.addEventListener('click', (ev) => {
					ev.stopPropagation();
					ev.preventDefault();
				}, { capture: true, once: true });
			}
		};
		window.addEventListener('pointerup', endDrag);
		window.addEventListener('pointercancel', endDrag);
	});

	// The event shelf is a carousel only on mobile. Starting on the middle copy
	// keeps Corporate centred while a slice of Original music remains at left.
	const directionTrack = document.querySelector('#directions .tile-grid--bleed');
	if (directionTrack) {
		const mobileDirections = window.matchMedia('(max-width: 734px)');
		const syncDirectionLoop = () => {
			if (mobileDirections.matches) initInfiniteRail(directionTrack);
		};
		syncDirectionLoop();
		if (mobileDirections.addEventListener) mobileDirections.addEventListener('change', syncDirectionLoop);
		else mobileDirections.addListener(syncDirectionLoop);
	}

})();
