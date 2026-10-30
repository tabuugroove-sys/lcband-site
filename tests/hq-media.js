import fs from 'node:fs';
import path from 'node:path';

// The HQ loops (home reels, /about/ background) live on the host and are listed in
// media/manifest.json, so the static _site has no copy. Tests serve the local working
// copies from src/assets/video/mp4, or the production files when those are missing.
export async function serveHqMedia(page) {
	await page.route(/\/assets\/video\/mp4\/(hq-20261029|lt2-20261030|ph-20261030)-[a-z0-9-]+\.mp4/, async route => {
		const name = new URL(route.request().url()).pathname.split('/').pop();
		const local = path.join(process.cwd(), 'src/assets/video/mp4', name);
		if (fs.existsSync(local)) return route.fulfill({ path: local, contentType: 'video/mp4' });
		return route.fulfill({ response: await route.fetch({ url: `https://luxuryband.ru/assets/video/mp4/${name}` }) });
	});
}
