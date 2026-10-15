import fs from 'node:fs';

export default function () {
    return JSON.parse(fs.readFileSync(new URL('../../media/lcband-promo-package.json', import.meta.url), 'utf8'));
}
