"""产生 FoloToy 开机封面（240×320）：整片像素夜空 → LVGL RGB565 图（main/cover_img.c）+ 预览 PNG。

2026-11-19 用户：原本的胡桃木纹封面太沉闷 → 换成像素风；主角是原创像素星星 S.T.A.R（tools/star_art.py）。
S.T.A.R 不画进这张底图：韧体另外放一张星星图，才能上下飘、眨眼（main/star_img.c、space_card.c）。
预览 PNG（firmware/cover.png）会把星星合进去，看起来跟真机一样。
2026-11-19 用户：封面不要放公司字标，只放 S.T.A.R。

用法（在 network/folotoy/ 底下）：python3 tools/make_cover.py [--check]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import star_art  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent.parent
OUT_C = ROOT / "main" / "cover_img.c"
OUT_PNG = ROOT / "firmware" / "cover.png"
W, H = 240, 320
STAR_Y = 48    # 封面星星的 y（跟 main/space_card.c 一样）


def sky() -> Image.Image:
    """像素夜空：深蓝底 + 固定位置的小星点（整个画面）"""
    img = Image.new("RGBA", (W, H), (24, 26, 54, 255))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 6):
        for y in range(0, H, 6):
            h = (x * 31 + y * 17) % 113
            if h == 0:
                d.rectangle([x, y, x + 1, y + 1], fill=(150, 160, 230))
            elif h == 57:
                d.point((x, y), fill=(90, 100, 170))
    return img


def build() -> Image.Image:
    return sky().convert("RGB")


def preview(img: Image.Image) -> Image.Image:
    """预览：把 S.T.A.R 和闪光放在韧体会放的位置（space_card.c：星星 (24, STAR_Y)、闪光 (196, STAR_Y + 24)）"""
    pv = img.convert("RGBA")
    pv.alpha_composite(star_art.star("idle").resize((192, 192), Image.NEAREST), (24, STAR_Y))
    pv.alpha_composite(star_art.sparkle().resize((21, 21), Image.NEAREST), (196, STAR_Y + 24))
    return pv.convert("RGB")


def to_c(img: Image.Image) -> str:
    data = bytearray()
    for r, g, b in zip(*[iter(img.tobytes())] * 3):
        v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
        data += bytes((v & 0xFF, v >> 8))   # little-endian uint16（跟 LVGL RGB565 一样）
    lines = [
        "// 由 tools/make_cover.py 产生，不要手改。开机封面：整片像素夜空（星星另外画）",
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
    preview(img).resize((W * 2, H * 2), Image.NEAREST).save(OUT_PNG)
    print(f"{OUT_C.relative_to(ROOT)}、{OUT_PNG.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
