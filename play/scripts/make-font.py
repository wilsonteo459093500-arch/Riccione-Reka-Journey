"""把 Fusion Pixel 12px（OFL-1.1）裁成只有用得到的字 → public/fonts/play-pixel.woff2

留下：画面上所有的字（扫 src/）+ ASCII + 常用标点 + GB2312 一级常用字 3755 个（给玩家名字用）
OFL 规定改过的字体不能再叫保留名称「Fusion Pixel」，所以裁过的叫「PLAY Pixel」。
用法：pip install fonttools brotli；cd play；python3 scripts/make-font.py
"""
import pathlib, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules/@fontsource/fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2'
OUT = ROOT / 'public/fonts/play-pixel.woff2'

chars = set(chr(c) for c in range(0x20, 0x7F))
chars |= set('·…—–‘’“”、。，！？：；（）《》【】「」『』〈〉～￥×÷±←→↑↓●○■□◆◇★☆♥✓✕①②③④⑤⑥⑦⑧⑨⑩')
for p in (ROOT / 'src').rglob('*'):
    if p.suffix in ('.js', '.jsx', '.mjs'):
        chars |= {ch for ch in p.read_text(encoding='utf-8') if ord(ch) > 0x7F}
# GB2312 一级常用字
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError:
            pass

font = TTFont(SRC)
cmap = font.getBestCmap()
keep = sorted(ord(c) for c in chars if ord(c) in cmap)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=keep)
sub.subset(font)
# 改名（OFL 保留名称）
for rec in font['name'].names:
    if rec.nameID in (1, 3, 4, 6, 16, 17, 18, 21):
        s = rec.toUnicode().replace('Fusion Pixel 12px Proportional SC', 'PLAY Pixel').replace('FusionPixel12pxProportionalSC', 'PLAYPixel').replace('Fusion Pixel', 'PLAY Pixel').replace('FusionPixel', 'PLAYPixel')
        rec.string = s
font.flavor = 'woff2'
OUT.parent.mkdir(parents=True, exist_ok=True)
font.save(OUT)
missing = sorted(c for c in chars if ord(c) not in cmap and ord(c) > 0x7F and not (0x1F000 <= ord(c)))
print(f'{len(keep)} 个字 → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)')
if missing:
    print('字体里没有（会用手机字体代替）：', ''.join(missing[:80]))
