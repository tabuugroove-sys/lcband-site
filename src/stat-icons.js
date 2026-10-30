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
	const resetState = state => {
		state.yaw = state.pitch = 0;
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
			if (active) queue();
		}).catch(() => { resetState(state); })
			.finally(() => { state.preparing = false; });
	};
	const render = now => {
		frame = 0;
		if (!allowed()) return;
		const blend = 1 - Math.exp(-Math.min(now - lastTime, 64) / 100);
		lastTime = now;
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
				const strength = near * near * (3 - 2 * near);
				// Soft direction near the centre prevents a flip as the pointer crosses it.
				const scale = maxAngle * strength / Math.max(distance, halfSize);
				yaw = dx * scale;
				pitch = -dy * scale;
			}
			state.yaw += (yaw - state.yaw) * blend;
			state.pitch += (pitch - state.pitch) * blend;
			const settled = Math.hypot(yaw - state.yaw, pitch - state.pitch) < .02;
			if (settled) { state.yaw = yaw; state.pitch = pitch; }
			else moving = true;
			state.icon.style.setProperty('--stat-yaw', state.yaw.toFixed(3) + 'deg');
			state.icon.style.setProperty('--stat-pitch', state.pitch.toFixed(3) + 'deg');
			state.icon.classList.toggle('is-tracking', Math.hypot(state.yaw, state.pitch) > .02);
		}
		// One shared loop, stopped as soon as the icons reach their positions.
		if (moving) frame = requestAnimationFrame(render);
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
	window.addEventListener('scroll', invalidate, { passive: true });
	window.addEventListener('resize', invalidate, { passive: true });
	const reset = () => {
		active = false;
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
