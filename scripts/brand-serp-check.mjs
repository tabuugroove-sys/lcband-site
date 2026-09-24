import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';
import { chromium } from 'playwright';

// The owner's measurement scope is a fresh GitHub-hosted runner, never a local profile/IP.
if (process.env.GITHUB_ACTIONS !== 'true'
	|| process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
	|| process.env.RUNNER_ENVIRONMENT !== 'github-hosted'
	|| process.env.RUNNER_OS !== 'Linux') {
	throw new Error('Run this capture only through the manual GitHub-hosted Linux workflow.');
}

const outputDir = resolve('output/playwright/brand-serp');
const queries = ['Luxury Band', 'Luxury Band Москва', 'Luxury Cover Band'];
const engines = [
	{
		name: 'google',
		url: (query) => `https://www.google.com/search?${new URLSearchParams({ q: query, gl: 'ru', hl: 'ru', pws: '0' })}`,
	},
	{
		name: 'yandex',
		url: (query) => `https://yandex.ru/search/?${new URLSearchParams({ text: query, lr: '213' })}`,
	},
];
const now = () => new Date().toISOString();
const report = {
	startedAtUtc: now(),
	finishedAtUtc: null,
	status: 'RUNNING',
	run: {
		id: process.env.GITHUB_RUN_ID,
		attempt: process.env.GITHUB_RUN_ATTEMPT,
		commit: process.env.GITHUB_SHA,
		runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
		runnerOs: process.env.RUNNER_OS,
	},
	publicIp: { source: 'https://api.ipify.org?format=json', observedAtUtc: null, address: null },
	region: {
		google: { gl: 'ru', hl: 'ru', pws: '0' },
		yandex: { lr: '213' },
		limitation: 'Cloud IP and URL parameters do not guarantee Moscow-local results. No geolocation was measured or spoofed.',
	},
	method: {
		browser: 'Playwright Chromium, headless, default user agent',
		context: 'New non-persistent context for every query; no imported cookies, storage state, profile, or login. Website-set session cookies are discarded when that query closes.',
		viewport: { width: 1440, height: 1080 },
		requests: 'One navigation per query; no CAPTCHA interaction, proxy, stealth, result clicks, pagination, or retries.',
		rank: 'Not computed. Observed links can include ads, sitelinks, navigation, or other modules. A missing observed link is not proof of absence from search.',
	},
	results: [],
};

