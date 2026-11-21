#!/usr/bin/env python3
"""VISI 内置图库：找「同一张」的照片（tools/visi/same-shot.mjs 叫它，不用单独跑）。

stdin  JSON  {"photos": [{"id", "file", "new": bool}], "all": bool}
stdout JSON  {"pairs": [{"a", "b", "d": dHash 距离, "ncc": 模板比对分数, "f": 裁切占原图宽度的比例}]}

两种「同一张」：
  1. 连拍、同一个档存了两份、缩过的：dHash（9×8 灰阶，64 bit）距离小
  2. 一张是另一张裁出来的：把小的那张缩成几种大小，在大的那张上滑着比（去平均的 NCC），分数高
只比「至少一张是新的」的配对（all = true 才全部两两比）。只回有嫌疑的：d ≤ 14 或 ncc ≥ 0.85。
只用 PIL + numpy（这台机器没有 OpenCV）。
"""
import json
import sys

import numpy as np
from PIL import Image

COARSE_W, FINE_W = 48, 128
SCALES = np.geomspace(0.28, 1.0, 10)
MIN_SIDE = 10


def load(path):
    im = Image.open(path).convert('L')
    px = np.asarray(im.resize((9, 8), Image.LANCZOS), dtype=np.int16)
    bits = (px[:, 1:] > px[:, :-1]).flatten()
    return {'im': im, 'bits': bits, 'cache': {}}


def gray(p, w):
    """缩到宽 w 的灰阶阵列（算过的留着）"""
    if w not in p['cache']:
        im = p['im']
        h = max(1, round(im.height * w / im.width))
        p['cache'][w] = np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32)
    return p['cache'][w]


def big_of(p, w):
    """大的那张缩到宽 w：灰阶、FFT、积分图（算过的留着）"""
    key = ('big', w)
    if key not in p['cache']:
        g = gray(p, w).astype(np.float64)
        i1 = np.zeros((g.shape[0] + 1, g.shape[1] + 1))
        i2 = np.zeros_like(i1)
        i1[1:, 1:] = g.cumsum(0).cumsum(1)
        i2[1:, 1:] = (g * g).cumsum(0).cumsum(1)
        p['cache'][key] = (g.shape, np.fft.rfft2(g), i1, i2)
    return p['cache'][key]


def ncc_at(big_p, w, small_p, tw):
    """small 缩到宽 tw，在 big（宽 w）上滑：回最高的 NCC（放不下回 -1）。
    分子用 FFT 一次算完所有位置，每个窗口的平方和用积分图。"""
    (H, W), F, i1, i2 = big_of(big_p, w)
    t = gray(small_p, tw).astype(np.float64)
    th = t.shape[0]
    if tw < MIN_SIDE or th < MIN_SIDE or th > H or tw > W:
        return -1.0
    t0 = t - t.mean()
    tn = float(np.sqrt((t0 * t0).sum()))
    if tn < 1e-3:
        return -1.0
    num = np.fft.irfft2(F * np.conj(np.fft.rfft2(t0, s=(H, W))), s=(H, W))[:H - th + 1, :W - tw + 1]
    s1 = i1[th:, tw:] - i1[:-th, tw:] - i1[th:, :-tw] + i1[:-th, :-tw]
    s2 = i2[th:, tw:] - i2[:-th, tw:] - i2[th:, :-tw] + i2[:-th, :-tw]
    den = np.sqrt(np.maximum(s2 - s1 * s1 / (th * tw), 1e-6)) * tn
    return float((num / den).max())


def crop_score(a, b):
    """b 是不是 a 裁出来的（或同一张缩过的）：回 (ncc, f)"""
    best, bf = -1.0, 0.0
    for f in SCALES:
        s = ncc_at(a, COARSE_W, b, int(round(COARSE_W * f)))
        if s > best:
            best, bf = s, float(f)
    if best < 0.7:
        return best, bf
    fine, ff = -1.0, bf
    for f in bf * np.linspace(0.88, 1.12, 9):
        if f > 1.0:
            continue
        s = ncc_at(a, FINE_W, b, int(round(FINE_W * f)))
        if s > fine:
            fine, ff = s, float(f)
    return fine, ff


def main():
    req = json.load(sys.stdin)
    ph = req['photos']
    P = [load(p['file']) for p in ph]
    pairs = []
    for i in range(len(ph)):
        for j in range(i + 1, len(ph)):
            if not (req.get('all') or ph[i].get('new') or ph[j].get('new')):
                continue
            d = int((P[i]['bits'] != P[j]['bits']).sum())
            s1, f1 = crop_score(P[i], P[j])
            s2, f2 = crop_score(P[j], P[i])
            ncc, f = (s1, f1) if s1 >= s2 else (s2, f2)
            if d <= 14 or ncc >= 0.85:
                pairs.append({'a': ph[i]['id'], 'b': ph[j]['id'], 'd': d, 'ncc': round(ncc, 3), 'f': round(f, 2)})
    json.dump({'pairs': pairs}, sys.stdout)


if __name__ == '__main__':
    main()
