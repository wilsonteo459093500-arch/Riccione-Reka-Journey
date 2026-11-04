#!/usr/bin/env python3
# ============================================================
# 案例库上传页测试用的假文件夹（PIL 画出来的方块「房间」，不是真的照片）
# 用法：python3 -I tools/caselib/test/upload-fixtures.py <输出资料夹>
# 产生在 scratchpad，绝不放进 git。项目名都是假的（区域 风格 称呼）。
#
# <out>/案例图/                       ← 总文件夹：3 个子文件夹 = 3 个项目
# （Chromium 要用 LANG=C.UTF-8 启动才读得到中文路径的档案，见 upload-kit.mjs）
#   Setia Alam 原木 陈先生/            IMG_0001、近似重复（连拍）的 IMG_0002、EXIF 转向 6 的 IMG_0003_rot、
#                                      shared.jpg、厨房/K_01.jpg、厨房/K_02.png、
#                                      厨房/Thumbs.db、IMG_0005.HEIC、clip.mp4
#   M Vertica 奶油风 林太太/           big_6000.jpg（6000×4000）、shared.jpg（同一个档）、V_02.jpg、brief.pdf、DSC_001.NEF
#   Bangsar 轻法式 Mr Tan/             B_01..B_03.jpg、.DS_Store、huge.jpg（61 MB，稀疏档）
#   desktop.ini、Thumbs.db
# <out>/solo-a/Ipoh 日式 黄小姐/       4 张（两个视窗同时上传用）
# <out>/solo-b/Puchong 北欧 Mdm Lee/   4 张
# <out>/many/Klang 现代简约 Mr Ong/    26 张（中途断线再续传用）
# <out>/curate/                       ← 精选用：2 个项目
#   Cheras 现代 测试客户/              厨房/K_01、K_01b（K_01 的连拍）、K_02、K_03_tall（直的）、
#                                      主卧/M_01、M_01b（M_01 的连拍）、M_02、电视墙/T_01、T_02  → 9 张、7 个镜头
#   Kepong 简约 测试/                  P_01..P_05（各不相同）
# <out>/burst/Rawang 连拍 测试客户/    「同一个镜头」的两种连拍：IMG_A、IMG_A_burst（多了一个小东西，dHash 0–1）、
#                                      IMG_A_reframed（裁 2%、亮 8%：手动了一点再拍）、IMG_B（不一样的）
#                                      reframed 在 1200px 下 dHash 差 7（> SAME_SHOT 6）：已知的缺口，测试用 todo 记着
# 印出一行 JSON：每个文件夹的路径和预期数字
# ============================================================
import json
import os
import random
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance


