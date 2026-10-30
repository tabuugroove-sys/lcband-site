import { readFileSync } from 'node:fs';

const media = JSON.parse(readFileSync(new URL('../../media/lcband-promo-package.json', import.meta.url), 'utf8')).videos;
const performances = [
  {
    slug: 'laz-coco-jambo', mediaSlug: 'interact-laz-coco-jambo',
    ru: {
      title: 'LAZ — Coco Jambo',
      description: 'Фрагмент живого выступления с Coco Jambo, вокалистом LAZ и Luxury Cover Band. Посмотрите запись и обсудите программу с участием LAZ.',
      context: 'В этом фрагменте LAZ исполняет Coco Jambo. На странице вокалиста собраны другие записи и рассказ о его работе. Состав и песни для вашего события согласуем отдельно.',
      relatedUrl: '/vocalists/laz/', relatedLabel: 'Вокалист LAZ: записи и история',
    },
    en: {
      title: 'LAZ — Coco Jambo',
      description: 'A live performance clip of Coco Jambo with vocalist LAZ and Luxury Cover Band. Watch the performance and discuss an event lineup featuring LAZ.',
      context: 'This short clip shows LAZ performing Coco Jambo. His vocalist page has more recordings and background. We agree the lineup and songs for your event separately.',
      relatedUrl: '/en/vocalists/laz/', relatedLabel: 'Meet LAZ and watch more performances',
    },
  },
  {
    slug: 'volare-baskov', mediaSlug: 'live-baskov-lcb',
    ru: {
      title: 'Volare — Николай Басков и Luxury Cover Band',
      description: 'Короткая запись совместного исполнения Volare Николаем Басковым и Luxury Cover Band. Концертный фрагмент продолжительностью около восьми секунд.',
      context: 'В этой короткой записи Николай Басков и Luxury Cover Band исполняют Volare. Участие гостевого артиста в этой записи не означает его участие в стандартной программе группы. Состав на ваше событие обсудим отдельно.',
      relatedUrl: '/#videos', relatedLabel: 'Другие записи Luxury Cover Band',
    },
    en: {
      title: 'Volare — Nikolay Baskov and Luxury Cover Band',
      description: 'A short recording of Volare performed by Nikolay Baskov and Luxury Cover Band. The concert clip runs for approximately eight seconds.',
      context: 'Nikolay Baskov and Luxury Cover Band perform Volare in this short recording. The guest artist appearing in this clip is not part of the band’s standard lineup. Contact us to discuss the performers for your event.',
      relatedUrl: '/en/#videos', relatedLabel: 'More Luxury Cover Band recordings',
    },
  },
  {
    slug: 'perfect', mediaSlug: 'live-perfect',
    ru: {
      title: 'Perfect — живое исполнение Luxury Cover Band',
      description: 'Живая версия Perfect в исполнении Luxury Cover Band: запись около 1 минуты 37 секунд. Послушайте песню и обсудите музыку для первого танца.',
      context: 'Послушайте живую версию Perfect перед выбором песни для первого танца. На свадебной странице — варианты программы и отзыв клиента. Песню, аранжировку и длительность номера согласуем под ваш сценарий.',
      relatedUrl: '/events/wedding/', relatedLabel: 'Музыка для свадьбы и первого танца',
    },
    en: {
      title: 'Perfect — a live performance by Luxury Cover Band',
      description: 'Listen to Luxury Cover Band’s live version of Perfect, approximately 1 minute 37 seconds long, and discuss music for your first dance.',
      context: 'Listen to this live version of Perfect while choosing music for your first dance. Our wedding page has programme options and a client review. We agree the song, arrangement and performance length around your event.',
      relatedUrl: '/en/events/wedding/', relatedLabel: 'Wedding and first-dance music',
    },
  },
];

// The media manifest supplies duration, dimensions and stable content URLs.
// Original upload dates are not documented; do not substitute event or build dates.
export default performances.flatMap(performance => {
  const asset = media[performance.mediaSlug];
  if (!asset?.family || !asset.duration || !asset.has720) throw new Error(`Missing watch video metadata: ${performance.mediaSlug}`);
  const seconds = Math.round(asset.duration);
  return ['ru', 'en'].map(lang => ({
    ...performance[lang],
    lang,
    slug: performance.slug,
    mediaSlug: performance.mediaSlug,
    url: `${lang === 'en' ? '/en' : ''}/watch/${performance.slug}/`,
    aboutUrl: `${lang === 'en' ? '/en' : ''}/about/#examples`,
    poster: `assets/video/posters/watch-${performance.slug}.jpg`,
    contentPath: `assets/video/mp4/${asset.family}-720.mp4`,
    width: asset.width,
    height: asset.height,
    durationSeconds: seconds,
    durationISO: `PT${seconds}S`,
    durationLabel: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  }));
});
