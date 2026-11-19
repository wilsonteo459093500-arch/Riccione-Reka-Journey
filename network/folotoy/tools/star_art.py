"""S.T.A.R 的像素画（原创角色，2026-11-19 用户选定；不是任何游戏角色）。

32×32 格：胖胖的五角星（左上亮、右下暗的像素阴影、粗黑边）+ 笑脸（圆眼睛带亮点、腮红、张嘴）。
表情：idle 平常 / blink 眨眼 / listen 在听（眼睛睁大、小 o 嘴）/ think 想（眼睛往上看、平嘴）/ say 说话（张大嘴、舌头）。
make_cover.py（封面预览）、make_star.py（韧体图）共用这一份。
"""
from __future__ import annotations

import math

from PIL import Image, ImageDraw

N = 32
GOLD = (255, 206, 64)
GOLD_L = (255, 236, 140)
GOLD_D = (226, 150, 40)
INK = (24, 18, 14)
WHITE = (255, 255, 255)
TONGUE = (226, 78, 78)
BLUSH = (255, 140, 150)
SPARK = (255, 250, 200)
FACES = ("idle", "blink", "listen", "think", "say")


def _mask() -> Image.Image:
    pts = []
    for i in range(10):
        r = 14.6 if i % 2 == 0 else 7.6
        a = math.radians(-90 + i * 36)
        pts.append((15.5 + r * math.cos(a), 17.0 + r * math.sin(a)))
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    px = m.load()
    for y in range(N):   # 去掉太尖的单格，角会圆一点
        for x in range(N):
            if px[x, y]:
                nb = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < N and 0 <= y + dy < N and px[x + dx, y + dy])
                if nb <= 1:
                    px[x, y] = 0
    return m


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

    if mode == "blink":
        r(11, 16, 13, 16, INK)
        r(18, 16, 20, 16, INK)
    elif mode == "think":
        for ex in (11, 18):
            r(ex, 15, ex + 2, 17, INK)
            d[ex + 2, 15] = WHITE + (255,)
    else:
        top = 14 if mode == "listen" else 15
        for ex in (11, 18):
            r(ex, top, ex + 2, 17, INK)
            d[ex, top] = WHITE + (255,)
    r(9, 19, 10, 19, BLUSH)
    r(21, 19, 22, 19, BLUSH)
    if mode in ("idle", "blink"):
        r(14, 19, 17, 20, INK)
        d[13, 19] = INK + (255,)
        d[18, 19] = INK + (255,)
    elif mode == "say":
        r(14, 19, 17, 21, INK)
        r(15, 21, 16, 21, TONGUE)
    elif mode == "listen":
        r(15, 20, 16, 21, INK)
    elif mode == "think":
        r(14, 21, 17, 21, INK)


def star(mode: str = "idle") -> Image.Image:
    """32×32 RGBA"""
    m = _mask().load()
    im = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    p = im.load()
    for y in range(N):
        for x in range(N):
            if m[x, y]:
                dark = not (x + 1 < N and m[x + 1, y]) or not (y + 1 < N and m[x, y + 1])
                light = not (x - 1 >= 0 and m[x - 1, y]) or not (y - 1 >= 0 and m[x, y - 1])
                p[x, y] = (GOLD_D if dark else GOLD_L if light else GOLD) + (255,)
    _face(im, mode)
    return _outline(im)


def sparkle() -> Image.Image:
    """7×7 小闪光（十字）"""
    im = Image.new("RGBA", (7, 7), (0, 0, 0, 0))
    for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        im.putpixel((3 + dx, 3 + dy), SPARK + (255,))
    return im
