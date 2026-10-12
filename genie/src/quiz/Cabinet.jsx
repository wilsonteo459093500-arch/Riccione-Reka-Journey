// 宝藏页「画出来的柜子」：一格一格的小照片（vignettes/tiles/，和直觉牌同一套家具、材质、光）按客人数的数量拼起来。
// 每一格都是完整的小格子，拼在一起就是一组组合柜；拖滑杆时只换几张图，不重画。
// 怎么重拍这些小样：src/quiz/vignettes/tiles.js（只在开发时用）。

const FILES = import.meta.glob('./vignettes/tiles/*.webp', { eager: true, query: '?url', import: 'default' });
const TILE = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([a-z]+-[a-z0-9]+)-tile\.webp$/.exec(path);
  if (m) TILE[m[1]] = url;
}

// 每种小样的尺寸（像素，宽 × 高）—— 和 tiles.js 里的 px / 高宽比一致
const SIZE = { shoe: [200, 194], book: [320, 142], ratio: [240, 158], door: [96, 512] };

function Tile({ k, kind }) {
  const [w, h] = SIZE[kind];
  return <img className="cab-tile" src={TILE[k] || ''} width={w} height={h} alt="" draggable="false" decoding="async" />;
}

/** 一组柜子：cols × rows 格；cell(c, r) → 小样名 */
function Grid({ kind, cols, rows, cell, className = '', plinth = true }) {
  const [w, h] = SIZE[kind];
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(<Tile key={`${c}-${r}`} k={cell(c, r)} kind={kind} />);
  return (
    <div className={`cab cab-${kind} ${className}`} style={{ '--cols': cols, '--rows': rows, '--ar': w / h }} aria-hidden="true">
      <div className="cab-grid">{cells}</div>
      {plinth && <i className="cab-plinth" />}
    </div>
  );
}

/** 鞋柜：cols 列 × 7 层，按列从上往下摆满 shoes 双 */
export function ShoeCabinet({ cols, shoes, shelves = 7 }) {
  const perCell = 10 / shelves;
  const filled = new Set();
  let left = shoes;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < shelves; r++) {
      if (Math.max(0, Math.min(perCell, left)) > 0.5) filled.add(`${c}-${r}`);
      left -= perCell;
    }
  return <Grid kind="shoe" cols={cols} rows={shelves} cell={(c, r) => (filled.has(`${c}-${r}`) ? `shoe-${((c * 3 + r) % 4) + 1}` : 'shoe-0')} />;
}

/** 书墙：5 × 3 格，每格 = 一层 800mm 的书 */
export function BookWall({ n }) {
  return <Grid kind="book" cols={5} rows={3} cell={(c, r) => (r * 5 + c < Math.min(15, n) ? `book-${((r * 5 + c) % 3) + 1}` : 'book-0')} />;
}

/** 藏 vs 展：4 × 3 格，open = 打开的格子（其余是门） */
export function RatioWall({ open }) {
  return <Grid kind="ratio" cols={4} rows={3} cell={(c, r) => (open.has(r * 4 + c) ? `ratio-${((r * 4 + c) % 3) + 1}` : 'ratio-0')} />;
}

/** 衣柜：have 扇现有的门 + 虚线框出还差的门（到 target 扇） */
export function Wardrobe({ have, target }) {
  const [w, h] = SIZE.door;
  return (
    <div className="cab cab-door" style={{ '--cols': target, '--rows': 1, '--ar': w / h }} aria-hidden="true">
      <i className="cab-top" />
      <div className="cab-grid">
        {[...Array(target)].map((_, i) => (i < have ? <Tile key={i} k={i % 2 ? 'door-l' : 'door-r'} kind="door" /> : <span key={i} className="cab-ghost" />))}
      </div>
      <i className="cab-plinth" />
    </div>
  );
}
