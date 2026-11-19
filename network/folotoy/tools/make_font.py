"""产生 LVGL 9 用的位图字型子集（只放用到的字），给 FoloToy 显示中文和大数字。

为什么不用 lv_font_conv：上游社群实测它在新版 Node.js 下写出的位图是坏的（整屏乱码），
见 FoloToy/ai-passport docs/reference/shinku-chen/lvgl-cjk-font-subsets。
这里直接用 Pillow（FreeType）画字，自己写 LVGL 的 PLAIN 4bpp 格式，写完再按 LVGL 的读法
解回来逐像素比对，不一致就失败。

字型：思源黑体 Noto Sans SC（SIL Open Font License 1.1）。字型档不放进仓库，从 npm 取：
  https://registry.npmjs.org/@expo-google-fonts/noto-sans-sc/-/noto-sans-sc-0.4.4.tgz
  → package/500Medium/NotoSansSC_500Medium.ttf（大数字用 package/700Bold/NotoSansSC_700Bold.ttf）

用法（在 network/folotoy/ 底下）：
  python3 tools/make_font.py --ttf <Medium.ttf> --bold-ttf <Bold.ttf>          # 重新产生 main/font_*.c
  python3 tools/make_font.py --ttf <Medium.ttf> --bold-ttf <Bold.ttf> --check  # 只检查：程序里有新的中文字没产生就失败

字型清单（FONTS）：
  space_font_cjk_20 / 32：中文（从 main/*.c 的字串里收集 + tools/font_extra_chars.txt），
                          ASCII 交给 Montserrat 同字号（fallback），所以英文、数字跟原本一样
  space_font_digits_64 / 140：计时器、数字蜡烛用的大数字（0-9 : .）
  space_font_news_20：每日晨报（GB2312 全部汉字 + 符号，约 7,500 字、约 1.3MB）。新闻什么字都可能有，
                      所以不是「用到才放」；档案太大（约 8MB 原始码）不放进仓库：
                      build.sh / sim/run.sh 编的时候用 --news-out 产生到编译资料夹。
                      同一份字表写进 app 的 assets/news_chars.txt（app 只送 FoloToy 有的字），--check 会检查它
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MAIN = ROOT / "main"
EXTRA = HERE / "font_extra_chars.txt"

FONTS = [
    # name, px, 字从哪来, 粗细, fallback（ASCII 用谁画）
    ("space_font_cjk_20", 20, "cjk", "medium", "lv_font_montserrat_20"),
    ("space_font_cjk_32", 32, "cjk", "medium", "lv_font_montserrat_32"),
    ("space_font_digits_64", 64, "digits", "bold", None),
    ("space_font_digits_140", 140, "digits", "bold", None),
]
DIGITS = "0123456789:."
NEWS_CHARS = ROOT / "android" / "app" / "src" / "main" / "assets" / "news_chars.txt"
NEWS_EXTRA = "·—–•€éü峇啰哖吔呣嚤"   # GB2312 没有、新闻常见的（· — Python 的 gb2312 对到 U+30FB、U+2015；峇株巴辖等大马地名人名）


def news_chars() -> list[str]:
    """GB2312 一到九区的符号 + 十六到八十七区的汉字（6,763 个），加上 NEWS_EXTRA。ASCII 交给 Montserrat。"""
    chars: set[str] = set(NEWS_EXTRA)
    for hi in list(range(0xA1, 0xAA)) + list(range(0xB0, 0xF8)):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
            except UnicodeDecodeError:
                continue
            if ord(ch) > 0x7E and not ch.isspace():
                chars.add(ch)
    return sorted(chars)


def news_chars_text(chars: list[str]) -> str:
    return "# FoloToy 晨报字型有的字（tools/make_font.py 产生，不要手改）；另外 ASCII 0x20-0x7E 都有\n" + "".join(chars) + "\n"


def strip_comments(src: str) -> str:
    """去掉 // 和 /* */ 注释，保留字串（字串里的 // 不当注释）。"""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            out.append(src[i : j + 1])
            i = j + 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


