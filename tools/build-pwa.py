#!/usr/bin/env python3
"""Builds an icon set and a manifest for each app, so each can be added to a phone's home
screen. Run it after adding an app (`npm run icons`), then `npm run sw`.

Needs Python 3 with Pillow, and the Noto Color Emoji font for the icons.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
EMOJI_FONT = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'

# dir ('' is the home screen), name, short name for under the icon, emoji, colour
APPS = [
    ('', 'Pocket Apps', 'Pocket Apps', '🧰', '#0f766e'),
    ('petty-cash', 'Petty Cash', 'Petty Cash', '💵', '#0f766e'),
    ('sushiro', 'Sushiro Tracker', 'Sushiro', '🍣', '#d7001b'),
    ('split', 'Split', 'Split', '💸', '#6d28d9'),
    ('trip', 'Trip Planner', 'Trip', '🧳', '#0369a1'),
    ('calc84', 'GX-84 Calculator', 'GX-84', '🧮', '#16181b'),
    ('wallets', 'Wallet Radar', 'Wallets', '🔎', '#3b2a8a'),
    ('security', 'Security Watch', 'Security', '🛡️', '#9f1239'),
    ('bazi', 'BaZi Calculator', 'BaZi', '☯️', '#7a1f1f'),
    ('ziwei', 'Zi Wei Dou Shu', 'Zi Wei', '🔮', '#5b21b6'),
    ('fengshui', 'Feng Shui', 'Feng Shui', '🧭', '#14503c'),
    ('learnai', 'AI for Beginners', 'Learn AI', '🤖', '#1e40af'),
    ('godigital', 'Go Digital', 'Go Digital', '📱', '#0f766e'),
    ('mergetactics', 'Merge Tactics Coach', 'Merge Tactics', '⚔️', '#b45309'),
    ('chat', 'Local Chat', 'Local Chat', '🦙', '#111827'),
]


def emoji_image(emoji):
    # Noto Color Emoji is a bitmap font that only renders at 109 px.
    font = ImageFont.truetype(EMOJI_FONT, 109)
    img = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((80, 80), emoji, font=font, embedded_color=True, anchor='mm')
    return img.crop(img.getbbox())


def save(img, path):
    # A 256-colour palette keeps the emoji looking the same at about a third of the size.
    img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)


def icon(emoji, colour, size, rounded, scale):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22) if rounded else 0, fill=255)
    img.paste(Image.new('RGBA', (size, size), colour), mask=mask)
    e = emoji_image(emoji)
    side = int(size * scale)
    e = e.resize((side, int(side * e.height / e.width)) if e.width >= e.height else (int(side * e.width / e.height), side), Image.LANCZOS)
    img.alpha_composite(e, ((size - e.width) // 2, (size - e.height) // 2))
    return img


def build_icons():
    out = ROOT / 'icons'
    out.mkdir(exist_ok=True)
    for d, _, _, emoji, colour in APPS:
        slug = d or 'home'
        save(icon(emoji, colour, 192, True, 0.62), out / f'{slug}-192.png')
        save(icon(emoji, colour, 512, True, 0.62), out / f'{slug}-512.png')
        # Maskable icons are cropped to a circle by Android, so keep the emoji inside the middle 80%.
        save(icon(emoji, colour, 512, False, 0.5), out / f'{slug}-maskable.png')
        # iOS rounds the corners itself and shows transparency as black.
        save(icon(emoji, colour, 180, False, 0.62).convert('RGB'), out / f'{slug}-apple.png')


def build_manifests():
    for d, name, short, _, colour in APPS:
        slug = d or 'home'
        up = '../' if d else ''
        manifest = {
            'name': name,
            'short_name': short,
            'start_url': './',
            'scope': './',
            'display': 'standalone',
            'background_color': '#f6f7f9',
            'theme_color': colour,
            'icons': [
                {'src': f'{up}icons/{slug}-192.png', 'sizes': '192x192', 'type': 'image/png'},
                {'src': f'{up}icons/{slug}-512.png', 'sizes': '512x512', 'type': 'image/png'},
                {'src': f'{up}icons/{slug}-maskable.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
            ],
        }
        (ROOT / d / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')



if __name__ == '__main__':
    build_icons()
    build_manifests()
    print(f'Built icons and manifests for {len(APPS)} pages. Now run `npm run sw`.')
