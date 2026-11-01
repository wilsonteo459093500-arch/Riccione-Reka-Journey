"""C 安然 · 版式用的 logo 图（一次性工具，换 logo 时重跑）。

  python3 scripts/build_logos.py <瑞吉欧商标 PNG 所在目录>

输出到 public/template/b/：
  logo-white.png              溪岸 logo 白色版 = logo-ink.png 的 alpha + 纯白（照片上用）
  riccione-logo-color.png     RICCIONE 商标原色（橙 E88F36 + 黑 141615 + ®，纸面上用）
  riccione-logo-white.png     全白（照片上用）
  riccione-logo-ink.png       深色 33302B
瑞吉欧的三张从商标矢量原件（RICCIONE.pdf）导出的 4027 宽透明底 PNG 缩到 2000 宽（宽高比 2000:359），
目录里要有 riccione-color.png / riccione-white.png / riccione-ink.png。
压缩：装了 pyoxipng（pip install pyoxipng）就用它无损再压一遍，没有就用 PIL 的 optimize。
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'template', 'b')
RICCIONE_W = 2000

try:
    import oxipng  # type: ignore
except ImportError:  # pragma: no cover
    oxipng = None


def save(im, name):
    path = os.path.join(OUT, name)
    im.save(path, optimize=True, compress_level=9)
    if oxipng:
        oxipng.optimize(path, level=6, strip=oxipng.StripChunks.safe())
    print(f'{name}: {im.size[0]}×{im.size[1]}  {os.path.getsize(path) // 1024} KB')


def white_from(src):
    """同一张 logo 的白色版：alpha 不变，颜色换成纯白"""
    im = Image.open(src).convert('RGBA')
    white = Image.new('RGBA', im.size, (255, 255, 255, 0))
    white.putalpha(im.getchannel('A'))
    return white


def main():
    save(white_from(os.path.join(OUT, 'logo-ink.png')), 'logo-white.png')
    if len(sys.argv) < 2:
        print('（没给瑞吉欧商标 PNG 的目录：只生成 logo-white.png）')
        return
    src_dir = sys.argv[1]
    for kind in ('color', 'white', 'ink'):
        im = Image.open(os.path.join(src_dir, f'riccione-{kind}.png')).convert('RGBA')
        h = round(im.size[1] * RICCIONE_W / im.size[0])
        # Pillow 缩放 RGBA 时先预乘 alpha，透明边不会发黑
        save(im.resize((RICCIONE_W, h), Image.LANCZOS), f'riccione-logo-{kind}.png')


if __name__ == '__main__':
    main()
