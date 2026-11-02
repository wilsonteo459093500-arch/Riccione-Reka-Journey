// R · 这是你的家吗？（SPEC §5.5）—— 读好的户型图画成一张小平面（房间按 3D 工作室的 ROOM_TYPES 上色），
// 点一下房间就能改它的名字（卧室 · 儿童房 · 书房 · 储物间 · 主卧 · 客厅 · 餐厅 · 厨房 · 浴室 · 阳台 · 不是房间）。
// 和客人在「你的家」答的房数对不上 → 轻轻提一句。永远不提 AI、key、模型（ImportFlow 的 friendly() 规则）。
//   · L 形的房间（读出来是 id、id-2 好几块）画成一个形状、一个名字，算一间，改名字也整间一起改（planRooms.js）；
//   · 客人说有两层、只读到一层（readPlan 的 issues: code 'floors'）→ 「再拍下一层」：手机 = 相机 / 文件，
//     许愿模式 = 页面里的相机 / 请员工上传（客人这里永远没有文件选择）。读好了叠在上面（readPlan.appendFloor）。

import { useMemo, useRef, useState } from 'react';
import { RotateCcw, Check, Camera as CameraIcon, ImageUp, UserPlus, Layers } from 'lucide-react';
import { t, L, isEn } from '../../shared/i18n.js';
import { ROOM_TYPES, bounds, FLOOR_NAMES } from '../../studio/plan/model.js';
import { fmtSqft, floorsText } from '../../shared/home.js';
import { Head } from './kit.jsx';
import { baseId, roomGroups, planFacts, outlinePath, fitLabel, SHORT_EN } from './planRooms.js';

export { planFacts } from './planRooms.js';

export const RELABEL = ['bedroom', 'kids', 'study', 'store', 'master', 'living', 'dining', 'kitchen', 'bath', 'balcony'];

const same = (r, roomId) => r.id === roomId || baseId(r.id) === baseId(roomId);
/** 读图模块还没有 relabelRoom / removeRoom 的时候用的一份（纯函数，不改原来的；L 形的几块一起改） */
export function relabelLocal(plan, roomId, type) {
  return { ...plan, floors: (plan.floors || []).map((f) => ({ ...f, rooms: (f.rooms || []).map((r) => (same(r, roomId) && !r.stairId ? { ...r, type, name: '' } : r)) })) };
}
export function removeLocal(plan, roomId) {
  return {
    ...plan,
    floors: (plan.floors || []).map((f) => ({ ...f, rooms: (f.rooms || []).filter((r) => !same(r, roomId) || r.stairId), openings: f.openings })),
  };
}

/** 房间的名字：中文本来就短（「车廊 / 前院」只写前半）；英文放不下用短的 */
const fullName = (T) => (T ? (isEn() ? L(T) : String(T.zh).split(' / ')[0]) : '');
const shortName = (type, T) => (isEn() ? SHORT_EN[type] || L(T) : fullName(T));

