import fs from 'node:fs';

const sourceUrl = new URL('../../../assets/repertoire/index.html', import.meta.url);
const letters = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

const categoryNames = {
  'pop-male': 'Russian pop · male vocals',
  'english-male': 'English-language · male vocals',
  'pop-female': 'Russian pop · female vocals',
  'english-female': 'English-language · female vocals',
  eighties: '80s & 90s hits',
  caucasus: 'Music of the Caucasus',
  retro: 'Retro',
  rock: 'Rock',
  slow: 'Ballads',
  spanish: 'Spanish-language songs',
  italian: 'Italian-language songs',
  french: 'French-language songs',
  jazz: 'Jazz & lounge',
  'new-year': 'Christmas & New Year',
  laz: 'With LAZ',
};

// Keep recognised artist spellings while retaining a transliterated search alias.
// Song titles remain the actual titles, rather than invented English versions.
const artistSpellings = new Map([
  ['Леонид агутин', 'Leonid Agutin'], ['Ласковый май', 'Laskovy May'],
  ['Люся Чеботина', 'Lyusya Chebotina'], ['Макс Барских', 'Max Barskih'],
  ['Фрэнк Синатра', 'Frank Sinatra'], ['Юрий Антонов', 'Yuri Antonov'],
  ['Алексей Воробьёв', 'Alexey Vorobyov'], ['Артур пирожков', 'Artur Pirozhkov'],
  ['Руки вверх', 'Ruki Vverkh'], ['Король и шут', 'Korol i Shut'],
  ['Квест пистолс', 'Quest Pistols'], ['Дискотека Авария', 'Diskoteka Avariya'],
  ['Комната культуры', 'Komnata Kultury'], ['Моральный кодекс', 'Moralny Kodeks'],
  ['Смысловые галлюцинации', 'Smyslovye Gallyutsinatsii'],
  ['Смысловые голлюцинации', 'Smyslovye Gallyutsinatsii'],
  ['Михей и Джуманджи', 'Mikhey i Jumanji'], ['Сосо Павлиашвили', 'Soso Pavliashvili'],
  ['Эльбрус Джанмирзоев', 'Elbrus Dzhanmirzoev'], ['Эдита Пьеха', 'Edita Piekha'],
  ['А\'СТУДИО', "A'Studio"], ['А’СТУДИО', "A'Studio"], ['А-СТУДИО', "A'Studio"],
  ['Виагра', 'VIA Gra'], ['Кармэн', 'Car-Man'], ['Би-2', 'Bi-2'],
  ['На-На', 'Na-Na'], ['#2Маши', '#2Mashi'], ['Чайф', 'Chaif'],
  ['Бьянка', 'Bianka'], ['Максим', 'MakSim'], ['Элджей', 'Eldzhey'],
]);

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, key) => {
    if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[key.toLowerCase()] ?? entity;
  });
}

function romanize(value) {
  return value.replace(/[\u0400-\u04ff]/g, character => {
    const lower = character.toLowerCase();
    if (!(lower in letters)) throw new Error(`Unmapped Cyrillic character: ${character}`);
    const result = letters[lower];
    return character === lower ? result : result.charAt(0).toUpperCase() + result.slice(1);
  });
}

function displayTitle(original) {
  let value = original;
  for (const [artist, spelling] of artistSpellings) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(escaped, 'gi'), spelling);
  }
  return romanize(value)
    .replace(/iz m\/f/g, 'from the animated film')
    .replace(/iz k\/f/g, 'from the film')
    .replace(/K\/F/g, 'film');
}

function loadCatalogue() {
  // The Russian catalogue remains the single song source and is never rewritten.
  const source = fs.readFileSync(sourceUrl, 'utf8');
  const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!style) throw new Error('Repertoire catalogue styles are missing');
  const sections = [];
  const pattern = /<section class="song-section" id="([^"]+)"[\s\S]*?<ol start="(\d+)">([\s\S]*?)<\/ol>\s*<\/section>/g;
  for (const match of source.matchAll(pattern)) {
    const [, id, start, list] = match;
    if (!categoryNames[id]) throw new Error(`English repertoire category is missing: ${id}`);
    const songs = [...list.matchAll(/<li value="(\d+)">[\s\S]*?<span class="song">([\s\S]*?)<\/span><\/li>/g)].map(([, number, html]) => {
      const original = decodeEntities(html);
      const title = displayTitle(original);
      const alias = romanize(original);
      return { number: Number(number), label: number.padStart(3, '0'), title, search: title === alias ? title : `${title} ${alias}` };
    });
    if (!songs.length) throw new Error(`English repertoire category is empty: ${id}`);
    sections.push({ id, start: Number(start), title: categoryNames[id], songs, note: id === 'laz' ? 'Available with a lineup featuring LAZ.' : '' });
  }
  const count = sections.reduce((total, section) => total + section.songs.length, 0);
  const sourceCount = [...source.matchAll(/<span class="song">/g)].length;
  if (!count || count !== sourceCount) throw new Error(`Repertoire parsing lost songs: ${count}/${sourceCount}`);
  return { style, sections, count };
}

export default function () {
  // Eleventy unwraps an ESM default only when it is the module's sole export.
  // Keep helpers private so this directory data function is actually invoked.
  return { englishRepertoire: loadCatalogue() };
}
