import { readFileSync } from 'node:fs';

const readData = (filename) => JSON.parse(readFileSync(new URL(filename, import.meta.url), 'utf8'));
const languageLabels = {
	ru: 'Русский',
	en: 'English',
	ar: 'العربية',
	'pt-BR': 'Português',
};
const translations = {};

function addGroup(pages, defaultUrl) {
	const alternates = pages.map(({ lang, url }) => ({ lang, url, label: languageLabels[lang] }));
	alternates.push({ lang: 'x-default', url: defaultUrl });
	for (const { url } of pages) {
		if (translations[url]) throw new Error(`Duplicate translation group for ${url}`);
		translations[url] = alternates;
	}
}

function addPair(ruUrl, enUrl) {
	addGroup([{ lang: 'ru', url: ruUrl }, { lang: 'en', url: enUrl }], ruUrl);
}

// These four homepages contain their own localized content.
addGroup([
	{ lang: 'ru', url: '/' },
	{ lang: 'en', url: '/en/' },
	{ lang: 'ar', url: '/ae/' },
	{ lang: 'pt-BR', url: '/br/' },
], '/');

// Explicit equivalents from the static templates and post front matter.
const staticPairs = [
	['/about/', '/en/about/'],
	['/blog/', '/en/blog/'],
	['/costumes/', '/en/costumes/'],
	['/events/', '/en/events/'],
	['/formats/', '/en/formats/'],
	['/programs/', '/en/programs/'],
	['/repertoire/', '/en/repertoire/'],
	['/riders/', '/en/riders/'],
	['/sax/', '/en/sax/'],
	['/vocalists/', '/en/vocalists/'],
	['/blog/kaver-gruppa-ili-didzhej/', '/en/blog/kaver-gruppa-ili-didzhej/'],
	['/blog/skolko-stoit-kaver-gruppa/', '/en/blog/skolko-stoit-kaver-gruppa/'],
];
for (const [ruUrl, enUrl] of staticPairs) addPair(ruUrl, enUrl);

// Pair only slugs present in both source arrays used by the paginated templates.
const enContent = readData('enContent.json');
const collections = [
	['programs', readData('programs.json'), enContent.programs],
	['vocalists', readData('vocalists.json'), enContent.vocalists],
	['formats', readData('formats.json'), enContent.formats],
	['events', readData('events.json'), readData('enEvents.json')],
];
for (const [section, russianPages, englishPages] of collections) {
	const englishSlugs = new Set(englishPages.map(({ slug }) => slug));
	for (const { slug } of russianPages) {
		if (englishSlugs.has(slug)) addPair(`/${section}/${slug}/`, `/en/${section}/${slug}/`);
	}
}

// Shared templates generate both languages from explicit locale permalinks.
for (const filename of ['artistLocales.json', 'liveLocales.json', 'leoSaxLocales.json', 'stereoSaxLocales.json']) {
	const locales = readData(filename);
	const russian = locales.find(({ lang }) => lang === 'ru');
	const english = locales.find(({ lang }) => lang === 'en');
	if (russian && english) addPair(russian.permalink, english.permalink);
}

// Untranslated pages, including /programs/jazz-irina/, have no entry.
export default translations;
