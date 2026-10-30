(() => {
	'use strict';
	const icons = [...document.querySelectorAll('[data-stat-icon]')]
		.filter(icon => !icon.hasAttribute('data-stat-icon-wired'));
	if (!icons.length || !('IntersectionObserver' in window)) return;
	const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
	const controllers = new Map();
	const properties = ['--stat-left', '--stat-center', '--stat-right', '--stat-yaw', '--stat-pitch'];
	const allowed = () => pointer.matches && !reduced.matches && !document.hidden;
	const clamp = value => Math.max(-1, Math.min(1, value));
	const observer = new IntersectionObserver(entries => {
		for (const entry of entries) {
			const controller = controllers.get(entry.target);
			controller.visible = entry.isIntersecting;
			if (controller.visible && allowed()) controller.prepare();
			else controller.reset();
		}
	}, { threshold: 0 });

	for (const icon of icons) {
		const card = icon.closest('.about-count__mini');
		if (!card) continue;
		icon.setAttribute('data-stat-icon-wired', '');
		let frame = 0;
		let pose = 0;
		let hovering = false;
		let clientX = 0;
		let clientY = 0;
		let decoded = false;
		let preparing = false;
		const controller = {
			visible: false,
			prepare() {
				if (preparing) return;
				preparing = true;
				// Decode only when visible: calling decode during initialization
				// would work against the images' lazy loading.
				Promise.all([...icon.querySelectorAll('img')].map(image => image.decode()))
					.then(() => {
						decoded = true;
						if (hovering && allowed() && !frame) frame = requestAnimationFrame(render);
					})
					.catch(() => { controller.reset(); });
			},
			reset() {
				hovering = false;
				pose = 0;
				if (frame) cancelAnimationFrame(frame);
				frame = 0;
				icon.classList.remove('is-tracking');
				for (const property of properties) icon.style.removeProperty(property);
			}
		};
		controllers.set(icon, controller);
		observer.observe(icon);

		// The centre stays visible while loading, on touch screens, and without JS.
		const render = () => {
			frame = 0;
			if (!hovering || !decoded || !controller.visible || !allowed()) return;
			const bounds = card.getBoundingClientRect();
			if (!bounds.width || !bounds.height) return;
			const x = clamp((clientX - bounds.left) / bounds.width * 2 - 1);
			const y = clamp((clientY - bounds.top) / bounds.height * 2 - 1);
			// Each resting pose is fully opaque. A small hysteresis band prevents
			// boundary jitter; only an actual pose change triggers the crossfade.
			let nextPose = pose;
			if (x > .38) nextPose = 1;
			else if (x < -.38) nextPose = -1;
			else if ((pose === 1 && x < .25) || (pose === -1 && x > -.25)) nextPose = 0;
			if (nextPose !== pose) {
				pose = nextPose;
				icon.style.setProperty('--stat-left', pose === -1 ? '1' : '0');
				icon.style.setProperty('--stat-center', pose === 0 ? '1' : '0');
				icon.style.setProperty('--stat-right', pose === 1 ? '1' : '0');
			}
			icon.style.setProperty('--stat-yaw', `${x * 5}deg`);
			icon.style.setProperty('--stat-pitch', `${-y * 4}deg`);
			icon.classList.add('is-tracking');
		};
		const move = event => {
			if (event.pointerType !== 'mouse' || !allowed() || !controller.visible) return;
			controller.prepare();
			hovering = true;
			clientX = event.clientX;
			clientY = event.clientY;
			if (!frame) frame = requestAnimationFrame(render);
		};
		card.addEventListener('pointerenter', move, { passive: true });
		card.addEventListener('pointermove', move, { passive: true });
		card.addEventListener('pointerleave', controller.reset, { passive: true });
		card.addEventListener('pointercancel', controller.reset, { passive: true });
	}
	const reset = () => controllers.forEach(controller => controller.reset());
	pointer.addEventListener('change', reset);
	reduced.addEventListener('change', reset);
	document.addEventListener('visibilitychange', reset);
	window.addEventListener('pagehide', reset);
})();
