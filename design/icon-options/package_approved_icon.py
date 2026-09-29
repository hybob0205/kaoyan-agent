"""Package the approved bitmap; never regenerate or redraw the seal glyphs."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
image = Image.open(root / 'design/icon-options/B-exact-seal-preview-v4.png').convert('RGB')
public = root / 'frontend/public'
image.resize((512, 512), Image.Resampling.LANCZOS).save(public / 'app-icon.png')
color = image.getpixel((image.width//2, 20))

def padded(size, fraction):
    result = Image.new('RGB', (size, size), color)
    side = round(size * fraction)
    result.paste(image.resize((side, side), Image.Resampling.LANCZOS), ((size-side)//2, (size-side)//2))
    return result

padded(512, .75).save(public / 'app-icon-maskable.png')
res = root / 'frontend/android/app/src/main/res'
for density, size, foreground in [('mdpi',48,108), ('hdpi',72,162), ('xhdpi',96,216), ('xxhdpi',144,324), ('xxxhdpi',192,432)]:
    folder = res / f'mipmap-{density}'
    legacy = padded(size, .86)
    legacy.save(folder / 'ic_launcher.png')
    round_icon = legacy.convert('RGBA')
    mask = Image.new('L', (size,size)); ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
    round_icon.putalpha(mask); round_icon.save(folder / 'ic_launcher_round.png')
    # Keep the complete lower-right seal inside adaptive icon masks.
    padded(foreground, .58).save(folder / 'ic_launcher_foreground.png')

preview = padded(512, .75).convert('RGBA')
mask = Image.new('L', (512,512)); ImageDraw.Draw(mask).ellipse((0,0,511,511),fill=255)
preview.putalpha(mask); preview.save(root / 'design/icon-options/approved-circle-preview.png')