def collect_cjk() -> list[str]:
    """main/*.c、*.h 字串里所有非 ASCII 字 + 额外清单。注释里的中文不算（不会显示在画面上）。"""
    chars: set[str] = set()
    for f in sorted(list(MAIN.glob("*.c")) + list(MAIN.glob("*.h"))):
        if f.name.startswith("font_"):
            continue
        code = strip_comments(f.read_text(encoding="utf-8"))
        # ESP_LOGx(...) 的字串是给开发者看的 log，不上画面 → 不收（log 都写成一行）
        code = "\n".join(line for line in code.splitlines() if "ESP_LOG" not in line)
        for lit in re.findall(r'"((?:[^"\\]|\\.)*)"', code):
            chars.update(ch for ch in lit if ord(ch) > 0x7E)
    if EXTRA.exists():
        chars.update(ch for ch in EXTRA.read_text(encoding="utf-8") if ord(ch) > 0x7E and not ch.isspace())
    # LVGL 自己的符号（LV_SYMBOL_*，私用区 U+F000 起）交给 Montserrat，不要收
    return sorted(ch for ch in chars if not (0xF000 <= ord(ch) <= 0xF8FF))


def rasterize(font: ImageFont.FreeTypeFont, ch: str):
    """画一个字：回传 (box_w, box_h, ofs_x, ofs_y, adv_w_1_16, 4bpp 像素列表)。"""
    ascent, _ = font.getmetrics()
    adv = font.getlength(ch)
    l, t, r, b = font.getbbox(ch, anchor="ls")  # 以基线为原点
    w, h = max(0, r - l), max(0, b - t)
    if w == 0 or h == 0:
        return 0, 0, 0, 0, round(adv * 16), []
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((-l, -t), ch, font=font, fill=255, anchor="ls")
    px = [(v * 15 + 127) // 255 for v in img.tobytes()]
    # LVGL：ofs_y = 字框底部离基线多高（往上为正）
    return w, h, l, -b, round(adv * 16), px


def pack4(px: list[int]) -> bytes:
    """PLAIN 4bpp：一个接一个排、高半字节在前，最后补齐到整字节。"""
    out = bytearray()
    for i in range(0, len(px), 2):
        hi = px[i]
        lo = px[i + 1] if i + 1 < len(px) else 0
        out.append((hi << 4) | lo)
    return bytes(out)


def unpack4(data: bytes, start: int, count: int) -> list[int]:
    """照 LVGL lv_font_get_bitmap_fmt_txt（bpp 4、stride 0）的读法解回来。"""
    vals = []
    for i in range(count):
        b = data[start + i // 2]
        vals.append(b >> 4 if i % 2 == 0 else b & 0xF)
    return vals


def build_font(name: str, px: int, chars: list[str], ttf: Path, fallback: str | None) -> str:
    font = ImageFont.truetype(str(ttf), px)
    ascent, descent = font.getmetrics()
    glyphs = []
    bitmap = bytearray()
    for ch in chars:
        w, h, ox, oy, adv, pix = rasterize(font, ch)
        idx = len(bitmap)
        packed = pack4(pix)
        if unpack4(packed, 0, w * h) != pix:   # 逐像素回读比对
            raise SystemExit(f"{name}: {ch!r} 打包后读回来不一样")
        bitmap += packed
        glyphs.append((ch, idx, adv, w, h, ox, oy))

    cps = [ord(g[0]) for g in glyphs]
    start = cps[0]
    if cps[-1] - start >= 0xFFFF:
        raise SystemExit(f"{name}: 码位范围太大，要拆成两段 cmap")
    line_height = ascent + descent
    lines = [
        "// 由 tools/make_font.py 产生，不要手改。字型：思源黑体 Noto Sans SC（SIL OFL 1.1）",
        f"// {len(glyphs)} 个字、{px}px、4bpp；字：{''.join(g[0] for g in glyphs)}",
        '#include "lvgl.h"',
        "",
    ]
    if fallback:
        lines.append(f"extern const lv_font_t {fallback};")
    lines.append(f"static const uint8_t glyph_bitmap[{max(1, len(bitmap))}] = {{")
    for i in range(0, len(bitmap), 24):
        lines.append("    " + ", ".join(f"0x{b:02x}" for b in bitmap[i : i + 24]) + ",")
    if not bitmap:
        lines.append("    0x00,")
    lines.append("};")
    lines.append("static const lv_font_fmt_txt_glyph_dsc_t glyph_dsc[] = {")
    lines.append("    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0},  /* id 0 保留 */")
    for ch, idx, adv, w, h, ox, oy in glyphs:
        lines.append(
            f"    {{.bitmap_index = {idx}, .adv_w = {adv}, .box_w = {w}, .box_h = {h}, .ofs_x = {ox}, .ofs_y = {oy}}},  /* U+{ord(ch):04X} {ch} */"
        )
    lines.append("};")
    lines.append(f"static const uint16_t unicode_list[] = {{ {', '.join(str(c - start) for c in cps)} }};")
    lines += [
        "static const lv_font_fmt_txt_cmap_t cmaps[] = {",
        f"    {{ .range_start = {start}, .range_length = {cps[-1] - start + 1}, .glyph_id_start = 1,",
        f"      .unicode_list = unicode_list, .glyph_id_ofs_list = NULL, .list_length = {len(cps)},",
        "      .type = LV_FONT_FMT_TXT_CMAP_SPARSE_TINY },",
        "};",
        "static const lv_font_fmt_txt_dsc_t font_dsc = {",
        "    .glyph_bitmap = glyph_bitmap, .glyph_dsc = glyph_dsc, .cmaps = cmaps,",
        "    .kern_dsc = NULL, .kern_scale = 0, .cmap_num = 1, .bpp = 4, .kern_classes = 0, .bitmap_format = 0,",
        "};",
        f"const lv_font_t {name} = {{",
        "    .get_glyph_dsc = lv_font_get_glyph_dsc_fmt_txt,",
        "    .get_glyph_bitmap = lv_font_get_bitmap_fmt_txt,",
        f"    .line_height = {line_height},",
        f"    .base_line = {descent},",
        "    .subpx = LV_FONT_SUBPX_NONE,",
        "    .underline_position = -2,",
        "    .underline_thickness = 1,",
        "    .dsc = &font_dsc,",
        f"    .fallback = {'&' + fallback if fallback else 'NULL'},",
        "};",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ttf", required=True, help="NotoSansSC_500Medium.ttf")
    ap.add_argument("--bold-ttf", required=True, help="NotoSansSC_700Bold.ttf（大数字）")
    ap.add_argument("--check", action="store_true", help="只检查 main/font_*.c 是不是最新")
    ap.add_argument("--news-out", help="另外产生晨报字型 font_news_20.c 到这个路径（编译资料夹，不放仓库）")
    args = ap.parse_args()

    news = news_chars()
    if args.news_out:
        Path(args.news_out).write_text(build_font("space_font_news_20", 20, news, Path(args.ttf), "lv_font_montserrat_20"), encoding="utf-8")
        print(f"{args.news_out}：晨报字型 {len(news)} 个字")
        return 0

    cjk = collect_cjk()
    stale = []
    for name, px, kind, weight, fallback in FONTS:
        chars = cjk if kind == "cjk" else sorted(DIGITS)
        ttf = Path(args.ttf if weight == "medium" else args.bold_ttf)
        text = build_font(name, px, chars, ttf, fallback)
        out = MAIN / f"font_{name.removeprefix('space_font_')}.c"
        if args.check:
            if not out.exists() or out.read_text(encoding="utf-8") != text:
                stale.append(out.name)
        else:
            out.write_text(text, encoding="utf-8")
            print(f"{out.relative_to(ROOT)}：{len(chars)} 个字")
    news_text = news_chars_text(news)
    if args.check:
        if not NEWS_CHARS.exists() or NEWS_CHARS.read_text(encoding="utf-8") != news_text:
            stale.append(NEWS_CHARS.name)
    else:
        NEWS_CHARS.write_text(news_text, encoding="utf-8")
        print(f"{NEWS_CHARS.relative_to(ROOT)}：{len(news)} 个字")
    if stale:
        print("字型不是最新（程序里有新的中文字？）：重跑 tools/make_font.py →", ", ".join(stale))
        return 1
    if args.check:
        print(f"字型是最新的（中文 {len(cjk)} 个字）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
