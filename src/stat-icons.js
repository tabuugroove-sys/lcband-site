(() => {
	'use strict';
	const icons = [...document.querySelectorAll('[data-stat-icon]')]
		.filter(icon => !icon.hasAttribute('data-stat-icon-wired'));
	if (!icons.length || !('IntersectionObserver' in window)) return;
	const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
	const states = new Map();
	const maxAngle = 25;
	const reach = 260;
	// Mikhail 30.10: «они всё время должны быть анимированы, когда мышкой проводишь, и когда
	// вверх и вниз сайт». Far from the pointer an icon still turns towards it, gently (floor);
	// scrolling rocks them by its speed (kick, degrees) and they settle back.
	const floor = .35;
	// «Чтобы реально что-то новое было видно, как будто двигаешь камеру» (30.10): nine real
	// views per icon, loaded on computers once the icon is on screen; the yaw picks the view
	// (two neighbours cross-fade), and the flat tilt stays only as a touch on top of it.
	// The flat ones (TV, records) keep the plain tilt: the views tear on a thin frame.
	const withViews = new Set(['years', 'languages', 'looks', 'lineup']);
	const views = 9;
	const flatShare = .2;
	const maxKick = 14;
	let kick = 0;
	let lastScrollY = window.scrollY;
	let lastScrollTime = performance.now();
	const allowed = () => pointer.matches && !reduced.matches && !document.hidden;
	let active = false;
	let clientX = 0;
	let clientY = 0;
	let frame = 0;
	let lastTime = 0;

	const queue = () => {
		if (frame || !allowed() || ![...states.values()].some(state => state.visible && state.decoded)) return;
		lastTime = performance.now();
		frame = requestAnimationFrame(render);
	};
	const paintViews = state => {
		if (!state.layers) return;
		const position = (Math.max(-1, Math.min(1, state.yaw / maxAngle)) + 1) / 2 * (views - 1);
		const lower = Math.min(views - 2, Math.floor(position));
		const [first, second] = state.layers;
		first.style.backgroundPositionX = lower / (views - 1) * 100 + '%';
		second.style.backgroundPositionX = (lower + 1) / (views - 1) * 100 + '%';
		second.style.opacity = (position - lower).toFixed(3);
	};
	const loadViews = state => {
		if (state.viewsRequested || !withViews.has(state.icon.dataset.statIcon)) return;
		state.viewsRequested = true;
		const url = state.icon.querySelector('.stat-icon__frame--center img').currentSrc.replace(/-(\d+)\.webp/, '-views-$1.webp');
		const sprite = new Image();
		sprite.src = url;
		sprite.decode().then(() => {
			const stage = state.icon.querySelector('.stat-icon__stage');
			state.layers = [0, 1].map(() => {
				const layer = document.createElement('span');
				layer.className = 'stat-icon__views';
				layer.style.backgroundImage = `url("${url}")`;
				stage.append(layer);
				return layer;
			});
			paintViews(state);
			state.icon.classList.add('has-views');
		}).catch(() => {});
	};
	const resetState = state => {
		state.yaw = state.pitch = 0;
		paintViews(state);
		state.bounds = null;
		state.icon.classList.remove('is-tracking');
		state.icon.style.removeProperty('--stat-yaw');
		state.icon.style.removeProperty('--stat-pitch');
	};
	const prepare = state => {
		if (state.preparing || state.decoded) return;
		state.preparing = true;
		// Keep native lazy loading; decode only the visible central view.
		const image = state.icon.querySelector('.stat-icon__frame--center img');
		if (!image) { state.preparing = false; return; }
		image.decode().then(() => {
			state.decoded = true;
			loadViews(state);
			if (active) queue();
		}).catch(() => { resetState(state); })
			.finally(() => { state.preparing = false; });
	};
	const render = now => {
		frame = 0;
		if (!allowed()) return;
		const step = Math.min(now - lastTime, 64);
		const blend = 1 - Math.exp(-step / 100);
		lastTime = now;
		kick *= Math.exp(-step / 220);
		if (Math.abs(kick) < .05) kick = 0;
		let moving = false;
		// Read geometry before writing transforms; the icon's own box is stable.
		const visible = [...states.values()].filter(state => state.visible && state.decoded);
		for (const state of visible) state.bounds ||= state.icon.getBoundingClientRect();
		for (const state of visible) {
			const bounds = state.bounds;
			let yaw = 0;
			let pitch = 0;
			if (active && bounds.width && bounds.height) {
				const dx = clientX - bounds.left - bounds.width / 2;
				const dy = clientY - bounds.top - bounds.height / 2;
				const distance = Math.hypot(dx, dy);
				const halfSize = Math.max(bounds.width, bounds.height) / 2;
				const near = Math.max(0, 1 - Math.max(0, distance - halfSize) / reach);
				const strength = floor + (1 - floor) * near * near * (3 - 2 * near);
				// Soft direction near the centre prevents a flip as the pointer crosses it.
				const scale = maxAngle * strength / Math.max(distance, halfSize);
				yaw = dx * scale;
				pitch = -dy * scale;
			}
			pitch += kick;
			state.yaw += (yaw - state.yaw) * blend;
			state.pitch += (pitch - state.pitch) * blend;
			const settled = Math.hypot(yaw - state.yaw, pitch - state.pitch) < .02;
			if (settled) { state.yaw = yaw; state.pitch = pitch; }
			else moving = true;
			paintViews(state);
			state.icon.style.setProperty('--stat-yaw', (state.layers ? state.yaw * flatShare : state.yaw).toFixed(3) + 'deg');
			state.icon.style.setProperty('--stat-pitch', state.pitch.toFixed(3) + 'deg');
			state.icon.classList.toggle('is-tracking', Math.hypot(state.yaw, state.pitch) > .02);
		}
		// One shared loop, stopped as soon as the icons reach their positions.
		if (moving || kick) frame = requestAnimationFrame(render);
	};
	const observer = new IntersectionObserver(entries => {
		for (const entry of entries) {
			const state = states.get(entry.target);
			state.visible = entry.isIntersecting;
			if (state.visible && allowed()) prepare(state);
			else resetState(state);
		}
		if (active) queue();
	}, { threshold: 0 });
	for (const icon of icons) {
		icon.setAttribute('data-stat-icon-wired', '');
		states.set(icon, { icon, visible: false, decoded: false, preparing: false, bounds: null, yaw: 0, pitch: 0 });
		observer.observe(icon);
	}
	window.addEventListener('pointermove', event => {
		if (event.pointerType !== 'mouse' || !allowed()) return;
		active = true;
		clientX = event.clientX;
		clientY = event.clientY;
		for (const state of states.values()) if (state.visible) prepare(state);
		queue();
	}, { passive: true });
	const leave = () => { active = false; queue(); };
	window.addEventListener('pointerout', event => { if (!event.relatedTarget) leave(); }, { passive: true });
	window.addEventListener('pointercancel', leave, { passive: true });
	const invalidate = () => {
		for (const state of states.values()) state.bounds = null;
		if (active) queue();
	};
	window.addEventListener('scroll', () => {
		const now = performance.now();
		const speed = (window.scrollY - lastScrollY) / Math.max(16, now - lastScrollTime);
		lastScrollY = window.scrollY;
		lastScrollTime = now;
		kick = Math.max(-maxKick, Math.min(maxKick, kick + speed * 6));
		invalidate();
		queue();
	}, { passive: true });
	window.addEventListener('resize', invalidate, { passive: true });
	const reset = () => {
		active = false;
		kick = 0;
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		states.forEach(resetState);
	};
	pointer.addEventListener('change', reset);
	reduced.addEventListener('change', reset);
	document.addEventListener('visibilitychange', reset);
	window.addEventListener('blur', reset);
	window.addEventListener('pagehide', reset);
})();
