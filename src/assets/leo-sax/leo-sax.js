(() => {
	'use strict';

	const hero = document.querySelector('[data-leo-hero]');
	const video = hero?.querySelector('[data-leo-video]');
	const playButton = hero?.querySelector('[data-leo-play]');
	const playerUi = hero?.querySelector('[data-player-ui]');
	const closeButton = hero?.querySelector('[data-video-close]');
	const toggleButton = hero?.querySelector('[data-video-toggle]');
	const progress = hero?.querySelector('[data-video-progress]');
	const timeLabel = hero?.querySelector('[data-video-time]');
	const fullscreenButton = hero?.querySelector('[data-video-fullscreen]');
	const qualityButtons = [...(hero?.querySelectorAll('[data-video-quality]') || [])];
	const status = hero?.querySelector('[data-player-status]');
	const base = (window.SITE_BASE || '/').replace(/\/?$/, '/');
	const qualities = ['480', '720', '1080'];
	let currentQuality = '720';
	let qualityWasChosen = false;
	let sourceAttempt = 0;
	let stallDowngradeTimer = 0;
	let statusTimer = 0;

	function sourceFor(quality) {
		return `${base}assets/video/mp4/leo-sax-promo-${quality}.mp4`;
	}

	function formatTime(seconds) {
		if (!Number.isFinite(seconds)) return '0:00';
		const minutes = Math.floor(seconds / 60);
		const rest = Math.floor(seconds % 60);
		return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
	}

	function showStatus(message, duration = 2600) {
		if (!status) return;
		window.clearTimeout(statusTimer);
		status.textContent = message;
		status.classList.toggle('is-visible', Boolean(message));
		if (message) statusTimer = window.setTimeout(() => status.classList.remove('is-visible'), duration);
	}

	function suggestedQuality() {
		const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
		const slowConnection = connection && (connection.saveData || /(^|-)2g|3g/.test(connection.effectiveType || ''));
		if (slowConnection) return '480';
		if (window.matchMedia('(max-width: 700px), (pointer: coarse)').matches) return '720';
		return '1080';
	}

	function syncQualityButtons() {
		qualityButtons.forEach((button) => {
			const active = button.dataset.videoQuality === currentQuality;
			button.classList.toggle('is-active', active);
			button.setAttribute('aria-pressed', active ? 'true' : 'false');
		});
	}

	function setLoading(loading) {
		if (!hero) return;
		hero.classList.toggle('is-loading', loading);
		hero.setAttribute('aria-busy', loading ? 'true' : 'false');
	}

	function clearStallDowngrade() {
		window.clearTimeout(stallDowngradeTimer);
		stallDowngradeTimer = 0;
	}

	function resetStallState() {
		clearStallDowngrade();
	}

	function requestPlayback(attempt) {
		const promise = video?.play();
		if (!promise?.catch) return;
		promise.catch(() => {
			if (attempt !== sourceAttempt || !video) return;
			video.muted = true;
			video.play().then(() => {
				showStatus('Коснитесь видео, чтобы включить звук');
			}).catch(() => {
				setLoading(false);
				showStatus('Не удалось запустить видео');
			});
		});
	}

	function loadQuality(quality, restoreTime = 0, autoplay = true) {
		if (!video) return;
		resetStallState();
		currentQuality = quality;
		syncQualityButtons();
		const attempt = ++sourceAttempt;
		const wasMuted = video.muted;
		setLoading(true);
		video.pause();
		video.src = sourceFor(quality);
		video.preload = 'auto';
		video.load();
		video.muted = wasMuted;
		if (restoreTime > 0) {
			video.addEventListener('loadedmetadata', () => {
				if (attempt !== sourceAttempt || !Number.isFinite(video.duration)) return;
				video.currentTime = Math.min(restoreTime, Math.max(video.duration - 0.25, 0));
			}, { once: true });
		}
		if (autoplay) requestPlayback(attempt);
	}

	function openVideo() {
		if (!hero || !video) return;
		currentQuality = suggestedQuality();
		qualityWasChosen = false;
		hero.classList.add('is-playing');
		document.body.classList.add('leo-video-open');
		playerUi?.setAttribute('aria-hidden', 'false');
		if (playerUi) playerUi.inert = false;
		video.muted = false;
		loadQuality(currentQuality, 0, true);
		window.requestAnimationFrame(() => closeButton?.focus({ preventScroll: true }));
	}

	function leaveFullscreen() {
		if (document.fullscreenElement) {
			const promise = document.exitFullscreen?.();
			promise?.catch?.(() => {});
		}
		if (video?.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
	}

	function closeVideo() {
		if (!hero || !video) return;
		leaveFullscreen();
		resetStallState();
		video.pause();
		sourceAttempt += 1;
		video.removeAttribute('src');
		video.preload = 'none';
		video.load();
		hero.classList.remove('is-playing', 'is-loading');
		document.body.classList.remove('leo-video-open');
		playerUi?.setAttribute('aria-hidden', 'true');
		if (playerUi) playerUi.inert = true;
		if (progress) {
			progress.value = '0';
			progress.style.setProperty('--progress', '0%');
		}
		if (timeLabel) timeLabel.textContent = '0:00 / 2:35';
		showStatus('');
		playButton?.focus({ preventScroll: true });
	}

	function changeQuality(quality, manual = true) {
		if (!video || quality === currentQuality || !qualities.includes(quality)) return;
		const currentTime = video.currentTime || 0;
		const autoplay = !video.paused;
		qualityWasChosen = manual;
		loadQuality(quality, currentTime, autoplay);
	}

	function downgradeQuality(reason) {
		clearStallDowngrade();
		const index = qualities.indexOf(currentQuality);
		if (index <= 0) {
			setLoading(false);
			showStatus('Видео временно недоступно');
			return;
		}
		const next = qualities[index - 1];
		showStatus(reason || `Сеть замедлилась — включаем ${next}p`);
		changeQuality(next, false);
	}

	function togglePlayback() {
		if (!video) return;
		if (video.paused) {
			video.muted = false;
			video.play().catch(() => showStatus('Нажмите Play ещё раз'));
		} else {
			video.pause();
		}
	}

	playButton?.addEventListener('click', openVideo);
	closeButton?.addEventListener('click', closeVideo);
	toggleButton?.addEventListener('click', togglePlayback);
	qualityButtons.forEach((button) => button.addEventListener('click', () => changeQuality(button.dataset.videoQuality, true)));
	fullscreenButton?.addEventListener('click', () => {
		if (!hero || !video) return;
		if (document.fullscreenElement || video.webkitDisplayingFullscreen) {
			leaveFullscreen();
			return;
		}
		const request = hero.requestFullscreen || hero.webkitRequestFullscreen;
		if (!request) {
			video.webkitEnterFullscreen?.();
			return;
		}
		const promise = request.call(hero, { navigationUI: 'hide' });
		promise?.catch?.(() => video.webkitEnterFullscreen?.());
	});

	video?.addEventListener('click', () => {
		if (video.muted) {
			video.muted = false;
			showStatus('Звук включён', 1200);
			return;
		}
		togglePlayback();
	});
	video?.addEventListener('loadstart', () => hero?.classList.contains('is-playing') && setLoading(true));
	['loadeddata', 'canplay', 'playing'].forEach((eventName) => video?.addEventListener(eventName, () => {
		clearStallDowngrade();
		setLoading(false);
	}));
	video?.addEventListener('play', () => {
		toggleButton?.classList.remove('is-paused');
		toggleButton?.setAttribute('aria-label', 'Пауза');
	});
	video?.addEventListener('pause', () => {
		clearStallDowngrade();
		toggleButton?.classList.add('is-paused');
		toggleButton?.setAttribute('aria-label', 'Продолжить');
	});
	video?.addEventListener('timeupdate', () => {
		if (!video.duration) return;
		const percent = (video.currentTime / video.duration) * 100;
		if (progress) {
			progress.value = String(percent);
			progress.style.setProperty('--progress', `${percent}%`);
		}
		if (timeLabel) timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
	});
	video?.addEventListener('waiting', () => {
		setLoading(true);
		if (stallDowngradeTimer) return;
		const stalledAttempt = sourceAttempt;
		const stalledQuality = currentQuality;
		stallDowngradeTimer = window.setTimeout(() => {
			if (
				hero?.classList.contains('is-playing') &&
				stalledAttempt === sourceAttempt &&
				stalledQuality === currentQuality &&
				video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
			) {
				downgradeQuality();
			}
		}, qualityWasChosen ? 8000 : 5500);
	});
	video?.addEventListener('error', () => {
		clearStallDowngrade();
		if (hero?.classList.contains('is-playing')) downgradeQuality(`${currentQuality}p недоступно — снижаем качество`);
	});
	progress?.addEventListener('input', () => {
		if (!video?.duration) return;
		video.currentTime = (Number(progress.value) / 100) * video.duration;
		progress.style.setProperty('--progress', `${progress.value}%`);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && hero?.classList.contains('is-playing')) closeVideo();
		if (event.code === 'Space' && hero?.classList.contains('is-playing') && !/BUTTON|INPUT|SUMMARY/.test(document.activeElement?.tagName || '')) {
			event.preventDefault();
			togglePlayback();
		}
	});

	syncQualityButtons();

	const carousel = document.querySelector('[data-carousel]');
	const viewport = carousel?.querySelector('[data-carousel-viewport]');
	const track = carousel?.querySelector('[data-carousel-track]');
	const previous = carousel?.querySelector('[data-carousel-prev]');
	const next = carousel?.querySelector('[data-carousel-next]');
	const dots = [...document.querySelectorAll('[data-carousel-dot]')];
	const realSlides = [...(track?.querySelectorAll('[data-carousel-slide]') || [])];
	let currentSlide = 0;
	let scrollTimer = 0;
	let loopGuard = false;
	let beforeClone = null;
	let afterClone = null;
	let autoplayTimer = 0;
	let carouselInView = false;
	let carouselPaused = false;
	const autoplayDelay = 4300;
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

	function centerSlide(slide, behavior = 'smooth') {
		if (!viewport || !slide) return;
		const left = slide.offsetLeft - (viewport.clientWidth - slide.clientWidth) / 2;
		viewport.scrollTo({ left, behavior });
	}

	function updateDots(index) {
		currentSlide = (index + realSlides.length) % realSlides.length;
		dots.forEach((dot, dotIndex) => {
			const active = dotIndex === currentSlide;
			dot.classList.toggle('is-active', active);
			if (active) dot.setAttribute('aria-current', 'true');
			else dot.removeAttribute('aria-current');
		});
	}

	function nearestTrackSlide() {
		if (!viewport || !track) return null;
		const center = viewport.scrollLeft + viewport.clientWidth / 2;
		return [...track.children].reduce((nearest, slide) => {
			const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
			const distance = Math.abs(slideCenter - center);
			return !nearest || distance < nearest.distance ? { slide, distance } : nearest;
		}, null)?.slide || null;
	}

	function settleCarousel() {
		if (!viewport || loopGuard) return;
		const nearest = nearestTrackSlide();
		if (!nearest) return;
		const index = Number(nearest.dataset.slideIndex);
		updateDots(index);
		if (nearest.dataset.clone === 'before') {
			loopGuard = true;
			centerSlide(realSlides[realSlides.length - 1], 'auto');
			requestAnimationFrame(() => { loopGuard = false; });
		} else if (nearest.dataset.clone === 'after') {
			loopGuard = true;
			centerSlide(realSlides[0], 'auto');
			requestAnimationFrame(() => { loopGuard = false; });
		}
		scheduleAutoplay();
	}

	function clearAutoplay() {
		window.clearTimeout(autoplayTimer);
		autoplayTimer = 0;
	}

	function adjacentSlide(direction) {
		if (!realSlides.length) return null;
		if (direction > 0 && currentSlide === realSlides.length - 1) return afterClone;
		if (direction < 0 && currentSlide === 0) return beforeClone;
		return realSlides[currentSlide + direction];
	}

	function moveCarousel(direction) {
		centerSlide(adjacentSlide(direction));
	}

	function scheduleAutoplay() {
		clearAutoplay();
		if (!carouselInView || carouselPaused || document.hidden || reducedMotion.matches || realSlides.length < 2) return;
		autoplayTimer = window.setTimeout(() => moveCarousel(1), autoplayDelay);
	}

	if (viewport && track && realSlides.length > 1) {
		beforeClone = realSlides[realSlides.length - 1].cloneNode(true);
		afterClone = realSlides[0].cloneNode(true);
		beforeClone.dataset.clone = 'before';
		afterClone.dataset.clone = 'after';
		beforeClone.setAttribute('aria-hidden', 'true');
		afterClone.setAttribute('aria-hidden', 'true');
		track.prepend(beforeClone);
		track.append(afterClone);
		requestAnimationFrame(() => centerSlide(realSlides[0], 'auto'));

		viewport.addEventListener('scroll', () => {
			window.clearTimeout(scrollTimer);
			scrollTimer = window.setTimeout(settleCarousel, 110);
		}, { passive: true });
		viewport.addEventListener('keydown', (event) => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			centerSlide(realSlides[(currentSlide + direction + realSlides.length) % realSlides.length]);
		});

		let dragStartX = 0;
		let dragStartScroll = 0;
		let dragging = false;
		viewport.addEventListener('pointerdown', (event) => {
			carouselPaused = true;
			clearAutoplay();
			if (event.pointerType !== 'mouse') return;
			dragging = true;
			dragStartX = event.clientX;
			dragStartScroll = viewport.scrollLeft;
			viewport.classList.add('is-dragging');
			viewport.setPointerCapture(event.pointerId);
		});
		viewport.addEventListener('pointermove', (event) => {
			if (!dragging) return;
			viewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX);
		});
		const endDrag = () => {
			if (dragging) {
				dragging = false;
				viewport.classList.remove('is-dragging');
				centerSlide(nearestTrackSlide());
			}
			carouselPaused = false;
			scheduleAutoplay();
		};
		viewport.addEventListener('pointerup', endDrag);
		viewport.addEventListener('pointercancel', endDrag);
		carousel.addEventListener('mouseenter', () => { carouselPaused = true; clearAutoplay(); });
		carousel.addEventListener('mouseleave', () => { carouselPaused = false; scheduleAutoplay(); });
		carousel.addEventListener('focusin', () => { carouselPaused = true; clearAutoplay(); });
		carousel.addEventListener('focusout', () => { carouselPaused = false; scheduleAutoplay(); });
		new IntersectionObserver((entries) => {
			carouselInView = entries[0]?.isIntersecting || false;
			scheduleAutoplay();
		}, { threshold: 0.35 }).observe(carousel);
		document.addEventListener('visibilitychange', scheduleAutoplay);
		reducedMotion.addEventListener?.('change', scheduleAutoplay);
	}

	previous?.addEventListener('click', () => {
		if (!realSlides.length) return;
		moveCarousel(-1);
	});
	next?.addEventListener('click', () => {
		if (!realSlides.length) return;
		moveCarousel(1);
	});
	dots.forEach((dot) => dot.addEventListener('click', () => {
		centerSlide(realSlides[Number(dot.dataset.carouselDot)]);
		scheduleAutoplay();
	}));

	document.querySelectorAll('.leo-repertoire__group').forEach((group) => {
		group.addEventListener('toggle', () => {
			if (!group.open) return;
			document.querySelectorAll('.leo-repertoire__group[open]').forEach((other) => {
				if (other !== group) other.open = false;
			});
		});
	});
})();
