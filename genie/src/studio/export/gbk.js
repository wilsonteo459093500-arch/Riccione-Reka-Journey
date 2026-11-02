// GBK 反查表（字 → 两个字节），给酷家乐用的 DXF：中文版 AutoCAD 存 R2000 DXF 就是 GBK（$DWGCODEPAGE ANSI_936）。
// 用浏览器 / Node 自带的 TextDecoder('gbk') 一行一行解出来（0x81–0xFE 首字节 × 0x40–0xFE 尾字节，跳过 0x7F），
// 第一次用到时才建（约 2.4 万字，Node 里约 100ms），不用任何字库文件。

let TABLE = null;

/** Map<字, [b1, b2]>；这台设备没有 GBK 解码器 → 空表（调用方退回 \U+XXXX） */
export function gbkTable() {
  if (TABLE) return TABLE;
  TABLE = new Map();
  let dec;
  try {
    dec = new TextDecoder('gbk');
  } catch {
    return TABLE;
  }
  const trail = [];
  for (let b = 0x40; b <= 0xfe; b++) if (b !== 0x7f) trail.push(b);
  for (let a = 0x81; a <= 0xfe; a++) {
    // 一行：a b1 \n a b2 \n …（\n 永远不会被当成尾字节吃掉，解出来按 \n 切开，一个格子对一个码）
    const buf = new Uint8Array(trail.length * 3);
    trail.forEach((b, i) => {
      buf[i * 3] = a;
      buf[i * 3 + 1] = b;
      buf[i * 3 + 2] = 0x0a;
    });
    const parts = dec.decode(buf).split('\n');
    trail.forEach((b, i) => {
      const ch = parts[i];
      if (ch && ch.length === 1 && ch !== '�' && ch.charCodeAt(0) >= 0x80 && !TABLE.has(ch)) TABLE.set(ch, [a, b]);
    });
  }
  return TABLE;
}

export const hasGbk = (ch) => gbkTable().has(ch);
