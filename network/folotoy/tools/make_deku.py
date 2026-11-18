#!/usr/bin/env python3
"""DEKU 句库 → FoloToy 程序 + 手机 app 资料（只放用户审过、status = approved 的句子）。

  python3 tools/make_deku.py           # 产生 main/deku_lines.c、android/app/src/main/assets/deku.json
  python3 tools/make_deku.py --check   # 只检查是不是最新（build.sh 每次跑）

句库在 deku/lines.json。名人的话只放原话，附出处；没审过（draft）、不要的（rejected）都不放。
产生之后要重跑 tools/make_font.py（新的中文字），build.sh 会检查。
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "deku" / "lines.json"
OUT_C = ROOT / "main" / "deku_lines.c"
OUT_JSON = ROOT / "android" / "app" / "src" / "main" / "assets" / "deku.json"

KINDS = {"joke": "DEKU_JOKE", "inamori": "DEKU_INAMORI", "kuok": "DEKU_KUOK", "musk": "DEKU_MUSK"}
WHO = {"inamori": "稻盛和夫", "kuok": "郭鹤年", "musk": "Elon Musk"}
WHO_SHORT = {"inamori": "稻盛和夫", "kuok": "郭鹤年", "musk": "Musk"}   # FoloToy 屏幕上出处那一行（窄）


def c_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def display_source(line: dict) -> str:
    if line["kind"] == "joke":
        return ""
    where = line.get("show")
    if not where:
        m = re.search(r"《[^》]+》", line.get("source", ""))
        where = m.group(0) if m else re.split(r"[（；，(]", line.get("source", ""))[0].strip()
    who = WHO_SHORT[line["kind"]]
    if not where:
        return f"——{who}"
    one = f"——{who}{where}" if where.startswith("《") else f"——{who} · {where}"   # 书名号自己会分开，不用「 · 」
    # 屏幕一行约 212px：太长就在人名后面换行（不要让 FoloToy 从书名中间切开）
    return one if rough_width(one) <= 200 else f"——{who}\n{where}"


def rough_width(s: str) -> float:
    """粗估 20px 字的宽度（中文 / 全形 20、英文数字 12、空白 5）：宁可估宽一点。"""
    return sum(5 if c == " " else 12 if ord(c) < 0x80 else 20 for c in s)


def load() -> list[dict]:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    out, seen = [], set()
    for line in data["lines"]:
        lid = line["id"]
        if lid in seen:
            raise SystemExit(f"id 重复：{lid}")
        seen.add(lid)
        if line["kind"] not in KINDS:
            raise SystemExit(f"{lid}：不认识的 kind {line['kind']}")
        if line.get("status") not in ("draft", "approved", "rejected"):
            raise SystemExit(f"{lid}：status 要是 draft / approved / rejected")
        if not re.fullmatch(r"[A-Z][0-9]{2,6}", lid):
            raise SystemExit(f"{lid}：id 要像 J01")
        if line["kind"] != "joke" and not line.get("source"):
            raise SystemExit(f"{lid}：名人的话一定要有出处")
        if line["kind"] == "musk" and not line.get("en"):
            raise SystemExit(f"{lid}：Musk 要附英文原句")
        if line.get("status") == "approved":
            out.append(line)
    return out


def make_c(lines: list[dict]) -> str:
    rows = [
        f"    {{ {c_str(l['id'])}, {KINDS[l['kind']]}, {c_str(l['zh'])}, {c_str(display_source(l))} }},"
        for l in lines
    ]
    body = "\n".join(rows) if rows else "    { \"\", DEKU_JOKE, \"\", \"\" },   // 还没有审过的句子（占位，不算数）"
    return (
        "// deku_lines.c —— tools/make_deku.py 从 deku/lines.json 产生，不要手改。\n"
        "// 只有用户审过（status = approved）的句子。\n"
        '#include "deku_model.h"\n\n'
        "const deku_line_t DEKU_LINES[] = {\n" + body + "\n};\n"
        f"const size_t DEKU_LINE_COUNT = {len(lines)};\n"
    )


def make_json(lines: list[dict]) -> str:
    keep = []
    for l in lines:
        item = {"id": l["id"], "kind": l["kind"], "zh": l["zh"]}
        if l.get("en"):
            item["en"] = l["en"]
        if l["kind"] != "joke":
            item["who"] = WHO[l["kind"]]
            item["source"] = l["source"]
        keep.append(item)
    return json.dumps({"lines": keep}, ensure_ascii=False, indent=1) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    lines = load()
    want = {OUT_C: make_c(lines), OUT_JSON: make_json(lines)}
    if args.check:
        stale = [p.name for p, t in want.items() if not p.exists() or p.read_text(encoding="utf-8") != t]
        if stale:
            print("DEKU 句库不是最新：重跑 tools/make_deku.py →", ", ".join(stale))
            return 1
        print(f"DEKU 句库是最新的（审过 {len(lines)} 句）")
        return 0
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    for p, t in want.items():
        p.write_text(t, encoding="utf-8")
    print(f"DEKU：审过 {len(lines)} 句 → {OUT_C.relative_to(ROOT)}、{OUT_JSON.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
