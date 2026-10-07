#!/usr/bin/env python3
"""生成 WhatsApp / Facebook 链接预览图 assets/img/og.jpg（1200x630）。

用法：python3 scripts/make-og.py <字体资料夹>
字体资料夹要有 NotoSerifSC[wght].ttf、NotoSansSC[wght].ttf
（从 github.com/google/fonts 的 ofl/notoserifsc、ofl/notosanssc 下载）。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(sys.argv[1] if len(sys.argv) > 1 else ".")

NAVY = (16, 24, 44)
NAVY_2 = (24, 36, 64)
CREAM = (247, 240, 225)
GOLD = (214, 176, 84)
GOLD_DEEP = (168, 128, 40)
RED = (190, 30, 45)
MUTED = (178, 186, 204)


def font(name, size, weight=None):
    f = ImageFont.truetype(str(FONTS / name), size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def main():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # 右边淡淡的斜纹，像财报封面
    for x in range(-H, W, 22):
        d.line([(x, H), (x + H, 0)], fill=NAVY_2, width=1)

    # 左边：照片
    photo = Image.open(ROOT / "assets/img/dudu.jpg").convert("RGB")
    pw, ph = 470, H
    src_w = photo.width
    src_h = int(src_w * ph / pw)
    top = 40
    crop = photo.crop((0, top, src_w, top + src_h)).resize((pw, ph), Image.LANCZOS)
    img.paste(crop, (0, 0))

    # 照片和右侧之间的金线
    d.rectangle([pw, 0, pw + 5, H], fill=GOLD)

    # 照片右下角的「核准」红印
    seal = Image.new("RGBA", (190, 190), (0, 0, 0, 0))
    sd = ImageDraw.Draw(seal)
    sd.ellipse([8, 8, 182, 182], outline=RED + (235,), width=7)
    sd.ellipse([22, 22, 168, 168], outline=RED + (235,), width=2)
    f_seal = font("NotoSerifSC[wght].ttf", 40, 900)
    for i, ch in enumerate(["核", "准"]):
        bbox = sd.textbbox((0, 0), ch, font=f_seal)
        sd.text((95 - (bbox[2] - bbox[0]) / 2, 50 + i * 44), ch, font=f_seal, fill=RED + (235,))
    seal = seal.rotate(-12, resample=Image.BICUBIC, expand=False)
    img.paste(seal, (pw - 200, H - 210), seal)

    x0 = pw + 56
    f_kicker = font("NotoSansSC[wght].ttf", 24, 600)
    f_name = font("NotoSerifSC[wght].ttf", 76, 900)
    f_line2 = font("NotoSerifSC[wght].ttf", 60, 900)
    f_line3 = font("NotoSerifSC[wght].ttf", 50, 900)
    f_meta = font("NotoSansSC[wght].ttf", 28, 500)
    f_cta = font("NotoSansSC[wght].ttf", 24, 700)

    d.text((x0, 58), "丞鹤控股 · 第一届股东大会通告", font=f_kicker, fill=GOLD)
    d.line([(x0, 100), (W - 56, 100)], fill=GOLD_DEEP, width=2)
    d.line([(x0, 106), (W - 56, 106)], fill=GOLD_DEEP, width=1)

    d.text((x0, 128), "张丞鹤 DUDU", font=f_name, fill=GOLD)
    d.text((x0, 230), "未来首富一岁生日", font=f_line2, fill=CREAM)

    # 第三行：红底印章条
    t3 = "干爹干妈召集会"
    b = d.textbbox((0, 0), t3, font=f_line3)
    tw, th = b[2] - b[0], b[3] - b[1]
    pad_x, pad_y = 22, 14
    by = 322
    d.rectangle([x0, by, x0 + tw + pad_x * 2, by + th + pad_y * 2 + 8], fill=RED)
    d.text((x0 + pad_x, by + pad_y - b[1] + 4), t3, font=f_line3, fill=CREAM)

    d.text((x0, 438), "14/11/2026（星期六）中午 12:00", font=f_meta, fill=CREAM)
    d.text((x0, 478), "Wilson麻坡家 · Muar, Johor", font=f_meta, fill=MUTED)

    cta = "点开拆通告 · 回复出席 RSVP  ›"
    cb = d.textbbox((0, 0), cta, font=f_cta)
    cw, ch = cb[2] - cb[0], cb[3] - cb[1]
    cy = 540
    d.rounded_rectangle([x0, cy, x0 + cw + 44, cy + ch + 28], radius=30, fill=GOLD)
    d.text((x0 + 22, cy + 14 - cb[1]), cta, font=f_cta, fill=NAVY)

    out = ROOT / "assets/img/og.jpg"
    img.save(out, quality=86, optimize=True, progressive=True)
    print(out, img.size, out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