def scene(seed, w, h):
    """一个「房间」：上墙下地的渐层 + 几个大方块（柜子）+ 一点杂讯。大块面让 dHash 稳定。"""
    rnd = random.Random(seed)
    top = np.array([rnd.randint(120, 240) for _ in range(3)], dtype=np.float32)
    bot = np.array([rnd.randint(30, 160) for _ in range(3)], dtype=np.float32)
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    arr = top * (1 - t) + bot * t
    arr = np.broadcast_to(arr, (h, w, 3)).copy()
    img = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(img)
    for _ in range(rnd.randint(5, 9)):
        x0 = rnd.randint(0, w * 3 // 4)
        y0 = rnd.randint(0, h * 3 // 4)
        x1 = min(w, x0 + rnd.randint(w // 8, w // 2))
        y1 = min(h, y0 + rnd.randint(h // 8, h // 2))
        col = tuple(rnd.randint(0, 255) for _ in range(3))
        d.rectangle([x0, y0, x1, y1], fill=col)
        # 柜门的分隔线
        for k in range(1, rnd.randint(2, 4)):
            xx = x0 + (x1 - x0) * k // 4
            d.line([xx, y0, xx, y1], fill=tuple(max(0, c - 40) for c in col), width=max(2, w // 400))
    noise = np.random.default_rng(seed).normal(0, 4, (h, w, 3)).astype(np.float32)
    out = (np.asarray(img, dtype=np.float32) + noise).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGB')


def near_dup(img):
    """同一个镜头再拍一张：画面一样，只多了一个小东西（像连拍时有人走过）。
    dHash 距离 0–4（≤ 6 = 同一个镜头）。裁边、调亮的连拍在 1200px 下会差 7 以上 —— 那种另外放在 burst/（reframed）"""
    near = img.copy()
    d = ImageDraw.Draw(near)
    w, h = near.size
    x0, y0 = int(w * 0.62), int(h * 0.58)
    d.rectangle([x0, y0, x0 + int(w * 0.05), y0 + int(h * 0.05)], fill=(232, 226, 214))
    return near


def reframed(img):
    """同一个镜头、手动了一点再拍：裁掉一点边、亮一点（原本 IMG_0002 的做法）。
    1200px 下 dHash 差 4–16（多半 > 6）：pick.js / 伺服器都不会当成同一个镜头 —— 已知的缺口（见 upload-e2e 的 todo 测试）"""
    cw, ch = img.size
    near = img.crop((int(cw * 0.02), int(ch * 0.02), int(cw * 0.985), int(ch * 0.985))).resize(img.size, Image.LANCZOS)
    return ImageEnhance.Brightness(near).enhance(1.08)


def save_jpg(img, path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'JPEG', quality=88, **kw)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)


def main(out):
    out = os.path.abspath(out)
    if os.path.isdir(out):
        shutil.rmtree(out)
    root = os.path.join(out, '案例图')
    setia = os.path.join(root, 'Setia Alam 原木 陈先生')
    vert = os.path.join(root, 'M Vertica 奶油风 林太太')
    bang = os.path.join(root, 'Bangsar 轻法式 Mr Tan')

    # --- Setia Alam ---
    a = scene(101, 2400, 1600)
    save_jpg(a, os.path.join(setia, 'IMG_0001.jpg'))
    # 近似重复：同一个镜头再拍一张（连拍）
    save_jpg(near_dup(a), os.path.join(setia, 'IMG_0002.jpg'))
    # EXIF 转向 6：存的是横的 1200×800，看起来是直的 800×1200；再塞 GPS，确认上传后没有 EXIF
    rot = scene(103, 1200, 800)
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x8825] = {1: 'N', 2: (3.0, 4.0, 5.0), 3: 'E', 4: (101.0, 30.0, 0.0)}
    save_jpg(rot, os.path.join(setia, 'IMG_0003_rot.jpg'), exif=exif.tobytes())
    shared = scene(104, 1800, 1200)
    save_jpg(shared, os.path.join(setia, 'shared.jpg'))
    save_jpg(scene(105, 2000, 1500), os.path.join(setia, '厨房', 'K_01.jpg'))
    png = scene(106, 1800, 1200)
    os.makedirs(os.path.join(setia, '厨房'), exist_ok=True)
    png.save(os.path.join(setia, '厨房', 'K_02.png'), 'PNG')
    write(os.path.join(setia, '厨房', 'Thumbs.db'), b'\xd0\xcf\x11\xe0fake-thumbs')
    write(os.path.join(setia, 'IMG_0005.HEIC'), b'\x00\x00\x00\x18ftypheic' + os.urandom(2000))
    write(os.path.join(setia, 'clip.mp4'), b'\x00\x00\x00\x18ftypmp42' + os.urandom(3000))

    # --- M Vertica ---
    save_jpg(scene(201, 6000, 4000), os.path.join(vert, 'big_6000.jpg'))
    shutil.copyfile(os.path.join(setia, 'shared.jpg'), os.path.join(vert, 'shared.jpg'))
    save_jpg(scene(203, 1600, 1200), os.path.join(vert, 'V_02.jpg'))
    write(os.path.join(vert, 'brief.pdf'), b'%PDF-1.4 fake\n')
    write(os.path.join(vert, 'DSC_001.NEF'), b'MM\x00*' + os.urandom(4000))

    # --- Bangsar ---
    for i in range(3):
        save_jpg(scene(301 + i, 1800, 1200), os.path.join(bang, 'B_0%d.jpg' % (i + 1)))
    write(os.path.join(bang, '.DS_Store'), b'\x00\x00\x00\x01Bud1')
    # 61 MB：稀疏档，不占磁碟；只看大小就会被略过，不会被读
    with open(os.path.join(bang, 'huge.jpg'), 'wb') as f:
        f.truncate(61 * 1024 * 1024)

    write(os.path.join(root, 'desktop.ini'), b'[.ShellClassInfo]\r\n')
    write(os.path.join(root, 'Thumbs.db'), b'\xd0\xcf\x11\xe0root-thumbs')

    # --- 两个视窗同时上传用 ---
    solo_a = os.path.join(out, 'solo-a', 'Ipoh 日式 黄小姐')
    solo_b = os.path.join(out, 'solo-b', 'Puchong 北欧 Mdm Lee')
    for i in range(4):
        save_jpg(scene(401 + i, 1600, 1100), os.path.join(solo_a, 'A_%02d.jpg' % (i + 1)))
        save_jpg(scene(501 + i, 1600, 1100), os.path.join(solo_b, 'P_%02d.jpg' % (i + 1)))

    # --- 续传用：26 张（跨过 20 张登记一次）---
    many = os.path.join(out, 'many', 'Klang 现代简约 Mr Ong')
    for i in range(26):
        save_jpg(scene(601 + i, 1400, 1000), os.path.join(many, 'K%02d.jpg' % (i + 1)))

    # --- 精选用 ---
    curate = os.path.join(out, 'curate')
    cheras = os.path.join(curate, 'Cheras 现代 测试客户')
    k1 = scene(701, 2000, 1333)
    save_jpg(k1, os.path.join(cheras, '厨房', 'K_01.jpg'))
    save_jpg(near_dup(k1), os.path.join(cheras, '厨房', 'K_01b.jpg'))
    save_jpg(scene(702, 2000, 1333), os.path.join(cheras, '厨房', 'K_02.jpg'))
    save_jpg(scene(703, 1000, 1500), os.path.join(cheras, '厨房', 'K_03_tall.jpg'))
    m1 = scene(711, 1800, 1200)
    save_jpg(m1, os.path.join(cheras, '主卧', 'M_01.jpg'))
    save_jpg(near_dup(m1), os.path.join(cheras, '主卧', 'M_01b.jpg'))
    save_jpg(scene(712, 1800, 1200), os.path.join(cheras, '主卧', 'M_02.jpg'))
    save_jpg(scene(721, 1800, 1200), os.path.join(cheras, '电视墙', 'T_01.jpg'))
    save_jpg(scene(722, 1800, 1200), os.path.join(cheras, '电视墙', 'T_02.jpg'))
    kepong = os.path.join(curate, 'Kepong 简约 测试')
    for i in range(5):
        save_jpg(scene(731 + i, 1600, 1100), os.path.join(kepong, 'P_%02d.jpg' % (i + 1)))

    # --- 两种连拍（一个镜头）---
    burst = os.path.join(out, 'burst', 'Rawang 连拍 测试客户')
    ba = scene(802, 2400, 1600)
    save_jpg(ba, os.path.join(burst, 'IMG_A.jpg'))
    save_jpg(near_dup(ba), os.path.join(burst, 'IMG_A_burst.jpg'))
    save_jpg(reframed(ba), os.path.join(burst, 'IMG_A_reframed.jpg'))
    save_jpg(scene(803, 2400, 1600), os.path.join(burst, 'IMG_B.jpg'))

    info = {
        'root': root,
        'projects': {
            'Setia Alam 原木 陈先生': {'photos': 6, 'skipped': 3},
            'M Vertica 奶油风 林太太': {'photos': 3, 'skipped': 2},
            'Bangsar 轻法式 Mr Tan': {'photos': 3, 'skipped': 2},
        },
        'rootSkipped': 2,
        'photoFiles': 12,
        'unique': 11,
        'soloA': solo_a,
        'soloB': solo_b,
        'many': many,
        'manyN': 26,
        'curate': curate,
        'cheras': 'Cheras 现代 测试客户',
        'kepong': 'Kepong 简约 测试',
        'burst': burst,
        'burstName': 'Rawang 连拍 测试客户',
    }
    print(json.dumps(info, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: upload-fixtures.py <out-dir>', file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1])