/** 「再拍下一层」那一块（客人说的层数比读到的多） */
function MoreFloor({ want, got, more, wish, canCamera, onAdd }) {
  const camIn = useRef(null);
  const fileIn = useRef(null);
  const st = more?.state || 'idle';
  const picked = (e, from) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onAdd?.(from, f);
  };
  return (
    <div className="pp-more" role="group" aria-label={t('再拍下一层')}>
      <p className="pp-more-say">
        <Layers size={17} strokeWidth={1.9} aria-hidden="true" />
        <span>{t('你说有 {0} 层，我只读到 {1} 层', [want, got])}</span>
      </p>
      {st === 'reading' ? (
        <div className="pp-more-bar" role="status">
          <span>{t('正在读下一层 · {0}%', [Math.round(more.pct || 0)])}</span>
          <span className="pp-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(6, Math.round(more.pct || 0))}%` }} />
          </span>
        </div>
      ) : st === 'staff' ? (
        <p className="pp-more-note">{t('好的，请员工帮你上传下一层，我在这里等。')}</p>
      ) : (
        <>
          {st === 'failed' && <p className="pp-more-note is-warn">{t('这一张我读不清 —— 再试一张，或者先这样。')}</p>}
          {st === 'bad' && <p className="pp-more-note is-warn">{t('这张图打不开，换一张试试？（JPG、PNG、PDF 都可以）')}</p>}
          <div className="pp-more-acts">
            {wish ? (
              <>
                {canCamera && (
                  <button type="button" className="btn btn-line" onClick={() => onAdd?.('camera')} data-sfx="open">
                    <CameraIcon size={17} strokeWidth={1.8} aria-hidden="true" />
                    <span>{t('拍下一层')}</span>
                  </button>
                )}
                <button type="button" className="btn btn-line" onClick={() => onAdd?.('staff')}>
                  <UserPlus size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t('请员工帮我上传')}</span>
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-line" onClick={() => camIn.current?.click()} data-sfx="open">
                  <CameraIcon size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t('拍下一层')}</span>
                </button>
                <button type="button" className="btn btn-line" onClick={() => fileIn.current?.click()} data-sfx="open">
                  <ImageUp size={17} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t('从相册或文件选')}</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
      {!wish && (
        <span className="pp-inputs" aria-hidden="true">
          <input ref={camIn} type="file" accept="image/*" capture="environment" tabIndex={-1} onChange={(e) => picked(e, 'photo')} />
          <input ref={fileIn} type="file" accept="image/*,application/pdf" tabIndex={-1} onChange={(e) => picked(e, 'file')} />
        </span>
      )}
    </div>
  );
}

