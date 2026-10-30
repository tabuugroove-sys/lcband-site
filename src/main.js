/* Luxury Cover Band — main.js
   Nav, mobile burger, scroll-reveal, lightbox (image + video), hero switcher.
   Video player: 720p/1080p/4K manual picker + auto-downgrade on slow network / stalls.
*/

(() => {
	'use strict';
	const copy = window.LCBLocale.copy;
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const saveData = Boolean(navigator.connection?.saveData);
	const backgroundVideo = document.querySelector('[data-background-video]');
	// Decorative media has a separate lifecycle from the user's full video player.
	const backgroundController = (() => {
		if (!backgroundVideo) return null;
		const host = backgroundVideo.closest('[data-background-host]');
		const toggle = host?.querySelector('[data-background-toggle]');
		const poster = host?.querySelector('.hero-background__poster img');
		if (!host || !toggle || !poster) return null;
		const canObserve = 'IntersectionObserver' in window;
		const mobileMedia = window.matchMedia('(max-width: 734px) and (orientation: portrait)');
		let visible = false;
		let ready = false;
		let pageActive = true;
		let userPaused = false;
		let costumeView = false;
		let playPending = false;
		let playAttempt = 0;
		const pause = () => {
			if (playPending || !backgroundVideo.paused) {
				playAttempt += 1;
				playPending = false;
				backgroundVideo.pause();
			}
		};
		const allowed = () => !reduceMotion.matches && !navigator.connection?.saveData
			&& !/2g|3g/.test(navigator.connection?.effectiveType || '');
		const playerOpen = () => document.body.classList.contains('hero-video-open')
			|| document.getElementById('lightbox')?.classList.contains('is-open');
		const shouldPlay = () => ready && visible && pageActive && !document.hidden
			&& allowed() && !userPaused && !costumeView && !playerOpen();
		const renderToggle = () => {
			const label = costumeView ? toggle.dataset.labelBack : userPaused ? toggle.dataset.labelResume : toggle.dataset.labelPause;
			toggle.textContent = label;
			toggle.setAttribute('aria-label', label);
			toggle.hidden = Boolean(playerOpen()) || (!costumeView && (!ready || !allowed() || !canObserve));
		};
		const update = () => {
			renderToggle();
			if (!shouldPlay()) {
				pause();
				// A changed accessibility/data preference also stops further buffering.
				if (!allowed() && backgroundVideo.getAttribute('src')) {
					backgroundVideo.removeAttribute('src');
					backgroundVideo.load();
					backgroundVideo.classList.remove('is-ready');
				}
				return;
			}
			// Full-screen 1920 cut on large and retina screens, 1280 elsewhere, portrait cut on phones.
			const largeScreen = window.innerWidth * (window.devicePixelRatio || 1) > 1600;
			const selectedSource = mobileMedia.matches ? backgroundVideo.dataset.srcMobile
				: (largeScreen && backgroundVideo.dataset.srcDesktopHd) || backgroundVideo.dataset.srcDesktop;
			if (backgroundVideo.getAttribute('src') !== selectedSource) {
				pause();
				backgroundVideo.classList.remove('is-ready');
				// Reuse the already loaded responsive image, avoiding a second poster GET.
				backgroundVideo.poster = poster.currentSrc || poster.src;
				backgroundVideo.muted = true;
				backgroundVideo.defaultMuted = true;
				backgroundVideo.src = selectedSource;
			}
			if (!backgroundVideo.paused || playPending) return;
			playPending = true;
			const attempt = ++playAttempt;
			backgroundVideo.play().catch(error => {
				if (attempt !== playAttempt || !shouldPlay()) return;
				if (error.name === 'AbortError') { requestAnimationFrame(update); return; }
				if (shouldPlay()) {
					userPaused = true;
					backgroundVideo.classList.remove('is-ready');
					renderToggle();
				}
			}).finally(() => { if (attempt === playAttempt) playPending = false; });
		};
		const changeMode = nextCostumeView => {
			costumeView = nextCostumeView;
			host.classList.toggle('is-costume-view', costumeView);
			host.dispatchEvent(new CustomEvent('background-modechange', { detail: { costumeView } }));
			update();
		};
		toggle.addEventListener('click', () => {
			if (costumeView) { userPaused = false; changeMode(false); }
			else { userPaused = !userPaused; update(); }
		});
		backgroundVideo.addEventListener('playing', () => {
			if (!shouldPlay()) { backgroundVideo.pause(); return; }
			backgroundVideo.classList.add('is-ready');
		});
		backgroundVideo.addEventListener('error', () => {
			if (!backgroundVideo.getAttribute('src')) return;
			userPaused = true;
			backgroundVideo.classList.remove('is-ready');
			renderToggle();
		});
		if (canObserve) new IntersectionObserver(entries => {
			visible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.1;
			update();
		}, { threshold: [0, 0.1] }).observe(host);
		document.addEventListener('visibilitychange', update);
		window.addEventListener('pagehide', () => { pageActive = false; update(); });
		window.addEventListener('pageshow', () => { pageActive = true; update(); });
		reduceMotion.addEventListener('change', update);
		mobileMedia.addEventListener('change', update);
		navigator.connection?.addEventListener?.('change', update);
		const modalObserver = new MutationObserver(update);
		modalObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		const lightboxHost = document.getElementById('lightbox');
		if (lightboxHost) modalObserver.observe(lightboxHost, { attributes: true, attributeFilter: ['class'] });
		const afterLoad = () => {
			const start = () => { ready = true; update(); };
			if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1500 });
			else window.setTimeout(start, 800);
		};
		if (document.readyState === 'complete') afterLoad();
		else window.addEventListener('load', afterLoad, { once: true });
		return { selectCostume: () => changeMode(true), get costumeView() { return costumeView; } };
	})();

	// ---------- Home: four silent reels (2×2) ----------
	// Same rules as the background montage: posters paint first, the videos load
	// only after page load and while the grid is on screen, never under reduced
	// motion, Save-Data or 2g/3g. Phones get square cuts, wider screens 2:1 cuts.
	// The reveal below shows the tiles one by one and a video loads only once its
	// tile is shown, so four never load at once; the first one is fetched ahead as the
	// grid comes near, so it moves as soon as it grows in. One button pauses and resumes them.
	// «Первые два появились одновременно и не двигаются» (30.10, page still loading): a
	// visitor who has scrolled to the grid does not wait for the rest of the page.
	(() => {
		const host = document.querySelector('[data-reel]');
		const grid = host?.querySelector('[data-reel-grid]');
		const toggle = host?.querySelector('[data-reel-toggle]');
		const videos = host ? [...host.querySelectorAll('[data-reel-video]')] : [];
		if (!grid || !toggle || !videos.length || !('IntersectionObserver' in window)) return;
		const squareMedia = window.matchMedia('(max-width: 599px)');
		let visible = false;
		let near = false;
		let ready = false;
		let pageActive = true;
		let userPaused = false;
		let shown = videos.length;
		const allowed = () => !reduceMotion.matches && !navigator.connection?.saveData
			&& !/2g|3g/.test(navigator.connection?.effectiveType || '');
		const playerOpen = () => document.body.classList.contains('hero-video-open')
			|| document.getElementById('lightbox')?.classList.contains('is-open');
		const shouldPlay = () => ready && visible && pageActive && !document.hidden
			&& allowed() && !userPaused && !playerOpen();
		const renderToggle = () => {
			const label = userPaused ? toggle.dataset.labelResume : toggle.dataset.labelPause;
			toggle.setAttribute('aria-label', label);
			toggle.classList.toggle('is-paused', userPaused);
			toggle.hidden = !ready || !allowed() || Boolean(playerOpen());
		};
		const sourceFor = video => (squareMedia.matches ? video.dataset.srcSquare : video.dataset.srcWide);
		const update = () => {
			renderToggle();
			const play = shouldPlay();
			videos.forEach((video, i) => {
				if (!play || i >= shown) {
					video.pause();
					if (i === 0 && near && ready && allowed() && !video.getAttribute('src')) {
						video.muted = true;
						video.defaultMuted = true;
						video.preload = 'auto';
						video.src = sourceFor(video);
					}
					// A changed accessibility/data preference also stops further buffering.
					if (!allowed() && video.getAttribute('src')) {
						video.removeAttribute('src');
						video.load();
						video.classList.remove('is-ready');
					}
					return;
				}
				const source = sourceFor(video);
				if (video.getAttribute('src') !== source) {
					video.classList.remove('is-ready');
					video.muted = true;
					video.defaultMuted = true;
					video.preload = 'auto';
					video.src = source;
				}
				if (video.paused) video.play().catch(error => {
					// Autoplay blocked (iOS Low Power Mode): keep the posters and offer
					// the play button — a tap is a user gesture, so it plays.
					if (error.name === 'NotAllowedError' && shouldPlay()) { userPaused = true; update(); }
				});
			});
		};
		host.addEventListener('reel-reveal', event => { shown = event.detail.shown; update(); });
		toggle.addEventListener('click', () => { userPaused = !userPaused; update(); });
		for (const video of videos) {
			video.addEventListener('playing', () => {
				if (!shouldPlay()) { video.pause(); return; }
				video.classList.add('is-ready');
			});
			video.addEventListener('error', () => video.classList.remove('is-ready'));
		}
		new IntersectionObserver(entries => {
			visible = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.1;
			update();
		}, { threshold: [0, 0.1] }).observe(grid);
		new IntersectionObserver(entries => {
			near = entries[0].isIntersecting;
			if (near) ready = true;
			update();
		}, { rootMargin: '0px 0px 600px 0px' }).observe(grid);
		document.addEventListener('visibilitychange', update);
		window.addEventListener('pagehide', () => { pageActive = false; update(); });
		window.addEventListener('pageshow', () => { pageActive = true; update(); });
		reduceMotion.addEventListener('change', update);
		squareMedia.addEventListener('change', update);
		navigator.connection?.addEventListener?.('change', update);
		const modalObserver = new MutationObserver(update);
		modalObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		const lightboxHost = document.getElementById('lightbox');
		if (lightboxHost) modalObserver.observe(lightboxHost, { attributes: true, attributeFilter: ['class'] });
		const afterLoad = () => {
			const start = () => { ready = true; update(); };
			if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1500 });
			else window.setTimeout(start, 800);
		};
		if (document.readyState === 'complete') afterLoad();
		else window.addEventListener('load', afterLoad, { once: true });
	})();

	// ---------- Home reels: one by one, each after the one before is moving (Mikhail 29–30.10) ----------
	// «Первое видео появилось сразу, из середины увеличилось; когда задвигалось — второй
	// квадратик, он задвигался — третий…»: a tile grows out of the grid centre
	// (styles.css), its video loads and starts, and only once it is really moving does
	// the next tile come in and start loading, so four videos never load at once. A slow
	// video (4 s) or videos switched off (Save-Data, slow network) do not hold the next
	// tile; when the grid is being scrolled away, the rest come at once. Off under
	// reduced motion: all four are there at once. Phones (30.10, «на телефоне максимально
	// быстро, анимация не нужна»): the four posters are there at once with no animation;
	// only the videos still come one after another, so a phone never pulls four at once.
	(() => {
		const host = document.querySelector('[data-reel]');
		const grid = host?.querySelector('[data-reel-grid]');
		if (!grid || reduceMotion.matches || !('IntersectionObserver' in window)) return;
		const phone = window.matchMedia('(max-width: 599px)').matches;
		const ribbon = host.querySelector('.reel__ribbon');
		const tiles = [...grid.querySelectorAll('.reel__tile')];
		const minGap = 1200;
		const maxWait = 4000;
		let shown = 0;
		let timer = 0;
		const announce = () => host.dispatchEvent(new CustomEvent('reel-reveal', { detail: { shown } }));
		const place = () => {
			const cx = grid.clientWidth / 2;
			const cy = grid.clientHeight / 2;
			for (const tile of tiles) tile.style.transformOrigin = `${cx - tile.offsetLeft}px ${cy - tile.offsetTop}px`;
		};
		let stopWaiting = () => {};
		// Shows the next tile (or every tile up to `last`), then waits for its video to move.
		const next = (last = shown) => {
			window.clearTimeout(timer);
			stopWaiting();
			if (shown >= tiles.length) return;
			while (shown <= last) tiles[shown++].classList.add('is-shown');
			const tile = tiles[shown - 1];
			announce();
			if (shown >= tiles.length) return;
			const since = performance.now();
			const video = tile.querySelector('[data-reel-video]');
			let done = false;
			const go = () => {
				if (done) return;
				stopWaiting();
				window.clearTimeout(timer);
				timer = window.setTimeout(next, Math.max(0, minGap - (performance.now() - since)));
			};
			const moving = () => { if (video.currentTime > 0.05) go(); };
			stopWaiting = () => { done = true; video?.removeEventListener('timeupdate', moving); };
			video?.addEventListener('timeupdate', moving);
			timer = window.setTimeout(go, maxWait);
		};
		// «Слева снизу — ровно в тот момент, когда его верх пересекает центр экрана; это крайнее
		// время» (Mikhail 30.10): the bottom-left tile comes in, video and all, no later than its
		// top edge reaches the middle of the screen. A slow scroll keeps the usual pace; a fast
		// one brings it sooner. The top-right one always waits for the first («должен появляться
		// только первый ролик… через секунду следующий»).
		const deadlines = tiles.filter((tile, i) => i > 1 && tile.offsetLeft === tiles[0].offsetLeft);
		// «Первый — прям с нижней границы, когда прокрутка идёт, в два раза меньше и
		// увеличивается»: it starts while the grid is still rising from the bottom edge, once
		// the shrunken tile (the upper part of the grid's middle) is on screen to be seen growing.
		const maybeBegin = () => {
			if (shown) return;
			const rect = grid.getBoundingClientRect();
			if (rect.bottom > 0 && rect.top + rect.height * 0.3 <= window.innerHeight * 0.92) next();
		};
		const due = () => {
			// Where the tile sits in the grid, not its shrunken box while it waits.
			const middle = window.innerHeight / 2 - grid.getBoundingClientRect().top;
			const late = deadlines.filter(tile => !tile.classList.contains('is-shown')
				&& tile.offsetTop <= middle).pop();
			if (late) next(tiles.indexOf(late));
		};
		const rest = () => {
			window.clearTimeout(timer);
			stopWaiting();
			while (shown < tiles.length) tiles[shown++].classList.add('is-shown');
			announce();
		};
		const onScroll = () => {
			maybeBegin();
			if (shown === 0 || shown >= tiles.length) return;
			const rect = grid.getBoundingClientRect();
			if (rect.bottom < window.innerHeight * 0.35 || rect.top > window.innerHeight * 0.9) rest();
			else due();
		};
		if (!phone) {
			place();
			grid.classList.add('is-sequenced');
			window.addEventListener('resize', place);
		}
		announce();
		window.addEventListener('scroll', onScroll, { passive: true });
		const begin = new IntersectionObserver(entries => {
			if (!entries[0].isIntersecting) return;
			maybeBegin();
			if (shown) begin.disconnect();
		}, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
		begin.observe(grid);
		// The line above the grid slides up once, like the headlines on Apple Music.
		let ribbonWatch = null;
		if (ribbon && !phone) {
			ribbon.classList.add('is-armed');
			ribbonWatch = new IntersectionObserver(entries => {
				if (!entries[0].isIntersecting) return;
				ribbon.classList.add('is-in');
				ribbonWatch.disconnect();
			}, { threshold: 0.5 });
			ribbonWatch.observe(ribbon);
		}
		reduceMotion.addEventListener('change', () => {
			if (!reduceMotion.matches) return;
			begin.disconnect();
			window.removeEventListener('scroll', onScroll);
			ribbonWatch?.disconnect();
			ribbon?.classList.remove('is-armed');
			grid.classList.remove('is-sequenced');
			rest();
			for (const tile of tiles) tile.style.removeProperty('transform-origin');
		});
	})();

	// ---------- Magnet cards (Mikhail 30.10) ----------
	// «Сначала большое расстояние, а потом как магнитик прилипает… и в другую сторону
	// отлипает»: a card near the bottom edge of the screen waits lower and fainter and
	// catches up with the card above as the page scrolls on, a touch later than the
	// scroll, like the cards on apple.com/apple-music; scrolling back, it drops away
	// faster than the page moves. Containers opt in with data-magnet ("desktop": from
	// 735px). Transform and opacity only, one rAF loop while something still moves,
	// only cards near the screen; off under reduced motion.
	(() => {
		const groups = [...document.querySelectorAll('[data-magnet]')];
		if (!groups.length || reduceMotion.matches || !('IntersectionObserver' in window)) return;
		const desktop = window.matchMedia('(min-width: 735px)');
		const lift = 96;
		const zone = 0.42;
		const items = groups.flatMap(group => [...group.children].map(el => ({ el, group, y: 0, o: 1, near: false })));
		const active = item => item.group.dataset.magnet !== 'desktop' || desktop.matches;
		let frame = 0;
		const reset = item => { item.y = 0; item.o = 1; item.el.style.transform = ''; item.el.style.opacity = ''; };
		const tick = () => {
			frame = 0;
			let moving = false;
			for (const item of items) {
				if (!item.near || !active(item)) continue;
				// Where the card sits without our offset: 0 at the bottom edge, 1 once it is
				// `zone` of the screen higher.
				const top = item.el.getBoundingClientRect().top - item.y;
				const p = Math.min(1, Math.max(0, (window.innerHeight - top) / (window.innerHeight * zone)));
				const e = 1 - (1 - p) ** 3;
				const y = (1 - e) * lift;
				const o = 0.2 + 0.8 * e;
				item.y += (y - item.y) * 0.2;
				item.o += (o - item.o) * 0.2;
				if (Math.abs(y - item.y) < 0.3 && Math.abs(o - item.o) < 0.005) { item.y = y; item.o = o; } else moving = true;
				item.el.style.transform = item.y > 0.3 ? `translate3d(0, ${item.y.toFixed(1)}px, 0)` : '';
				item.el.style.opacity = item.o < 0.995 ? item.o.toFixed(3) : '';
			}
			if (moving) frame = requestAnimationFrame(tick);
		};
		const kick = () => { if (!frame) frame = requestAnimationFrame(tick); };
		const watch = new IntersectionObserver(entries => {
			for (const entry of entries) {
				const item = items.find(candidate => candidate.el === entry.target);
				if (item) item.near = entry.isIntersecting;
			}
			kick();
		}, { rootMargin: '240px 0px 240px 0px' });
		items.forEach(item => watch.observe(item.el));
		window.addEventListener('scroll', kick, { passive: true });
		window.addEventListener('resize', kick);
		desktop.addEventListener('change', () => { items.filter(item => !active(item)).forEach(reset); kick(); });
		reduceMotion.addEventListener('change', () => {
			if (!reduceMotion.matches) return;
			cancelAnimationFrame(frame);
			watch.disconnect();
			window.removeEventListener('scroll', kick);
			window.removeEventListener('resize', kick);
			items.forEach(reset);
		});
		kick();
	})();

	// ---------- Sound waves around 2000+ (Mikhail 30.10) ----------
	// After the rings on the apple.com/apple-music hero (a pre-rendered video there): a thick
	// iridescent ring, warm on one side, cool on the other, text inside it. Ours is a small
	// WebGL shader. «Круги быстро из середины выходят, переливаются на краях экрана и
	// пропадают, пока снова мышкой не поводят», «чёрный четырёхугольник не надо, фон и так
	// чёрный»: a wave is born in the middle, faint under the text, at full strength past the
	// text's edge (its half-diagonal), runs to the edges in about a second, shimmers there
	// and fades; no masks of any kind. «Плавно поворачивались на 25°, чем ближе к мышке, тем
	// больше поворот»: the ring's plane tilts towards the cursor, up to 25° as it comes near,
	// easing in and out. Moving the mouse over the block sends new waves (scrolling does on
	// phones), one wave greets the visitor when the block scrolls in; at rest there is
	// nothing. Half resolution, a frame loop only while a wave is alive; without WebGL or
	// under reduced motion the canvas stays empty. The band's look won a five-variant,
	// three-judge comparison against the Apple frames on 30.10 (bench: ~/lcb-constructor/tools/rings-lab).
	// «На телефоне максимально быстро, анимация не нужна, если грузит» (30.10): no rings on
	// touch screens. Elsewhere the shader is built only when the block comes near, and
	// in the background where the browser can, so opening the page never waits for it.
	(() => {
		const canvases = [...document.querySelectorAll('[data-count-rings]')];
		if (!canvases.length) return;
		if (window.matchMedia('(hover: none)').matches) { canvases.forEach(canvas => canvas.remove()); return; }
		const vertex = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
		const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 res;uniform float time;uniform vec2 center;uniform vec4 box;uniform float energy;uniform vec2 pointer;uniform float radius;uniform float px;uniform vec2 inner;
uniform vec4 waves[4];uniform vec2 tilt;
// Волны звука вокруг «2000+» (Михаил 30.10). Вид полосы — победитель отбора 30.10
// («стеклянный тор» + идеи минималистичного варианта): толстая мягкая полоса, тёплая
// половина (чёрный → тёмно-красный → красно-оранжевый → оранжево-жёлтый) и холодная
// (чёрный → тёмно-синий → синий → голубовато-белый), ярче у внутреннего края, тёмные
// лепестки, 2–3 коротких белых штриха, тонкое кольцо-эхо. Механика: волна рождается в
// середине (под текстом слабая), за ~1,2 с уходит к краям, там переливается и гаснет;
// плоскость наклонена к курсору до 25°. Никаких масок.
const float PI=3.14159265;
float wrap(float a){return a-6.2831853*floor((a+PI)/6.2831853);}
float win(float da,float w){float x=clamp(1.-da*da/(w*w),0.,1.);return x*x*(3.-2.*x);}
float g(float x){return exp(-x*x);}
float ease(float t){return 1.-pow(1.-t,2.6);}
vec3 warm(float x){vec3 c=mix(vec3(0.),vec3(.5,.03,.02),smoothstep(0.,.3,x));c=mix(c,vec3(.88,.13,.03),smoothstep(.3,.7,x));c=mix(c,vec3(1.,.44,.09),smoothstep(.7,1.,x));return mix(c,vec3(1.,.8,.5),smoothstep(1.,1.7,x));}
vec3 cool(float x){vec3 c=mix(vec3(0.),vec3(.03,.06,.45),smoothstep(0.,.3,x));c=mix(c,vec3(.08,.36,1.),smoothstep(.3,.7,x));c=mix(c,vec3(.32,.72,1.),smoothstep(.7,1.,x));return mix(c,vec3(.8,.96,1.),smoothstep(1.,1.7,x));}
void main(){
	float t=mod(time,418.879);
	float e=energy;
	float k=clamp(radius/(583.*px),.5,1.);
	float kk=smoothstep(.55,.95,k);
	vec2 p=gl_FragCoord.xy-center;
	// наклон плоскости кольца к курсору («чем ближе к мышке, тем больше поворот», до 25°)
	float th0=length(tilt);
	float ext=length(vec2(max(center.x,res.x-center.x),max(center.y,res.y-center.y)));
	if(th0>.001){vec2 ax=tilt/th0;float along=dot(p,ax);float perp=dot(p,vec2(-ax.y,ax.x));
		along=along/cos(th0)*(1.-.45*sin(th0)*clamp(along/ext,-1.,1.));
		p=ax*along+vec2(-ax.y,ax.x)*perp;}
	float sq=mix(1.,.94,kk);
	vec2 q=vec2(p.x*sq,p.y);
	float d=length(q);
	float th=atan(q.y,q.x);
	vec2 pq=vec2((pointer.x-center.x)*sq,pointer.y-center.y);
	float pa=atan(pq.y,pq.x);
	float facing=.5+.5*cos(th-pa);
	// фазы: раздел тёплой/холодной половины, лепестки
	float phS=mix(1.5708+.3*sin(t*.21),-.25+t*.045+.35*sin(t*.21),kk);
	phS+=e*.3*wrap(pa-phS);
	float phL=.9+t*.06;
	float s=cos(th-phS);
	float warmMix=smoothstep(-.15,.15,s);
	float lum=mix(mix(.45,.08,kk),1.,smoothstep(.04,.5,abs(s)));
	float lobe=smoothstep(-.9,.6,cos(3.*th-phL));
	lum*=mix(mix(.6,.2*e,kk),1.,lobe);
	// окна коротких штрихов (по углу; у краёв экрана они бегут быстрее — «переливаются»)
	float aA=mix(1.9,.1,kk)+.35*sin(t*.09);
	float aB=mix(4.3,PI-.3,kk)+.35*sin(t*.075+2.);
	float aC=mix(1.,PI+.55,kk)+.3*sin(t*.21+1.);
	vec3 white=mix(vec3(.85,.97,1.),vec3(1.,.96,.86),warmMix);
	float rExit=ext+40.*px;
	float Tfull=clamp(radius*.165,56.*px,100.*px)*(.94+.12*warmMix);
	vec3 col=vec3(0.);
	for(int i=0;i<4;i++){
		float age=time-waves[i].x;float amp=waves[i].y;
		if(age<0.||amp<=0.)continue;
		float life=age/1.25;
		if(life>1.)continue;
		vec2 dir=waves[i].zw;
		float face=.5+.5*dot(q/(d+.001),dir);
		float travel=ease(min(life*1.1,1.));
		float rb=radius*.12;
		float r0=rb+(rExit-rb)*travel+6.*px*amp*face*sin(th*5.+t*6.);
		float T=Tfull*(.4+.6*travel)*(1.+amp*.15*face);
		float u=(d-r0)/T;
		float prof=smoothstep(0.,mix(.14,.26,kk),u)*(1.-smoothstep(.5,1.08,u));
		float shape=.35+.65*exp(-3.*max(u,0.));
		float env=smoothstep(0.,.07,life)*(1.-smoothstep(.55,1.,life));
		float under=.3+.7*smoothstep(radius*.45,radius,r0);
		float shimmer=1.+.35*sin(th*9.-t*11.+float(i)*2.)*smoothstep(.3,.8,life);
		float streak=.85+.15*sin(th*4.+t*.15+1.);
		float x=prof*shape*lum*mix(1.9,1.55,kk)*(1.+amp*.3*face)*streak*shimmer*env*amp*under;
		col+=mix(cool(x),warm(x),warmMix);
		// короткие штрихи у внутреннего края, с дисперсией (синий внутрь, красный наружу)
		float sp=t+travel*6.;
		float wA=win(wrap(th-aA-.3*sin(sp*.9)),.5);
		float wB=win(wrap(th-aB+.3*sin(sp*.8+1.)),.45);
		float wC=win(wrap(th-aC),.4);
		float us=mix(.3,.1,kk);
		vec3 rim=vec3(g((u-us-.025)/.045),g((u-us)/.045),g((u-us+.025)/.045));
		float sl=sqrt(lum)*(1.15+.4*amp)*env*amp*under*smoothstep(.15,.45,life);
		col+=rim*(wA+wB)*white*sl;
		col+=g((u-.5)/.05)*wC*white*.6*sl;
		// тонкое кольцо-эхо чуть дальше, со смещением
		vec2 o=px*18.*k*vec2(cos(t*.12),sin(t*.12));
		vec2 qe=q-o;float de=length(qe);float the=atan(qe.y,qe.x);
		float ue=(de-(r0+T*1.2))/(T*.26);
		float se=cos(the-phS+.5);
		float lumE=mix(.15,1.,smoothstep(0.,.6,abs(se)))*smoothstep(-.8,.4,cos(3.*the-phL+1.2));
		float xe=.85*lumE*env*amp*under;
		col+=mix(cool(xe),warm(xe),smoothstep(-.15,.15,se))*exp(-ue*ue)*.7;
	}
	vec3 kx=max(col-.85,0.);
	col=min(col,.85)+.15*(1.-exp(-kx/.15));
	gl_FragColor=vec4(col,max(col.r,max(col.g,col.b)));
}`;
		const life = 1.25;
		const setup = (canvas, section, inner) => {
			const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
			if (!gl) { canvas.remove(); return; }
			const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); return s; };
			const program = gl.createProgram();
			gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
			gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
			gl.linkProgram(program);
			// KHR_parallel_shader_compile: the GPU process builds the program while the page goes on.
			const parallel = gl.getExtension('KHR_parallel_shader_compile');
			const built = () => {
				if (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) { requestAnimationFrame(built); return; }
				if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.remove(); return; }
				start(canvas, section, inner, gl, program);
			};
			built();
		};
		const start = (canvas, section, inner, gl, program) => {
			gl.useProgram(program);
			gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
			const attribute = gl.getAttribLocation(program, 'a');
			gl.enableVertexAttribArray(attribute);
			gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
			const u = name => gl.getUniformLocation(program, name);
			const uniforms = { res: u('res'), time: u('time'), center: u('center'), box: u('box'), inner: u('inner'), energy: u('energy'), pointer: u('pointer'), radius: u('radius'), px: u('px'), waves: u('waves[0]'), tilt: u('tilt') };
			const scale = 0.5;
			// Seconds since this script started: small numbers keep the shader's drift phases exact.
			const started = performance.now();
			const now = () => (performance.now() - started) / 1000;
			const waves = Array.from({ length: 4 }, () => ({ birth: -100, amp: 0, dx: 0, dy: 1 }));
			let width = 0;
			let height = 0;
			let centre = { x: 0, y: 0 };
			let visible = false;
			let frame = 0;
			let lastSpawn = 0;
			let travelled = 0;
			let lastY = window.scrollY;
			const pointer = { x: 0, y: 0, t: 0 };
			const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
			const maxTilt = 25 * Math.PI / 180;
			let reach = 1;
			const layout = () => {
				const rect = section.getBoundingClientRect();
				width = Math.max(1, Math.round(rect.width * scale));
				height = Math.max(1, Math.round(rect.height * scale));
				canvas.width = width;
				canvas.height = height;
				gl.viewport(0, 0, width, height);
				const box = inner.getBoundingClientRect();
				// Canvas pixels, y up (gl_FragCoord): the text block, its centre and half size.
				const x0 = (box.left - rect.left) * scale;
				const x1 = (box.right - rect.left) * scale;
				const y0 = height - (box.bottom - rect.top) * scale;
				const y1 = height - (box.top - rect.top) * scale;
				centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
				gl.uniform2f(uniforms.res, width, height);
				gl.uniform4f(uniforms.box, x0, y0, x1, y1);
				gl.uniform2f(uniforms.center, centre.x, centre.y);
				gl.uniform2f(uniforms.inner, (x1 - x0) / 2, (y1 - y0) / 2);
				// The circle around the text block: a wave reaches full strength once past it.
				gl.uniform1f(uniforms.radius, Math.hypot((x1 - x0) / 2, (y1 - y0) / 2) + 16 * scale);
				gl.uniform1f(uniforms.px, scale);
				reach = Math.hypot(Math.max(centre.x, width - centre.x), Math.max(centre.y, height - centre.y));
			};
			const alive = t => waves.some(wave => t - wave.birth < life);
			const settling = () => Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.002;
			const draw = t => {
				tilt.x += (tilt.tx - tilt.x) * 0.1;
				tilt.y += (tilt.ty - tilt.y) * 0.1;
				gl.uniform2f(uniforms.tilt, tilt.x, tilt.y);
				gl.uniform1f(uniforms.time, t);
				gl.uniform1f(uniforms.energy, Math.max(0, ...waves.map(wave => (t - wave.birth < life ? wave.amp : 0))));
				gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
				gl.uniform4fv(uniforms.waves, new Float32Array(waves.flatMap(wave => [wave.birth, wave.amp, wave.dx, wave.dy])));
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
			};
			const loop = () => {
				frame = 0;
				if (!visible || document.hidden) return;
				const t = now();
				draw(t);
				if (alive(t) || settling()) frame = requestAnimationFrame(loop);
			};
			const run = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop); };
			const spawn = (amp, dx, dy) => {
				if (reduceMotion.matches || !visible) return;
				const t = now();
				if (t - lastSpawn < 0.22) return;
				lastSpawn = t;
				const slot = waves.reduce((oldest, wave) => (wave.birth < oldest.birth ? wave : oldest), waves[0]);
				const length = Math.hypot(dx, dy) || 1;
				Object.assign(slot, { birth: t, amp, dx: dx / length, dy: dy / length });
				run();
			};
			section.addEventListener('pointermove', event => {
				const rect = section.getBoundingClientRect();
				const x = (event.clientX - rect.left) * scale;
				const y = height - (event.clientY - rect.top) * scale;
				const t = event.timeStamp / 1000;
				// Tilt towards the cursor: none at the very centre, full from a fifth of the way out,
				// easing off towards the edges.
				const dx = x - centre.x;
				const dy = y - centre.y;
				const dist = Math.hypot(dx, dy) || 1;
				const near = Math.min(1, dist / (0.2 * reach));
				const far = 1 - Math.min(1, Math.max(0, (dist - 0.45 * reach) / (0.65 * reach)));
				const amount = maxTilt * near * near * far;
				tilt.tx = dx / dist * amount;
				tilt.ty = dy / dist * amount;
				run();
				if (pointer.t) {
					const step = Math.hypot(x - pointer.x, y - pointer.y);
					travelled += step;
					const speed = step / Math.max(t - pointer.t, 0.004);
					if (travelled > 40) {
						travelled = 0;
						spawn(Math.min(1, 0.55 + speed / 2600), x - centre.x, y - centre.y);
					}
				}
				pointer.x = x;
				pointer.y = y;
				pointer.t = t;
			}, { passive: true });
			section.addEventListener('pointerleave', () => { tilt.tx = 0; tilt.ty = 0; run(); });
			window.addEventListener('scroll', () => {
				const dy = window.scrollY - lastY;
				lastY = window.scrollY;
				if (visible && Math.abs(dy) > 40) spawn(0.7, 0, dy > 0 ? -1 : 1);
			}, { passive: true });
			canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); visible = false; cancelAnimationFrame(frame); frame = 0; });
			new IntersectionObserver(entries => {
				const was = visible;
				visible = entries[0].isIntersecting;
				if (!visible) return;
				layout();
				if (!was) window.setTimeout(() => spawn(0.85, 0, 1), 250);
				run();
			}, { rootMargin: '60px 0px' }).observe(section);
			window.addEventListener('resize', () => { if (visible) { layout(); run(); } });
			document.addEventListener('visibilitychange', run);
		};
		for (const canvas of canvases) {
			const section = canvas.closest('[data-count-block]');
			const inner = section?.querySelector('.about-count__inner');
			if (!section || !inner || reduceMotion.matches) { canvas.remove(); continue; }
			const near = new IntersectionObserver(entries => {
				if (!entries[0].isIntersecting) return;
				near.disconnect();
				setup(canvas, section, inner);
			}, { rootMargin: '800px 0px' });
			near.observe(section);
		}
	})();

	// ---------- Locale memory ----------
	try {
		const path = window.location.pathname;
		const base = (document.querySelector('base')?.getAttribute('href') || '/').replace(/\/+$/, '/');
		const rel = path.startsWith(base) ? path.slice(base.length - 1) : path;
		const match = rel.match(/^\/(br|ae|en)(\/|$)/);
		if (match) {
			localStorage.setItem('lcb_locale', match[1]);
		} else if (rel === '/' || rel === '') {
			// Russian lives at the root URL and is always the default. Visiting an
			// explicit locale must never make a later visit to `/` jump away from RU.
			localStorage.setItem('lcb_locale', 'ru');
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
	if (storyRooms && window.innerWidth > 900 && !reduceMotion.matches && !saveData) {
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
			if (!storyRooms.classList.contains('is-enhanced')) return;
			const y = window.scrollY;
			// wipe привязан к геометрии экрана: старт — верх полосы достиг НИЖНЕЙ
			// границы плеера, финиш — верх полосы дошёл до ВЕРХНЕЙ границы.
			// Меряем ВНУТРЕННЕЕ поле видео (слой, без безеля) — тогда край
			// шторки внутри экрана стоит ровно в уровень с краем полосы снаружи.
			const frameRect = layers[0].getBoundingClientRect();
			let current = 0;
			let appearing = -1;
			layers.forEach((layer, i) => {
				if (i === 0 || !roomTops[i]) return;
				const p = Math.min(1, Math.max(0, (frameRect.bottom - (roomTops[i] - y)) / frameRect.height));
				layer.style.transform = 'translateY(' + ((1 - p) * 100) + '%)';
				if (p >= 0.5) current = i;
				else if (p > 0) appearing = i; // нижнее видео начало появляться
			});
			// активное видео + входящее снизу играет СРАЗУ, как только появилось;
			// вне секции на паузе всё
			const firstTop = roomTops[0] - y;
			const lastBottom = roomTops[rooms.length - 1] - y + rooms[rooms.length - 1].offsetHeight;
			if (document.hidden || firstTop >= vh || lastBottom <= 0) { current = -1; appearing = -1; }
			const playKey = current + ':' + appearing;
			if (playKey !== activeIndex) {
				activeIndex = playKey;
				videos.forEach((v, i) => {
					if (!v) return;
					if (i === current || i === appearing) {
						const source = v.querySelector('source[data-src]');
						if (source && !source.getAttribute('src')) {
							source.src = source.dataset.src;
							v.load();
						}
						v.play().catch(() => {});
					}
					else if (v.pause) { v.pause(); }
				});
			}
		};

		const onScroll = () => {
			if (!ticking) { ticking = true; requestAnimationFrame(render); }
		};
		const onResize = () => {
			if (window.innerWidth <= 900 || reduceMotion.matches || navigator.connection?.saveData) {
				storyRooms.classList.remove('is-enhanced');
				videos.forEach(video => {
					if (!video) return;
					video.pause();
					const source = video.querySelector('source[src]');
					if (source) { source.removeAttribute('src'); video.load(); }
				});
				activeIndex = -1;
				return;
			}
			storyRooms.classList.add('is-enhanced');
			measure(); render();
		};

		measure();
		render();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize, { passive: true });
		document.addEventListener('visibilitychange', onResize);
		reduceMotion.addEventListener('change', onResize);
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

	// ---------- Jazz repertoire: live search (/programs/jazz/) ----------
	// Фильтрует песни по подстроке (без учёта регистра), скрывает пустые
	// группы, во время поиска раскрывает группы с совпадениями.
	const repInput = document.querySelector('[data-rep-input]');
	if (repInput) {
		const repGroups = Array.from(document.querySelectorAll('[data-rep-group]'));
		const repEmpty = document.querySelector('[data-rep-empty]');
		const repData = repGroups.map(g => ({
			el: g,
			count: g.querySelector('[data-rep-count]'),
			total: g.querySelectorAll('.rep-group__song').length,
			songs: Array.from(g.querySelectorAll('.rep-group__song')).map(li => ({
				el: li,
				text: li.textContent.toLowerCase()
			}))
		}));
		repInput.addEventListener('input', () => {
			const q = repInput.value.trim().toLowerCase();
			let anyVisible = false;
			repData.forEach(g => {
				let visible = 0;
				g.songs.forEach(s => {
					const show = !q || s.text.indexOf(q) !== -1;
					s.el.classList.toggle('is-hidden', !show);
					if (show) visible++;
				});
				g.el.classList.toggle('is-filtered-out', visible === 0);
				if (q) g.el.open = visible > 0;
				if (g.count) g.count.textContent = q ? visible : g.total;
				if (visible > 0) anyVisible = true;
			});
			if (repEmpty) repEmpty.hidden = anyVisible;
		});
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
			<button data-q="auto" class="is-active">${copy.auto}</button>
			<button data-q="720">720p</button>
			<button data-q="1080" class="hd">1080p</button>
			<button data-q="2160" class="hd" hidden>4K</button>
		`;
		lightbox.appendChild(lightboxPicker);

		lightboxPrev = document.createElement('button');
		lightboxPrev.className = 'lightbox__nav lightbox__nav--prev';
		lightboxPrev.type = 'button';
		lightboxPrev.setAttribute('aria-label', copy.previousVideo);
		lightboxPrev.innerHTML = '<span aria-hidden="true">‹</span>';
		lightbox.appendChild(lightboxPrev);

		lightboxNext = document.createElement('button');
		lightboxNext.className = 'lightbox__nav lightbox__nav--next';
		lightboxNext.type = 'button';
		lightboxNext.setAttribute('aria-label', copy.nextVideo);
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

		const advanceBeforeEnd = () => {
			if (!currentVideoKey || !lightbox.classList.contains('is-open') || lightboxVideoEl.style.display === 'none') return;
			if (document.hidden || document.querySelector('.video-share-dialog[open]') || lightboxVideoEl.seeking) return;
			if (lightboxVideoEl.paused && !lightboxVideoEl.ended) return;
			const duration = lightboxVideoEl.duration;
			if (!Number.isFinite(duration) || duration <= 0) return;
			if (duration - lightboxVideoEl.currentTime <= Math.min(3, duration / 2)) openAdjacentVideo(1);
		};
		lightboxVideoEl.addEventListener('timeupdate', advanceBeforeEnd);
		lightboxVideoEl.addEventListener('ended', advanceBeforeEnd);

		lightboxPicker.addEventListener('click', (e) => {
			const btn = e.target.closest('button');
			if (!btn) return;
			const q = btn.dataset.q;
			lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
			if (q === 'auto') {
				currentQuality = known720OnlyVideoKeys.has(currentVideoKey) || networkSuggestsLow() ? '720' : '1080';
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
				showToast(copy.slow720);
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
				showToast(copy.fallback1080);
				swapQuality();
			} else if (currentQuality === '1080') {
				currentQuality = '720';
				showToast(copy.fallback720);
				swapQuality();
			} else {
				lightbox?.classList.remove('is-video-loading');
				showToast(copy.uploading);
			}
		});
	}

	const videoAssetVersions = {
		'live-icon': '20261002cut6',
		'promo-egoistka': '20260826trim3',
		'thematic-retro-heart': '20260826trim2'
	};

	function videoUrl(key, quality) {
		const base = (window.VIDEO_BASE || "https://luxuryband.ru/").replace(/\/?$/, "/");
		const shared = window.LCBPromoVideoSources?.[key];
		if (shared) {
			if (quality === '720' && !shared.has720) quality = '1080';
			return `${base}assets/video/mp4/${shared.family}-${quality}.mp4`;
		}
		const version = videoAssetVersions[key];
		return `${base}assets/video/mp4/${key}-${quality}.mp4${version ? `?v=${version}` : ''}`;
	}

	const known720OnlyVideoKeys = new Set([
		'sax-welcome',
		'yuriy-acoustic-vocal',
		'yuriy-live-stage',
		'yuriy-instrumental'
	]);

	function setPickerQuality(quality) {
		if (!lightboxPicker) return;
		if (quality === '720' && window.LCBPromoVideoSources?.[currentVideoKey]?.has720 === false) quality = '1080';
		lightboxPicker.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.q === quality));
	}

	function videoQualityExists(key, quality) {
		if (!window.LCBVideoQuality.supports(videoUrl(key, quality))) return Promise.resolve(false);
		const shared = window.LCBPromoVideoSources?.[key];
		if (shared) return Promise.resolve(quality === '2160' ? shared.quality === 2160 : quality !== '720' || shared.has720);
		return window.LCBVideoQuality.exists(videoUrl(key, quality));
	}

	function updatePickerAvailability(key) {
		const shared = window.LCBPromoVideoSources?.[key];
		const btn720 = lightboxPicker?.querySelector('[data-q="720"]');
		const btn1080 = lightboxPicker?.querySelector('[data-q="1080"]');
		const btn4k = lightboxPicker?.querySelector('[data-q="2160"]');
		if (!btn1080 || !btn4k) return;
		if (btn720) btn720.hidden = shared?.has720 === false;
		btn1080.textContent = '1080p';
		btn1080.hidden = known720OnlyVideoKeys.has(key);
		btn4k.hidden = true;
		if (btn1080.hidden && currentQuality === '1080') {
			currentQuality = '720';
			setPickerQuality(currentQuality);
			swapQuality();
		}
		if (known720OnlyVideoKeys.has(key)) return;
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
		const nodes = [...scope.querySelectorAll('.vtile__link[data-video], .video-card[data-video], [data-video].page-hero__play, #examples .format__link[data-video]')];
		const seen = new Set();
		return nodes.reduce((items, node) => {
			const key = node.dataset.video;
			if (!key || seen.has(key)) return items;
			seen.add(key);
			const title = node.querySelector('.vtile__title, .video-card__name, .format__title')?.textContent?.trim() || node.getAttribute('aria-label') || copy.video;
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
		currentVideoTitle = title || copy.video;
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
		const a = e.target.closest('.vtile__link[data-video], .video-card[data-video], [data-video].page-hero__play, .about-hero [data-video], #examples .format__link[data-video]');
			if (!a) return;
			e.preventDefault();
			e.stopPropagation();
			a.blur();
			const title = a.querySelector('.vtile__title, .video-card__name, .format__title')?.textContent?.trim() || a.getAttribute('aria-label') || copy.video;
			const poster = a.querySelector('img')?.src || a.closest('.page-hero')?.querySelector('.page-hero__media img')?.src || '';
			currentVideoRail = a.closest('.video-rail, [data-video-carousel], .program-video-carousel, .formats--examples') || null;
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
		const heroPrev = hero.querySelector('[data-hero-prev]');
		const heroNext = hero.querySelector('[data-hero-next]');
		const desktopHeroRecommendations = window.matchMedia('(min-width: 735px)');
		const mobileHeroSwipe = window.matchMedia('(max-width: 734px)');
		const reducedHeroMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const coarseHeroPointer = window.matchMedia('(pointer: coarse)');
		const heroLang = (document.documentElement.lang || 'ru').toLowerCase();
		const heroCopy = copy;
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
		// Each photograph opens the short edit beginning in that costume.
		const heroVideoMap = {
			red:   'promo-costume-red',
			bw:    'promo-costume-bw',
			gold:  'promo-costume-gold',
			white: 'promo-costume-white'
		};
		const heroPromoPlaylist = [...document.querySelectorAll('.video-rail--big .vtile__link[data-video]')]
			.map(link => link.dataset.video)
			.filter((key, index, list) => key && list.indexOf(key) === index);
		const heroClips = {
			'promo-costume-red': {
				title: copy.egoistka, costume: 'red', costumeLabel: heroCopy.costumes.red,
				poster: 'promo-egoistka-2026-red-stage.jpg?v=20260620i'
			},
			'promo-costume-bw': {
				title: 'Loca Loca', costume: 'bw', costumeLabel: heroCopy.costumes.bw,
				poster: 'promo-loca-loca.jpg?v=20260620i'
			},
			'promo-costume-gold': {
				title: "You're My Heart, You're My Soul", costume: 'gold', costumeLabel: heroCopy.costumes.gold,
				poster: 'thematic-retro-heart-2026.jpg?v=20260620i'
			},
			'promo-costume-white': {
				title: copy.letet, costume: 'white', costumeLabel: heroCopy.costumes.white,
				poster: 'promo-letet.jpg?v=20260620i'
			},
			'promo-egoistka': {
				title: copy.egoistka, costume: 'red', costumeLabel: heroCopy.costumes.red,
				poster: 'promo-egoistka-2026-red-stage.jpg?v=20260620i'
			},
			'promo-lets-get-it-started': {
				title: "Let's Get It Started", costume: 'red', costumeLabel: heroCopy.costumes.red,
				poster: 'promo-lets-get-it-started.jpg?v=20260620i'
			},
			'thematic-retro-heart': {
				title: "You're My Heart", costume: 'gold', costumeLabel: heroCopy.costumes.gold,
				poster: 'thematic-retro-heart-2026.jpg?v=20260620i'
			},
			'promo-cold-heart': {
				title: 'Cold Heart', costume: 'gold', costumeLabel: heroCopy.costumes.gold,
				poster: 'promo-cold-heart.jpg?v=20260620i'
			},
			'promo-amore-no': {
				title: 'Amore No', costume: 'gold', costumeLabel: heroCopy.costumes.gold,
				poster: 'promo-amore-no.jpg?v=20260620i'
			},
			'promo-letet': {
				title: copy.letet, costume: 'white', costumeLabel: heroCopy.costumes.white,
				poster: 'promo-letet.jpg?v=20260620i'
			},
			'thematic-italian': {
				title: 'Cosa sei', costume: 'white', costumeLabel: heroCopy.costumes.white,
				poster: 'thematic-italian.jpg?v=20260620i'
			},
			'interact-wedding-shallow': {
				title: 'Shallow', costume: 'white', costumeLabel: heroCopy.costumes.white,
				poster: 'interact-wedding-shallow.jpg?v=20260620i'
			},
			'promo-loca-loca': {
				title: 'Loca Loca', costume: 'bw', costumeLabel: heroCopy.costumes.bw,
				poster: 'promo-loca-loca.jpg?v=20260620i'
			},
			'promo-danza-cuduro': {
				title: 'Danza Kuduro', costume: 'bw', costumeLabel: heroCopy.costumes.bw,
				poster: 'promo-danza-cuduro-2026.jpg?v=20260620i'
			}
		};
		const heroCostumeClips = {
			red: ['promo-lets-get-it-started', 'promo-egoistka'],
			gold: ['thematic-retro-heart', 'promo-cold-heart', 'promo-amore-no'],
			white: ['interact-wedding-shallow', 'thematic-italian', 'promo-letet'],
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
		let costumeRequest = 0;
		const imagePromises = new WeakMap();

		function loadHeroImage(key) {
			const image = hero.querySelector(`[data-hero-img="${key}"]`);
			if (image?.dataset.src && !image.getAttribute('src')) {
				image.closest('picture')?.querySelectorAll('source[data-srcset]').forEach(source => { source.srcset = source.dataset.srcset; });
				image.src = image.dataset.src;
			}
			return image;
		}

		function imageReady(image) {
			if (!image) return Promise.resolve(false);
			if (image.complete && image.naturalWidth) return Promise.resolve(true);
			if (!imagePromises.has(image)) imagePromises.set(image, new Promise(resolve => {
				image.addEventListener('load', () => resolve(true), { once: true });
				image.addEventListener('error', () => resolve(false), { once: true });
			}));
			return imagePromises.get(image);
		}

		function showCostume(key) {
			return setActive(key, true);
		}

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

		function setActive(key, revealCostume = false) {
			const request = ++costumeRequest;
			return imageReady(loadHeroImage(key)).then(loaded => {
				// Keep the last usable image (or montage) visible while the next loads.
				if (!loaded || request !== costumeRequest) return false;
				current = key;
				dots.forEach(d => {
					const on = d.dataset.heroDot === key;
					d.classList.toggle('is-active', on);
					d.setAttribute('aria-selected', on ? 'true' : 'false');
				});
				imgs.forEach(i => i.classList.toggle('is-active', i.dataset.heroImg === key));
				taglines.forEach(line => line.classList.toggle('is-active', line.dataset.tagline === key));
				if (revealCostume) backgroundController?.selectCostume();
				return true;
			});
		}

		function nextKey() {
			const idx = order.indexOf(current);
			return order[(idx + 1) % order.length];
		}

		function startAuto() {
			if (reducedHeroMotion.matches || hero.classList.contains('is-playing') || (backgroundController && !backgroundController.costumeView)) return;
			if (autoTimer) clearInterval(autoTimer);
			const delay = mobileHeroSwipe.matches ? 3000 : 5500;
			autoTimer = setInterval(() => setActive(nextKey()), delay);
		}

		function stopAuto() {
			if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
		}

		function scheduleAutoResume() {
			if (autoResumeTimer) clearTimeout(autoResumeTimer);
			if (reducedHeroMotion.matches) return;
			autoResumeTimer = setTimeout(startAuto, mobileHeroSwipe.matches ? 3000 : 7000);
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
					showToast(heroCopy.loadingMuted);
				}).catch(() => {
					setHeroLoading(false);
					showToast(heroCopy.playFailed);
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
				button.setAttribute('aria-label', `${heroCopy.watch} ${clip.title}. ${clip.costumeLabel}`);
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

		function playAdjacentHeroPromo(delta) {
			if (!hero.classList.contains('is-playing')) return;
			const playlist = heroPromoPlaylist.length ? heroPromoPlaylist : Object.keys(heroClips);
			if (!playlist.length) return;
			const key = currentHeroVideoKey || heroVideoMap[current] || playlist[0];
			watchedHeroClips.add(key);
			const currentIndex = playlist.indexOf(key);
			const nextIndex = currentIndex < 0
				? 0
				: (currentIndex + delta + playlist.length) % playlist.length;
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
			playHeroClip(heroVideoMap[current] || heroPromoPlaylist[0] || 'promo-main-reel');
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
				showCostume(d.dataset.heroDot);
				scheduleAutoResume();
			});
		});

		let swipeStartX = 0;
		let swipeStartY = 0;
		let swipeLastX = 0;
		let swipeLastAt = 0;
		let swipeVelocityX = 0;
		let swipePointerId = null;
		let swipeAxis = '';
		let swipeTargetKey = '';
		let swipeActiveImg = null;
		let swipeUnderImg = null;
		let swipeFrame = 0;
		let swipePendingX = 0;
		let lastHeroSwipeAt = 0;

		function adjacentHeroKey(direction) {
			const idx = order.indexOf(current);
			return direction < 0
				? order[(idx + 1) % order.length]
				: order[(idx - 1 + order.length) % order.length];
		}

		function clearSwipeFrame() {
			if (!swipeFrame) return;
			cancelAnimationFrame(swipeFrame);
			swipeFrame = 0;
		}

		function clearMobileSwipe() {
			clearSwipeFrame();
			[swipeActiveImg, swipeUnderImg].forEach(img => {
				if (!img) return;
				img.classList.remove('is-swipe-dragging', 'is-swipe-under', 'is-swipe-settling');
				img.style.removeProperty('transform');
				img.style.removeProperty('opacity');
			});
			swipeTargetKey = '';
			swipeActiveImg = null;
			swipeUnderImg = null;
			swipePendingX = 0;
		}

		function renderMobileSwipe() {
			swipeFrame = 0;
			const dx = swipePendingX;
			const direction = dx < 0 ? -1 : 1;
			const targetKey = adjacentHeroKey(direction);
			const activeImg = loadHeroImage(current);
			const underImg = loadHeroImage(targetKey);
			if (!activeImg || !underImg) return;
			swipeTargetKey = targetKey;
			if (!activeImg.complete || !activeImg.naturalWidth || !underImg.complete || !underImg.naturalWidth) {
				Promise.all([imageReady(activeImg), imageReady(underImg)]).then(loaded => {
					if (loaded.every(Boolean) && swipePointerId !== null && swipeTargetKey === targetKey) queueMobileSwipe(swipePendingX);
				});
				return;
			}
			if (backgroundController && !backgroundController.costumeView) backgroundController.selectCostume();

			if (swipeUnderImg && swipeUnderImg !== underImg) {
				swipeUnderImg.classList.remove('is-swipe-under');
				swipeUnderImg.style.removeProperty('transform');
				swipeUnderImg.style.removeProperty('opacity');
			}
			swipeTargetKey = targetKey;
			swipeActiveImg = activeImg;
			swipeUnderImg = underImg;
			activeImg.classList.add('is-swipe-dragging');
			underImg.classList.add('is-swipe-under');

			const width = Math.max(hero.clientWidth, 1);
			const progress = Math.min(Math.abs(dx) / width, 1);
			const rotation = (dx / width) * 9;
			activeImg.style.transform = `translate3d(${dx}px, ${Math.abs(dx) * 0.025}px, 0) rotate(${rotation}deg)`;
			activeImg.style.opacity = String(1 - progress * 0.18);
			underImg.style.transform = `scale(${0.94 + progress * 0.06})`;
			underImg.style.opacity = String(0.58 + progress * 0.42);
		}

		function queueMobileSwipe(dx) {
			swipePendingX = dx;
			if (!swipeFrame) swipeFrame = requestAnimationFrame(renderMobileSwipe);
		}

		function settleMobileSwipe(commit, dx) {
			if (swipeFrame) {
				cancelAnimationFrame(swipeFrame);
				swipeFrame = 0;
				renderMobileSwipe();
			}
			if (!swipeActiveImg || !swipeUnderImg || !swipeTargetKey) {
				const targetKey = swipeTargetKey || adjacentHeroKey(dx < 0 ? -1 : 1);
				clearMobileSwipe();
				if (commit) showCostume(targetKey);
				scheduleAutoResume();
				return;
			}
			const activeImg = swipeActiveImg;
			const underImg = swipeUnderImg;
			const targetKey = swipeTargetKey;
			activeImg.classList.remove('is-swipe-dragging');
			activeImg.classList.add('is-swipe-settling');
			underImg.classList.add('is-swipe-settling');

			requestAnimationFrame(() => {
				if (commit) {
					const direction = dx < 0 ? -1 : 1;
					activeImg.style.transform = `translate3d(${direction * hero.clientWidth * 1.18}px, 42px, 0) rotate(${direction * 13}deg)`;
					activeImg.style.opacity = '0';
					underImg.style.transform = 'scale(1)';
					underImg.style.opacity = '1';
				} else {
					activeImg.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
					activeImg.style.opacity = '1';
					underImg.style.transform = 'scale(0.94)';
					underImg.style.opacity = '0';
				}
			});

			setTimeout(() => {
				showCostume(commit ? targetKey : current);
				clearMobileSwipe();
				scheduleAutoResume();
			}, reducedHeroMotion.matches ? 0 : 320);
		}

		hero.addEventListener('pointerdown', (e) => {
			if (hero.classList.contains('is-playing')) return;
			if (e.target.closest('a, button, input, select, textarea')) return;
			swipeStartX = e.clientX;
			swipeStartY = e.clientY;
			swipeLastX = e.clientX;
			swipeLastAt = performance.now();
			swipeVelocityX = 0;
			swipePointerId = e.pointerId;
			swipeAxis = '';
			stopAuto();
			if (autoResumeTimer) {
				clearTimeout(autoResumeTimer);
				autoResumeTimer = null;
			}
			if (mobileHeroSwipe.matches) {
				try { hero.setPointerCapture(e.pointerId); } catch (_) {}
			}
		});
		hero.addEventListener('pointermove', (e) => {
			if (!mobileHeroSwipe.matches || hero.classList.contains('is-playing') || e.pointerId !== swipePointerId) return;
			const dx = e.clientX - swipeStartX;
			const dy = e.clientY - swipeStartY;
			if (!swipeAxis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
				swipeAxis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
			}
			if (swipeAxis !== 'x') return;
			e.preventDefault();
			lastHeroSwipeAt = performance.now();
			const now = performance.now();
			swipeVelocityX = (e.clientX - swipeLastX) / Math.max(now - swipeLastAt, 1);
			swipeLastX = e.clientX;
			swipeLastAt = now;
			queueMobileSwipe(dx);
		});
		hero.addEventListener('pointerup', (e) => {
			if (hero.classList.contains('is-playing') || e.pointerId !== swipePointerId) return;
			const dx = e.clientX - swipeStartX;
			const dy = e.clientY - swipeStartY;
			const velocity = performance.now() - swipeLastAt <= 120 ? swipeVelocityX : 0;
			swipePointerId = null;
			if (mobileHeroSwipe.matches) {
				const horizontal = swipeAxis === 'x' && Math.abs(dx) > Math.abs(dy) * 1.1;
				const distanceCommit = Math.abs(dx) >= Math.min(hero.clientWidth * 0.18, 86);
				const velocityCommit = Math.abs(dx) >= 24 && Math.abs(velocity) >= 0.5;
				settleMobileSwipe(horizontal && (distanceCommit || velocityCommit), dx);
				return;
			}
			if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25) {
				scheduleAutoResume();
				return;
			}
			e.preventDefault();
			lastHeroSwipeAt = performance.now();
			const next = adjacentHeroKey(dx < 0 ? -1 : 1);
			showCostume(next);
			scheduleAutoResume();
		});
		hero.addEventListener('pointercancel', () => {
			if (mobileHeroSwipe.matches && swipeAxis === 'x') settleMobileSwipe(false, swipePendingX);
			else scheduleAutoResume();
			swipeStartX = 0;
			swipeStartY = 0;
			swipePointerId = null;
			swipeAxis = '';
		});
		hero.addEventListener('click', (e) => {
			if (!lastHeroSwipeAt || performance.now() - lastHeroSwipeAt > 500) return;
			e.preventDefault();
			e.stopPropagation();
		}, true);
		heroStage?.addEventListener('dragstart', (e) => e.preventDefault());
		hero.addEventListener('background-modechange', event => {
			if (event.detail.costumeView) return;
			costumeRequest += 1;
			stopAuto();
			clearMobileSwipe();
		});

		heroPlay?.addEventListener('click', playHeroVideo);
		heroClose?.addEventListener('click', stopHeroVideo);
		heroPrev?.addEventListener('click', () => playAdjacentHeroPromo(-1));
		heroNext?.addEventListener('click', () => playAdjacentHeroPromo(1));
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
		const syncHeroAutoplayRate = () => {
			if (autoTimer) startAuto();
		};
		if (mobileHeroSwipe.addEventListener) mobileHeroSwipe.addEventListener('change', syncHeroAutoplayRate);
		else mobileHeroSwipe.addListener(syncHeroAutoplayRate);
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
				showToast(heroCopy.qualityFallback1080);
				changeQuality('1080');
			} else if (heroQuality === '1080') {
				showToast(heroCopy.qualityFallback720);
				changeQuality('720');
			} else {
				setHeroLoading(false);
				showToast(heroCopy.videoUnavailable);
			}
		});
		heroVideo?.addEventListener('play',  () => {
			heroToggle?.classList.remove('is-paused');
			heroToggle?.setAttribute('aria-label', heroCopy.pause);
		});
		heroVideo?.addEventListener('pause', () => {
			heroToggle?.classList.add('is-paused');
			heroToggle?.setAttribute('aria-label', heroCopy.resume);
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
			if (e.key === 'ArrowLeft' && hero.classList.contains('is-playing')) playAdjacentHeroPromo(-1);
			if (e.key === 'ArrowRight' && hero.classList.contains('is-playing')) playAdjacentHeroPromo(1);
		});

		if (!reducedHeroMotion.matches) {
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
	document.querySelectorAll('.video-rail__track, .reviews-rail__track').forEach(track => {
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

	// ---------- Reviews: an endless strip that moves by itself (Mikhail 30.10) ----------
	// The same infinite loop as the video rails (clones on both sides); on top of it
	// the strip drifts left on its own. Hover, focus, touch, a drag and the pause
	// button stop it; it moves on a few seconds after the hand leaves. Under reduced
	// motion it stands still and is scrolled by hand.
	(() => {
		const rail = document.querySelector('[data-reviews-rail]');
		const track = rail?.querySelector('.reviews-rail__track');
		const toggle = rail?.querySelector('[data-reviews-toggle]');
		if (!track || !toggle) return;
		initInfiniteRail(track);
		if (!('IntersectionObserver' in window)) return;
		const speed = 32;
		let visible = false;
		let held = false;
		let userPaused = false;
		let resume = 0;
		let frame = 0;
		let last = 0;
		let carry = 0;
		const moving = () => visible && !held && !userPaused && !reduceMotion.matches && !document.hidden;
		const step = now => {
			frame = 0;
			if (!moving()) { last = 0; return; }
			if (last) {
				// Sub-pixel steps that the browser rounds away are carried to the next frame;
				// a jump of the infinite loop in between resets the carry.
				const target = track.scrollLeft + speed * Math.min(now - last, 64) / 1000 + carry;
				track.scrollLeft = target;
				const left = target - track.scrollLeft;
				carry = Math.abs(left) < 4 ? left : 0;
			}
			last = now;
			frame = requestAnimationFrame(step);
		};
		const run = () => { if (!frame && moving()) frame = requestAnimationFrame(step); };
		const render = () => {
			const label = userPaused ? toggle.dataset.labelResume : toggle.dataset.labelPause;
			toggle.setAttribute('aria-label', label);
			toggle.classList.toggle('is-paused', userPaused);
			toggle.hidden = reduceMotion.matches;
		};
		const hold = () => { held = true; window.clearTimeout(resume); };
		const release = delay => {
			window.clearTimeout(resume);
			resume = window.setTimeout(() => { held = false; run(); }, delay);
		};
		track.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hold(); });
		track.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') release(800); });
		track.addEventListener('pointerdown', hold);
		track.addEventListener('touchstart', hold, { passive: true });
		track.addEventListener('touchend', () => release(3000), { passive: true });
		track.addEventListener('wheel', () => { hold(); release(2500); }, { passive: true });
		rail.addEventListener('focusin', hold);
		rail.addEventListener('focusout', () => release(800));
		toggle.addEventListener('click', () => { userPaused = !userPaused; render(); run(); });
		new IntersectionObserver(entries => { visible = entries[0].isIntersecting; run(); }, { threshold: 0.2 }).observe(rail);
		document.addEventListener('visibilitychange', run);
		reduceMotion.addEventListener('change', () => { render(); run(); });
		render();
	})();

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