async function saveReport() {
	await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

function blockerFor(url, title, text, httpStatus, challengeFrame) {
	const parsed = new URL(url);
	if (/\/sorry(?:\/|$)|\/showcaptcha(?:[/?]|$)|\/captcha(?:[/?]|$)|\/checkcaptcha(?:[/?]|$)/i.test(parsed.pathname)) {
		return 'CAPTCHA or anti-bot challenge URL';
	}
	if (challengeFrame) return 'Visible CAPTCHA challenge frame';
	const patterns = [
		/our systems have detected unusual traffic/i,
		/unusual traffic from your computer network/i,
		/(?:подтвердите|докажите|убедиться)[\s\S]{0,100}(?:не робот|человек)/i,
		/(?:я|i(?:’|')?m|i am)\s+(?:не робот|not a robot)/i,
		/verify (?:that )?(?:you are|you're) (?:a )?human/i,
		/похоже,?[\s\S]{0,80}(?:запросы|робот)/i,
		/подозрительн[а-я]+\s+(?:запрос|активност)/i,
		/введите\s+(?:символы|код)\s+(?:с картинки|на картинке)/i,
		/доступ\s+(?:временно\s+)?ограничен/i,
	];
	if (patterns.some((pattern) => pattern.test(`${title}\n${text}`))) return 'Visible anti-bot or CAPTCHA message';
	if ([403, 429].includes(httpStatus)) return `Search access refused: HTTP ${httpStatus}`;
	return null;
}

function luxuryLinks(anchors) {
	const observed = [];
	for (const anchor of anchors) {
		const candidates = [{ url: anchor.href, evidence: 'anchor href' }];
		try {
			const href = new URL(anchor.href);
			for (const key of ['q', 'url', 'target', 'to']) {
				const value = href.searchParams.get(key);
				if (value && /^https?:\/\//i.test(value)) candidates.push({ url: value, evidence: `anchor href parameter ${key}` });
			}
		} catch { /* Ignore non-URL anchors. */ }
		for (const candidate of candidates) {
			try {
				const target = new URL(candidate.url);
				if (!['http:', 'https:'].includes(target.protocol)) continue;
				if (target.hostname !== 'luxuryband.ru' && !target.hostname.endsWith('.luxuryband.ru')) continue;
				observed.push({
					text: anchor.text,
					url: target.href,
					observedHref: anchor.href,
					evidence: candidate.evidence,
					documentOrder: anchor.documentOrder,
				});
				break;
			} catch { /* A query parameter need not be a valid destination URL. */ }
		}
	}
	return observed;
}

async function capture(browser, engine, query, number) {
	const prefix = `${engine.name}-${String(number + 1).padStart(2, '0')}`;
	const result = {
		engine: engine.name, query, startedAtUtc: now(), capturedAtUtc: null,
		requestedUrl: engine.url(query), finalUrl: null, title: null, httpStatus: null,
		status: 'ERROR', reason: null, organicRank: null, observedLuxuryBandLinks: [],
		searchResultsContainerObserved: false,
		visibleTextFile: null, screenshotFile: null, metadataFile: `${prefix}.json`, errors: [],
	};
	let context;
	let page;
	try {
		context = await browser.newContext({ viewport: report.method.viewport, acceptDownloads: false });
		result.initialCookieCount = (await context.cookies()).length;
		page = await context.newPage();
		page.setDefaultTimeout(10_000);
		try {
			const response = await page.goto(result.requestedUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 });
			result.httpStatus = response?.status() ?? null;
		} catch (error) {
			result.errors.push(`Navigation: ${error.message}`);
		}
		await page.waitForLoadState('load', { timeout: 5_000 }).catch(() => {});
		result.finalUrl = page.url();
		result.title = await page.title().catch(() => '');
		const snapshot = await page.evaluate((engineName) => {
			const visible = (element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
			};
			return {
				text: document.body?.innerText ?? '',
				anchors: [...document.querySelectorAll('a[href]')]
					.map((element, index) => ({ element, index }))
					.filter(({ element }) => visible(element))
					.map(({ element, index }) => ({ href: element.href, text: element.innerText.trim(), documentOrder: index + 1 })),
				challengeFrame: [...document.querySelectorAll('iframe')].some((frame) =>
					visible(frame) && /recaptcha|hcaptcha|smartcaptcha|captcha/i.test(frame.src)),
				searchResultsContainerObserved: [...document.querySelectorAll(engineName === 'google' ? '#search, #rso' : '#search-result, .serp-list')].some(visible),
			};
		}, engine.name);
		await writeFile(join(outputDir, `${prefix}.txt`), snapshot.text);
		result.visibleTextFile = `${prefix}.txt`;
		result.searchResultsContainerObserved = snapshot.searchResultsContainerObserved;
		result.observedLuxuryBandLinks = luxuryLinks(snapshot.anchors);
		const blocker = blockerFor(result.finalUrl, result.title, snapshot.text, result.httpStatus, snapshot.challengeFrame);
		if (blocker) {
			result.status = 'BLOCKED';
			result.reason = blocker;
		} else if (new URL(result.finalUrl).hostname === 'consent.google.com'
			|| /before you continue to google|прежде чем (?:перейти|продолжить)[\s\S]{0,60}google/i.test(`${result.title}\n${snapshot.text}`)) {
			result.status = 'CONSENT_REQUIRED';
			result.reason = 'Consent interstitial; no choices submitted.';
		} else if (result.errors.length || !snapshot.text.trim() || result.httpStatus >= 400) {
			result.status = 'ERROR';
			result.reason = 'Navigation incomplete, HTTP error, or no visible page text; no search-position conclusion.';
		} else if (!result.searchResultsContainerObserved) {
			result.status = 'UNCONFIRMED';
			result.reason = 'No recognised search-results container was observed. The page may be incomplete or its markup may have changed; no search-position conclusion.';
		} else {
			result.status = 'CAPTURED';
			result.reason = 'Page observed; manual screenshot review is required to classify results and rank.';
		}
	} catch (error) {
		result.errors.push(`Capture: ${error.message}`);
		result.reason ??= 'Could not capture the page; no search-position conclusion.';
	} finally {
		if (page) {
			result.finalUrl = page.url();
			try {
				await page.screenshot({ path: join(outputDir, `${prefix}.png`), fullPage: true, timeout: 15_000 });
				result.screenshotFile = `${prefix}.png`;
			} catch (error) {
				result.errors.push(`Screenshot: ${error.message}`);
				if (result.status === 'CAPTURED') {
					result.status = 'ERROR';
					result.reason = 'Screenshot capture failed; evidence is incomplete.';
				}
			}
		}
		result.capturedAtUtc = now();
		await context?.close().catch((error) => result.errors.push(`Context close: ${error.message}`));
		await writeFile(join(outputDir, result.metadataFile), `${JSON.stringify(result, null, 2)}\n`);
	}
	return result;
}

const markdownText = (value) => String(value ?? '').replace(/([\\`*_{}[\]()#+.!|<>])/g, '\\$1').replace(/\r?\n/g, ' ');
function markdownReport() {
	const lines = [
		'# Brand search observations', '',
		`UTC: ${report.startedAtUtc} → ${report.finishedAtUtc}`, '',
		`Observed public IP: ${report.publicIp.address ?? 'UNAVAILABLE'} (api.ipify.org).`, '',
		'Google parameters: gl=ru, hl=ru, pws=0. Yandex parameter: lr=213.',
		'Cloud IP and these parameters do not guarantee Moscow-local results.', '',
		report.method.context, '',
		'**No organic rank is computed.** Link counts are observations, not positions; zero links is not proof of absence from search.', '',
		'A successful workflow only means evidence collection completed; it does not validate search positions.', '',
		'No CAPTCHA is solved or retried. A blocked engine is stopped for the rest of this run.', '',
		'| Engine | Query | Status | Observed LuxuryBand links | Files |',
		'| --- | --- | --- | ---: | --- |',
	];
	for (const result of report.results) {
		const files = result.metadataFile ? `[JSON](${result.metadataFile})${result.visibleTextFile ? ` · [text](${result.visibleTextFile})` : ''}${result.screenshotFile ? ` · [screenshot](${result.screenshotFile})` : ''}` : 'Not requested';
		lines.push(`| ${result.engine} | ${markdownText(result.query)} | ${result.status} | ${result.observedLuxuryBandLinks?.length ?? '—'} | ${files} |`);
	}
	for (const result of report.results.filter((item) => item.metadataFile)) {
		lines.push('', `## ${result.engine}: ${markdownText(result.query)}`, '',
			`Status: ${result.status}. ${markdownText(result.reason)}`, '',
			`Final URL: ${markdownText(result.finalUrl)}`, '', `Title: ${markdownText(result.title)}`);
		for (const link of result.observedLuxuryBandLinks) lines.push('', `- ${markdownText(link.text || '(unlabelled link)')} — ${markdownText(link.url)}`);
		for (const error of result.errors) lines.push('', `Capture error: ${markdownText(error)}`);
	}
	if (report.publicIp.error) lines.push('', `IP observation error: ${markdownText(report.publicIp.error)}`);
	if (report.error) lines.push('', `Run error: ${markdownText(report.error)}`);
	return `${lines.join('\n')}\n`;
}

await mkdir(outputDir, { recursive: true });
await saveReport();
let browser;
try {
	try {
		const response = await fetch(report.publicIp.source, { signal: AbortSignal.timeout(10_000) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const { ip } = await response.json();
		if (!isIP(ip)) throw new Error('ipify did not return a valid IP address');
		report.publicIp.address = ip;
		report.publicIp.observedAtUtc = now();
	} catch (error) {
		report.publicIp.error = error.message;
	}
	await saveReport();
	browser = await chromium.launch({ headless: true });
	report.browserVersion = browser.version();
	const deadline = Date.now() + 220_000;
	for (const engine of engines) {
		let stoppedReason = null;
		for (const [index, query] of queries.entries()) {
			if (stoppedReason || Date.now() > deadline) {
				report.results.push({ engine: engine.name, query, status: stoppedReason ? 'SKIPPED_ENGINE_STOPPED' : 'SKIPPED_TIME_LIMIT', reason: stoppedReason ?? 'Capture time budget reached', organicRank: null });
			} else {
				const result = await capture(browser, engine, query, index);
				report.results.push(result);
				if (['BLOCKED', 'CONSENT_REQUIRED', 'ERROR', 'UNCONFIRMED'].includes(result.status)) stoppedReason = `${result.status}: ${result.reason}`;
				console.log(`${engine.name} | ${query} | ${result.status} | observed links: ${result.observedLuxuryBandLinks.length}`);
			}
			await saveReport();
		}
	}
	report.status = report.results.some(({ status }) => status === 'ERROR') ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
} catch (error) {
	report.status = 'ERROR';
	report.error = error.message;
	process.exitCode = 1;
} finally {
	await browser?.close().catch(() => {});
	report.finishedAtUtc = now();
	await saveReport();
	const summary = markdownReport();
	await writeFile(join(outputDir, 'report.md'), summary);
	if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
