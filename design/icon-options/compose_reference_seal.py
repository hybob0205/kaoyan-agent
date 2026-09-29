"""Deterministic glyph extraction/compositing, explicitly requested by the user.

No generative redraw or font substitution. Source glyph alpha remains at its
original pixel dimensions; only its white background is removed and ink recolored.
"""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
source = Image.open(ROOT / 'seal-glyph-reference.jpg').convert('RGB')
base = Image.open(ROOT / 'B-small-seal-preview-v2.png').convert('RGB')
out = base.copy()
red = (229, 76, 48)

# Fixed source cells preserve the user's four glyphs in left-to-right order.
cells = [(30, 32, 72, 98), (82, 32, 126, 98),
         (136, 32, 178, 98), (187, 32, 234, 98)]
names = ['hong', 'yang', 'qian', 'fan']
# Existing stamp's letter columns only; floral center and border are untouched.
erasures = [(972, 953, 1014, 1087), (1090, 953, 1133, 1087)]
erase = Image.new('L', base.size)
for box in erasures:
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            r, g, b = base.getpixel((x, y))
            if r > 80 and r > g * 1.28 and r > b * 1.35:
                erase.putpixel((x, y), 255)
erase = erase.filter(ImageFilter.MaxFilter(3))
for y in range(952, 1088):
    for x in range(971, 1134):
        if erase.getpixel((x, y)):
            # Sample adjacent unmarked green paper, never synthesize a character.
            out.putpixel((x, y), base.getpixel((1170 + x % 24, y)))

destinations = [(1092, 954, 1131, 1016), (1092, 1018, 1131, 1086),
                (974, 954, 1013, 1016), (974, 1018, 1013, 1086)]
proof = Image.new('RGB', (480, 240), '#f4f2ea')
manifest = []
for i, (name, cell, dest) in enumerate(zip(names, cells, destinations)):
    mask = ImageOps.invert(source.crop(cell).convert('L'))
    # Only suppress near-white JPEG noise; all actual stroke opacity is retained.
    mask = mask.point(lambda value: 0 if value < 10 else value)
    bbox = mask.point(lambda value: 255 if value > 70 else 0).getbbox()
    assert bbox
    bbox = (max(0, bbox[0]-1), max(0, bbox[1]-1),
            min(mask.width, bbox[2]+1), min(mask.height, bbox[3]+1))
    mask = mask.crop(bbox)
    assert mask.width <= dest[2]-dest[0] and mask.height <= dest[3]-dest[1]
    glyph = Image.new('RGBA', mask.size, (*red, 255))
    glyph.putalpha(mask)
    glyph.save(ROOT / f'glyph-{name}.png')
    x = dest[0] + (dest[2]-dest[0]-mask.width)//2
    y = dest[1] + (dest[3]-dest[1]-mask.height)//2
    out.paste(glyph, (x, y), mask)
    black = Image.new('RGB', mask.size, 'black')
    original_preview = Image.new('RGB', mask.size, '#f4f2ea')
    original_preview.paste(black, (0, 0), mask)
    red_preview = Image.new('RGB', mask.size, '#f4f2ea')
    red_preview.paste(glyph, (0, 0), mask)
    proof.paste(original_preview.resize((mask.width*2, mask.height*2)), (i*120+20, 2))
    proof.paste(red_preview.resize((mask.width*2, mask.height*2)), (i*120+20, 122))
    manifest.append({'glyph': name, 'source_cell': cell, 'alpha_bbox': bbox,
                     'destination': [x, y], 'size': list(mask.size), 'scale': 1})

out.save(ROOT / 'B-exact-seal-preview-v4.png')
out.crop((952, 940, 1144, 1100)).resize((960, 800), Image.Resampling.NEAREST).save(ROOT / 'B-exact-seal-detail-v4.png')
proof.save(ROOT / 'B-glyph-comparison-v4.png')
diff = ImageChops.difference(base, out)
assert diff.getbbox()[0] >= 971 and diff.getbbox()[2] <= 1134
assert diff.getbbox()[1] >= 952 and diff.getbbox()[3] <= 1088
(ROOT / 'B-exact-seal-manifest-v4.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'changed_bounds': diff.getbbox(), 'glyphs': manifest}, ensure_ascii=False))
