"""S.T.A.R 像素图 → LVGL 图（main/star_img.c，RGB565A8：先 RGB565 一层、再 alpha 一层）。

  封面：6 倍（192×192）平常 / 眨眼；闪光 3 倍（21×21）
  口袋机小助理画面：3 倍（96×96）五个表情
用法（在 network/folotoy/ 底下）：python3 tools/make_star.py [--check]（build.sh 每次检查）
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import star_art  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_C = ROOT / "main" / "star_img.c"


def to_c(name: str, img: Image.Image) -> str:
    w, h = img.size
    rgb, alpha = bytearray(), bytearray()
    for r, g, b, a in zip(*[iter(img.tobytes())] * 4):
        v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3) if a else 0
        rgb += bytes((v & 0xFF, v >> 8))
        alpha.append(a)
    data = rgb + alpha
    out = [f"static const uint8_t {name}_map[{len(data)}] = {{"]
    for i in range(0, len(data), 40):
        out.append("    " + ",".join(f"0x{b:02x}" for b in data[i : i + 40]) + ",")
    out += [
        "};",
        f"const lv_image_dsc_t {name} = {{",
        f"    .header = {{ .magic = LV_IMAGE_HEADER_MAGIC, .cf = LV_COLOR_FORMAT_RGB565A8, .w = {w}, .h = {h}, .stride = {w * 2} }},",
        f"    .data_size = {len(data)},",
        f"    .data = {name}_map,",
        "};",
        "",
    ]
    return "\n".join(out)


def build() -> str:
    parts = [
        "// 由 tools/make_star.py 产生，不要手改。S.T.A.R 原创像素星星（tools/star_art.py）",
        '#include "lvgl.h"',
        "",
    ]
    for mode in ("idle", "blink"):
        parts.append(to_c(f"star_cover_{mode}", star_art.star(mode).resize((192, 192), Image.NEAREST)))
    parts.append(to_c("star_sparkle", star_art.sparkle().resize((21, 21), Image.NEAREST)))
    for mode in star_art.FACES:
        parts.append(to_c(f"star_face_{mode}", star_art.star(mode).resize((96, 96), Image.NEAREST)))
    return "\n".join(parts)


def main() -> int:
    text = build()
    if "--check" in sys.argv:
        if not OUT_C.exists() or OUT_C.read_text(encoding="utf-8") != text:
            print("S.T.A.R 图不是最新：重跑 tools/make_star.py")
            return 1
        print("S.T.A.R 图是最新的")
        return 0
    OUT_C.write_text(text, encoding="utf-8")
    print(f"{OUT_C.relative_to(ROOT)}（{len(text) // 1024} KB 原始码）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