export default function PlanConfirm({ result, plan, home, onRelabel, onRemove, onYes, onRetake, more, onAddFloor, wish = false, canCamera = false }) {
  const floors = plan?.floors || [];
  const [fi0, setFi] = useState(0);
  const [sel, setSel] = useState(null); // 选中的那一间：去掉 -2 的 id（L 形的几块一起）
  const fi = Math.min(fi0, Math.max(0, floors.length - 1));
  const f = floors[fi] || { rooms: [] };
  const b = useMemo(() => bounds(plan), [plan]);
  const facts = useMemo(() => planFacts(plan), [plan]);
  const groups = useMemo(() => roomGroups(f.rooms), [f]);
  const stairs = (f.rooms || []).filter((r) => r.stairId || ROOM_TYPES[r.type]?.stair);
  const pad = Math.max(b.w, b.d) * 0.04 + 0.2;
  const vb = `${(b.x0 - pad).toFixed(2)} ${(b.y0 - pad).toFixed(2)} ${(b.w + pad * 2).toFixed(2)} ${(b.d + pad * 2).toFixed(2)}`;
  const fs = Math.max(0.32, Math.min(0.6, Math.max(b.w, b.d) / 26));
  const room = groups.find((g) => g.base === sel) || null;
  const rough = result?.status === 'rough';
  const fromPhoto = result?.from === 'camera' || result?.from === 'photo';
  const said = Number(home?.bedrooms) || 0;
  const mismatch = said && facts.bedrooms !== said;
  // 层数：readPlan 说「你说有 2 层，我只读到 1 层」（code 'floors'）→ 还少几层就一直给「再拍下一层」
  const fl = (result?.issues || []).find((i) => i.code === 'floors');
  const want = Math.max(Number(fl?.want) || 0, Number(fl?.vars?.[0]) || 0);
  const short = want > floors.length && floors.length < 4;

  const tap = (g) => setSel(g.base === sel ? null : g.base);
  const order = groups.filter((g) => !ROOM_TYPES[g.type]?.stair).sort((a, z) => (a.base === sel) - (z.base === sel));

  return (
    <div className="step hj-card wide">
      <Head eyebrow={t('户型图 · 读好了')} title={t('这是你的家吗？')} lead={rough ? t('有几处我看不太清，帮我点一下房间的名字。') : t('点一下房间，就能改它的名字。')} />
      <div className="pp-confirm">
        <div className="pp-mini">
          {floors.length > 1 && (
            <div className="pp-tabs" role="tablist" data-sfx="radio">
              {floors.map((x, k) => (
                <button key={x.id || k} type="button" role="tab" aria-selected={k === fi} className={k === fi ? 'on' : ''} onClick={() => (setFi(k), setSel(null))}>
                  {t(FLOOR_NAMES[k] || '{0} 楼', [k + 1])}
                </button>
              ))}
            </div>
          )}
          <svg viewBox={vb} role="img" aria-label={t('读出来的户型图')}>
            {stairs.map((r) => (
              <rect key={r.id} className="pp-stair" x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_TYPES.stair.color} vectorEffect="non-scaling-stroke" />
            ))}
            {/* 选中的那一间最后画（SVG 没有 z-index：金色描边不会被隔壁房间盖住） */}
            {order.map((g) => {
              const T = ROOM_TYPES[g.type];
              const color = T?.color || ROOM_TYPES.corridor.color;
              const m = g.main;
              const lab = T && !T.stair ? fitLabel(fullName(T), shortName(g.type, T), m.w, m.d, fs) : null;
              return (
                <g
                  key={g.key}
                  className={`pp-room ${g.base === sel ? 'sel' : ''}`}
                  onClick={() => tap(g)}
                  role="button"
                  tabIndex={0}
                  aria-label={T ? L(T) : t('房间')}
                  aria-pressed={g.base === sel}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tap(g))}
                  data-sfx="select"
                  // SVG 里的房间不用 fx 的按压缩放（缩放的原点在平面的左上角，会把房间拉歪）；选中的样子由描边 + 亮一点表示
                  data-fx="none"
                >
                  {/* 同一间的几块：只有颜色（描一圈同色，接缝不露白），外框另外画一圈 */}
                  {g.parts.map((r) => (
                    <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill={color} stroke={color} vectorEffect="non-scaling-stroke" />
                  ))}
                  <path className="pp-edge" d={outlinePath(g.parts)} vectorEffect="non-scaling-stroke" />
                  {lab && (
                    <text x={m.x + m.w / 2} y={m.y + m.d / 2} textAnchor="middle" dominantBaseline="central" style={{ fontSize: `${lab.size.toFixed(3)}px` }}>
                      {lab.text}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="pp-facts">
          <div className="pp-read">
            <b>{t('{0} 房 {1} 卫 · 约 {2} sq ft', [facts.bedrooms, facts.bathrooms, fmtSqft(facts.areaSqft)])}</b>
            <span>
              {fromPhoto ? t('从你拍的照片读出来') : t('从你给的户型图读出来')}
              {floors.length > 1 ? ` · ${floorsText(floors.length)}` : ''}
            </span>
          </div>
          {short && <MoreFloor want={want} got={floors.length} more={more} wish={wish} canCamera={canCamera} onAdd={onAddFloor} />}
          {more?.state === 'done' && !short && floors.length > 1 && (
            <p className="pp-more-ok" role="status">
              <Check size={15} strokeWidth={2.4} aria-hidden="true" />
              <span>{t('{0}也读好了 —— 点上面的楼层看看', [t(FLOOR_NAMES[floors.length - 1] || '{0} 楼', [floors.length])])}</span>
            </p>
          )}
          {mismatch ? <p className="pp-mismatch">{t('你说有 {0} 房，我读到 {1} 房 —— 点一下房间改一改？', [said, facts.bedrooms])}</p> : null}
          <div className="pp-relabel">
            {room ? (
              <>
                <p>{t('你点的这一间是 ——')}</p>
                <div className="chips" data-sfx="radio">
                  {RELABEL.map((ty) => (
                    <button key={ty} type="button" className={`chip ${room.type === ty ? 'on' : ''}`} aria-pressed={room.type === ty} onClick={() => onRelabel(room.id, ty)}>
                      {L(ROOM_TYPES[ty])}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chip"
                    data-sfx="cross"
                    onClick={() => {
                      onRemove(room.id);
                      setSel(null);
                    }}
                  >
                    {t('不是房间')}
                  </button>
                </div>
              </>
            ) : (
              <p>{t('点一下平面上的房间，就能改名字。')}</p>
            )}
          </div>
        </div>
      </div>
      <div className="q-actions">
        <button type="button" className="btn btn-line" onClick={onRetake} data-sfx="back">
          <RotateCcw size={18} strokeWidth={1.9} aria-hidden="true" />
          <span>{t('重拍一张')}</span>
        </button>
        <button type="button" className="btn btn-primary" onClick={onYes} disabled={more?.state === 'reading'} data-sfx="confirm">
          <Check size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>{t('对，就是它')}</span>
        </button>
      </div>
    </div>
  );
}
