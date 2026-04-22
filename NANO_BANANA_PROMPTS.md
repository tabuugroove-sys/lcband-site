# Nano Banana prompts — Luxury Cover Band site

## 1. Hero 4 фото — выровнять головы + расширить края + Apple-style обработка людей

Применить к каждому из 4 hero-фото отдельно. Цель: 4 hero-кадра должны смотреться как единая серия (как Apple iPhone-colors / Watch-colors страницы) — одинаковое соотношение, одинаковый Y-уровень голов, консистентный свет и color-grade.

**Целевая композиция:**
- Aspect ratio: **16:9 landscape** (2400×1350)
- Уровень глаз исполнителей: **ровно 35% от верха кадра**
- Состав центрован по горизонтали, занимает ~85% ширины
- **Края расширить** (outpaint) — продолжить существующий фон (LED-панели, глиттер, звёзды) налево и направо, чтобы получить чистый 16:9 без кропа людей

**Apple-style обработка:**
- Мягкий, ровный свет на лицах (убрать жёсткие тени под глазами)
- Кожа — натуральная, чуть сглаженная (не пластиковая, Apple не переретуширует)
- Чёткие, выразительные глаза
- Одежда — повышенный контраст, насыщенные, но не кислотные цвета (sequin, сатин — должны читаться фактурно)
- Фон — **чуть притемнить** по периметру (vignette 10-12%), чтобы поднять фокус на людях (Apple-ready трюк)
- Color grade — слегка тёплый (skin +2 warm), фон оставить в цвете, не крутить
- Никаких HDR-эффектов, никакого сильного sharpening, никакого эффекта «пластика»

**КРИТИЧНО:**
- **Лица НЕ менять** — идентичность, мимика, выражения — как в исходнике
- **Костюмы НЕ менять** — цвет, крой, аксессуары сохранить
- **Инструменты** (сакс, гитара, бас) — без изменений

**Исходные файлы:**
- `assets/hero/hero-red.jpg` (2400×1731)
- `assets/hero/hero-bw.jpg` (2400×1692)
- `assets/hero/hero-gold.jpg` (2400×1506)
- `assets/hero/hero-white.jpg` (2400×1948)

**Prompt для каждого:**

> Recompose this band photo into a wide cinematic 16:9 landscape (2400×1350). Extend the existing background (LED panels / glitter / stars / lighting) seamlessly to the left and right so no musician is cropped and the group occupies ~85% of the frame width centered horizontally. Align the composition so the musicians' eye-line sits exactly at 35% from the top of the frame.
>
> Apply Apple editorial-style subject processing: soft even light on faces, natural skin (not plasticky), sharp expressive eyes, enhanced fabric contrast on costumes, subtle vignette to draw focus to subjects (10% darker at corners). Slight warm shift on skin only.
>
> Preserve every face identically (same identity, same expression), keep costumes exact, keep instruments unchanged. Do not add HDR, heavy sharpening, or glamour filters.
>
> Output: 2400×1350 JPG, high quality.

**После генерации:**
```bash
# Нано-банана выдаёт файлы с префиксом, положим их в hero:
mv generated/hero-red.jpg /Users/a1111/lcband-site/assets/hero/hero-red.jpg
# (то же для bw/gold/white)

# Сжать для web:
cd /Users/a1111/lcband-site/assets/hero
for f in *.jpg; do
  sips -Z 2400 -s format jpeg -s formatOptions 80 "$f" --out "$f"
done
```

Оригиналы в `/Users/a1111/Desktop/LOGIC/LCB promo 2025/...` и `/Users/a1111/Downloads/PROMO LCBAND/...` — НЕ трогать.

## 2. Vocalists — 4 портрета в едином Apple-style

Те же 4 вокалиста (Ирина, Стас, Teddy, LAZ) — прогнать для секции «Вокалисты» как editorial-ready портреты:

- Aspect ratio: **4:5 portrait** (1200×1500)
- Субъект по центру, взгляд на 40% от верха
- Apple editorial processing (см. выше)
- Фон — приглушить, desaturate на 15%, чтобы лицо стало доминантой

**Файлы:**
- `assets/vocalists/irina.jpg`
- `assets/vocalists/stas.jpg`
- `assets/vocalists/teddy.jpg`
- `assets/vocalists/laz.jpg`

**Prompt:**

> Recompose this performer photo into a 4:5 portrait (1200×1500). Center the subject, place their eye-line at 40% from the top. Apply Apple editorial-style processing: soft even facial lighting, natural (not plasticky) skin, sharp eyes, subtle warm shift on skin only. Slightly desaturate the background (15%) to draw focus to the subject. Preserve face identity, costume, and expression exactly. No HDR, no glamour filter.
>
> Output: 1200×1500 JPG high quality.

## 3. (опционально, позже) Consistent-background costume lineup

17 костюмных кадров сейчас на разных фонах (студия / сцена / LED). Для iPhone-colors-style линейки привести к одному seamless-фону:

> Remove the background and replace with a solid charcoal studio cyclorama #1a1a1a (no gradient, matte). Keep musicians, costumes, shadows under feet. Apply Apple editorial processing: soft even key light, natural skin, sharp focus on faces, enhanced fabric contrast.
>
> Output: same aspect ratio, JPG.

Применить к `assets/costumes/*.jpg` (17 файлов).
