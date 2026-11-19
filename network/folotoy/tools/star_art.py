"""S.T.A.R 的像素画（原创角色；不是任何游戏 / 品牌的角色）。

2026-11-19 第二版「圆胖软星」（用户从三个试稿里选 B）：
  用户给的参考是大卡司的星星、马力欧银河的 Luma；只取「胖胖软软、角圆圆、长椭圆眼睛」的感觉，
  没有照画（不放 Luma 头上的卷毛、没嘴巴的脸，也不放大卡司的托腮手和黑圆底）。

32×32 格：角圆一点、胖一点的五角星（左上亮边、下面一层暖橘、右下暗边、粗黑边）
  + 长椭圆眼睛带白亮点、腮红、小嘴。
表情：idle 平常 / blink 眨眼 / listen 在听（眼睛睁大、小 o 嘴）/ think 想（眼睛往右上看、平嘴）/ say 说话（张嘴、舌头）。
make_cover.py（封面预览）、make_star.py（韧体图）共用这一份。
"""
from __future__ import annotations

import math

from PIL import Image, ImageDraw, ImageFilter

N = 32
GOLD = (255, 206, 64)
GOLD_L = (255, 236, 140)
GOLD_D = (236, 150, 48)
GOLD_DD = (214, 116, 40)
INK = (24, 18, 14)
WHITE = (255, 255, 255)
TONGUE = (226, 78, 78)
BLUSH = (255, 130, 140)
SPARK = (255, 250, 200)
FACES = ("idle", "blink", "listen", "think", "say")


def _mask() -> Image.Image:
    """胖五角星（内外半径比 0.56），先放大 8 倍画、模糊再取阈值让角变圆，再缩回 32 格。"""
    ss = 8
    big = Image.new("L", (N * ss, N * ss), 0)
    pts = []
    for i in range(10):
        r = 14.8 if i % 2 == 0 else 14.8 * 0.56
        a = math.radians(-90 + i * 36)
        pts.append(((15.5 + r * math.cos(a)) * ss, (16.8 + r * math.sin(a)) * ss))
    ImageDraw.Draw(big).polygon(pts, fill=255)
    big = big.filter(ImageFilter.GaussianBlur(1.3 * ss)).point(lambda v: 255 if v > 140 else 0)
    return big.resize((N, N), Image.BOX).point(lambda v: 255 if v >= 128 else 0)


def _body(m) -> Image.Image:
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    p = im.load()
    ys = [y for y in range(N) for x in range(N) if m[x, y]]
    y0, y1 = min(ys), max(ys)
    for y in range(N):
        for x in range(N):
            if not m[x, y]:
                continue
            dark = not (x + 1 < N and m[x + 1, y]) or not (y + 1 < N and m[x, y + 1])
            light = not (x - 1 >= 0 and m[x - 1, y]) or not (y - 1 >= 0 and m[x, y - 1])
            t = (y - y0) / (y1 - y0)
            c = GOLD_D if t > 0.78 else GOLD   # 下面一层暖橘：看起来胖胖、有厚度
            if dark:
                c = GOLD_DD if t > 0.6 else GOLD_D
            elif light:
                c = GOLD_L
            p[x, y] = c + (255,)
    return im


def _outline(im: Image.Image) -> Image.Image:
    src = im.copy()
    s, d = src.load(), im.load()
    for y in range(N):
        for x in range(N):
            if s[x, y][3] == 0 and any(
                0 <= x + dx < N and 0 <= y + dy < N and s[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                d[x, y] = INK + (255,)
    return im


def _face(im: Image.Image, mode: str) -> None:
    d = im.load()

    def r(x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                d[x, y] = c + (255,)

    # 眼睛：2 格宽的长椭圆，左上一格白亮点（左眼 x=11、右眼 x=18）
    if mode == "blink":
        r(11, 16, 12, 16, INK)
        r(18, 16, 19, 16, INK)
    elif mode == "think":   # 往右上看：眼睛短一点、亮点在右边
        for ex in (11, 18):
            r(ex, 12, ex + 1, 15, INK)
            d[ex + 1, 12] = WHITE + (255,)
    else:
        top = 11 if mode == "listen" else 12   # 在听：眼睛睁大一格
        for ex in (11, 18):
            r(ex, top, ex + 1, 16, INK)
            d[ex, top] = WHITE + (255,)
    r(8, 18, 9, 18, BLUSH)
    r(21, 18, 22, 18, BLUSH)
    if mode in ("idle", "blink"):   # 小小的笑
        for x, y in ((14, 19), (15, 20), (16, 20), (17, 19)):
            d[x, y] = INK + (255,)
    elif mode == "say":             # 张嘴 + 舌头
        r(14, 19, 17, 21, INK)
        r(15, 21, 16, 21, TONGUE)
    elif mode == "listen":          # 小 o 嘴
        r(15, 19, 16, 20, INK)
    elif mode == "think":           # 平嘴
        r(14, 20, 17, 20, INK)


def star(mode: str = "idle") -> Image.Image:
    """32×32 RGBA"""
    im = _body(_mask().load())
    _face(im, mode)
    return _outline(im)


def sparkle() -> Image.Image:
    """7×7 小闪光（十字）"""
    im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        im.putpixel((3 + dx, 3 + dy), SPARK + (255,))
    return im
