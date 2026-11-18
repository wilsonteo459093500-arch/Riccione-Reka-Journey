"""产生 FoloToy 开机封面（240×320）：深胡桃木纹 + 官方白色字标 → LVGL RGB565 图（main/cover_img.c）+ 预览 PNG。

字标用仓库里现成的官方档案（不重画、不改字）：
  RICCIONE®：blueprint/public/template/b/riccione-logo-white.png
  溪岸 sAil by Riccione Reka：blueprint/public/template/b/logo-white.png
木纹用程序画（固定乱数种子，每次产生一样），不用来路不明的照片。

用法（在 network/folotoy/ 底下）：python3 tools/make_cover.py [--check]
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent.parent
LOGO_RICCIONE = REPO / "blueprint/public/template/b/riccione-logo-white.png"
LOGO_SAIL = REPO / "blueprint/public/template/b/logo-white.png"
OUT_C = ROOT / "main" / "cover_img.c"
OUT_PNG = ROOT / "firmware" / "cover.png"
W, H = 240, 320


def smooth_noise(rnd: random.Random, n: int, passes: int) -> list[float]:
    """一维平滑乱数（0..1）：给木纹一条一条深浅不一的纤维"""
    v = [rnd.random() for _ in range(n)]
    for _ in range(passes):
        v = [(v[max(i - 1, 0)] + v[i] * 2 + v[min(i + 1, n - 1)]) / 4 for i in range(n)]
    lo, hi = min(v), max(v)
    return [(x - lo) / (hi - lo + 1e-9) for x in v]


def wood() -> Image.Image:
    """深胡桃木直纹：粗细不一的纤维 + 轻微弯曲 + 细毛孔；中间亮一点、四周暗（字标比较显眼）"""
    rnd = random.Random(20261118)
    span = W * 4
    coarse = smooth_noise(rnd, span, 40)   # 宽的深浅带
    fine = smooth_noise(rnd, span, 3)      # 细纤维
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        bend = 5 * math.sin(y * 0.011 + ph[0]) + 2.5 * math.sin(y * 0.029 + ph[1])
        for x in range(W):
            u = x * 2 + bend * 2 + 6 * math.sin(x * 0.02 + y * 0.006 + ph[2])
            i = int(u) % span
            t = 0.5 * coarse[i] + 0.35 * fine[(i * 3) % span] + 0.15 * rnd.random()
            dark, light = (30, 19, 12), (88, 57, 36)
            c = [d + (l - d) * t for d, l in zip(dark, light)]
            dx, dy = (x - W / 2) / (W / 2), (y - H * 0.42) / (H / 2)
            vg = max(0.4, 1 - 0.5 * (dx * dx + dy * dy))
            px[x, y] = tuple(int(ch * vg) for ch in c)
    return img.filter(ImageFilter.GaussianBlur(0.5))


def place_logo(base: Image.Image, path: Path, width: int, cy: int) -> None:
    logo = Image.open(path).convert("RGBA")
    bbox = logo.getbbox()   # 去掉透明边
    logo = logo.crop(bbox)
    h = round(logo.height * width / logo.width)
    logo = logo.resize((width, h), Image.LANCZOS)
    base.alpha_composite(logo, ((W - width) // 2, cy - h // 2))


def build() -> Image.Image:
    img = wood().convert("RGBA")
    place_logo(img, LOGO_RICCIONE, 168, 92)
    # 两个字标之间一条细的黄铜线
    line = Image.new("RGBA", (64, 1), (200, 164, 107, 200))
    img.alpha_composite(line, ((W - 64) // 2, 132))
    place_logo(img, LOGO_SAIL, 150, 186)
    return img.convert("RGB")


def to_c(img: Image.Image) -> str:
    data = bytearray()
    for r, g, b in zip(*[iter(img.tobytes())] * 3):
        v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
        data += bytes((v & 0xFF, v >> 8))   # little-endian uint16（跟 LVGL RGB565 一样）
    lines = [
        "// 由 tools/make_cover.py 产生，不要手改。开机封面：程序画的胡桃木纹 + 官方 RICCIONE / 溪岸 SAIL 白色字标",
        '#include "lvgl.h"',
        "",
        f"static const uint8_t cover_map[{len(data)}] = {{",
    ]
    for i in range(0, len(data), 32):
        lines.append("    " + ",".join(f"0x{b:02x}" for b in data[i : i + 32]) + ",")
    lines += [
        "};",
        "",
        "const lv_image_dsc_t space_cover_img = {",
        "    .header = { .magic = LV_IMAGE_HEADER_MAGIC, .cf = LV_COLOR_FORMAT_RGB565, .w = 240, .h = 320, .stride = 480 },",
        f"    .data_size = {len(data)},",
        "    .data = cover_map,",
        "};",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    img = build()
    text = to_c(img)
    if "--check" in sys.argv:
        if not OUT_C.exists() or OUT_C.read_text(encoding="utf-8") != text:
            print("封面不是最新：重跑 tools/make_cover.py")
            return 1
        print("封面是最新的")
        return 0
    OUT_C.write_text(text, encoding="utf-8")
    img.resize((W * 2, H * 2), Image.NEAREST).save(OUT_PNG)
    print(f"{OUT_C.relative_to(ROOT)}、{OUT_PNG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
