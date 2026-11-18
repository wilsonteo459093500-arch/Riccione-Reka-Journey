"""把模拟画面转成 PNG、用 OpenCV 扫二维码，并拼一张对照图。

用法：python scan_qr.py <资料夹> <预期网址1> [<预期网址2> ...]
  资料夹里的 *.ppm 照档名顺序扫；每张扫出的网址要在预期清单里，扫不到或不对就失败。
"""
import sys
from pathlib import Path

import cv2
from PIL import Image


def main() -> int:
    folder = Path(sys.argv[1])
    expected = set(sys.argv[2:])
    shots = sorted(folder.glob("*.ppm"))
    if not shots:
        print("没有画面")
        return 1
    detector = cv2.QRCodeDetector()
    ok = True
    images = []
    for ppm in shots:
        png = ppm.with_suffix(".png")
        Image.open(ppm).save(png)
        images.append(Image.open(png).convert("RGB"))
        text, _, _ = detector.detectAndDecode(cv2.imread(str(png)))
        good = text in expected
        ok &= good
        print(f"{'PASS' if good else 'FAIL'}  {png.name} → {text or '（扫不到）'}")
    # 对照图：画面并排、2 倍放大（不糊）
    gap = 20
    sheet = Image.new("RGB", (len(images) * (240 + gap) - gap, 320), "white")
    for i, im in enumerate(images):
        sheet.paste(im, (i * (240 + gap), 0))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(folder / "screens.png")
    print(f"对照图：{folder / 'screens.png'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
