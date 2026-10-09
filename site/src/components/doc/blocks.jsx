// 文档原子渲染（A4 页面里的每一小块）。全部用内联样式 + 整数 px 行高：
// html2canvas 截图稳定，测量高度 = 实际高度。
import { C, TONE, tone, PHOTO, CONTENT_W, LOGO_SRC, LOGO_RATIO } from './theme.js';
import { clLayout, tblLayout, GRID_LABEL_W, LONG_VALUE } from './paginate.js';

// 列宽和分页切块共用（paginate.js 按同样的列宽估算长文字折行）
export { clLayout, tblLayout };

// ---------- 小工具 ----------
const zhOf = (l) => (l == null ? '' : typeof l === 'string' ? l : l.zh || '');
const enOf = (l) => (l == null || typeof l === 'string' ? '' : l.en || '');
const upper = (s) => String(s || '').toUpperCase();
const has = (s) => s != null && String(s).trim() !== '';
// 按估算宽度截断（中文 ≈ 1em，英文 ≈ 0.56em），单行文字不溢出
const WIDE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
export function fitText(s, px, size, spacing = 0) {
  const t = String(s || '');
  let w = 0;
  for (let i = 0; i < t.length; i += 1) {
    w += (WIDE.test(t[i]) ? size : size * 0.56) + spacing;
    if (w > px) return `${t.slice(0, Math.max(0, i - 1))}…`;
  }
  return t;
}
const fmtDur = (sec) => {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const pad2 = (n) => String(n).padStart(2, '0');
/** ISO 时间戳 → '2026-10-09 15:20'（本地时区） */
const fmtStamp = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const LINE = `1px solid ${C.line}`;
const WRAP = { overflowWrap: 'anywhere', wordBreak: 'break-word' };

/** ★ 着色 */
function Stars({ text, color }) {
  const parts = String(text || '').split('★');
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && <span style={{ color }}>★</span>}
      {p}
    </span>
  ));
}

/** 勾选框：on = 实心 + 白勾；faded = 已作答但未选中 */
export function Box({ on, toneKey = 'pass', size = 11, faded = false }) {
  const t = tone(toneKey);
  return (
    <span
      style={{
        display: 'inline-block',
        position: 'relative',
        flex: 'none',
        width: size,
        height: size,
        boxSizing: 'border-box',
        border: `1px solid ${on ? t.fg : faded ? C.line : C.mute}`,
        background: on ? t.fg : '#fff',
        borderRadius: 2,
      }}
    >
      {on && (
        <span
          style={{
            position: 'absolute',
            left: Math.round(size * 0.3),
            top: Math.round(size * 0.06),
            width: Math.max(3, Math.round(size * 0.28)),
            height: Math.round(size * 0.52),
            borderRight: '1.5px solid #fff',
            borderBottom: '1.5px solid #fff',
            transform: 'rotate(45deg)',
          }}
        />
      )}
    </span>
  );
}

function MediaTag({ accent }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 8,
        lineHeight: '12px',
        fontWeight: 600,
        color: accent,
        border: `1px solid ${accent}`,
        borderRadius: 2,
        padding: '0 3px',
        marginLeft: 5,
        verticalAlign: 'top',
        marginTop: 1,
        letterSpacing: 0.3,
      }}
    >
      影像 PHOTO
    </span>
  );
}

/** 中文主 + 英文副（两行） */
function Bi({ v, zh = 10, en = 8.5, zhLh = 14, enLh = 12, bold = true, color = C.ink, enColor = C.mute, italic = false }) {
  return (
    <>
      {has(zhOf(v)) && (
        <div style={{ fontSize: zh, lineHeight: `${zhLh}px`, fontWeight: bold ? 700 : 400, color }}>{zhOf(v)}</div>
      )}
      {has(enOf(v)) && (
        <div style={{ fontSize: en, lineHeight: `${enLh}px`, color: enColor, fontStyle: italic ? 'italic' : 'normal' }}>{enOf(v)}</div>
      )}
    </>
  );
}

/** 逐行圆点列表；contFirst = 第一行是上一块那条的后半截（不画圆点，缩进照旧） */
function Bullets({ lines, size = 11, lh = 17, color = C.ink, dot = C.terra, contFirst = false }) {
  return (
    <div>
      {lines.map((s, i) => (
        <div key={i} style={{ display: 'flex', fontSize: size, lineHeight: `${lh}px`, color }}>
          <span
            style={{
              flex: 'none',
              width: 4,
              height: 4,
              borderRadius: 2,
              background: contFirst && i === 0 ? 'transparent' : dot,
              marginTop: Math.round(lh / 2 - 2),
              marginRight: 8,
            }}
          />
          <span style={{ flex: 1, minWidth: 0, ...WRAP }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

/** 手写用空白线 */
function BlankLines({ n = 1, h = 20 }) {
  return (
    <div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ height: h, borderBottom: `1px dashed ${C.line}` }} />
      ))}
    </div>
  );
}

// ---------- 照片 / 视频格子 ----------

/** 按原图比例算 contain 尺寸（不依赖 object-fit，截图更稳） */
function containBox(inf, W, H) {
  if (!inf?.w || !inf?.h) return { width: W, height: H, left: 0, top: 0 };
  const k = Math.min(W / inf.w, H / inf.h);
  const width = Math.round(inf.w * k);
  const height = Math.round(inf.h * k);
  return { width, height, left: Math.floor((W - width) / 2), top: Math.floor((H - height) / 2) };
}

function PlayBadge({ duration, big }) {
  const d = big ? 44 : 34;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: d,
          height: d,
          marginLeft: -d / 2,
          marginTop: -d / 2,
          borderRadius: d / 2,
          background: 'rgba(31,30,28,0.62)',
          border: '2px solid rgba(255,255,255,0.9)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: Math.round(d * 0.38),
            top: Math.round(d * 0.27) - 2,
            width: 0,
            height: 0,
            borderTop: `${Math.round(d * 0.23)}px solid transparent`,
            borderBottom: `${Math.round(d * 0.23)}px solid transparent`,
            borderLeft: `${Math.round(d * 0.34)}px solid #fff`,
          }}
        />
      </div>
      {duration ? (
        <div
          style={{
            position: 'absolute',
            right: 5,
            bottom: 5,
            background: 'rgba(31,30,28,0.72)',
            color: '#fff',
            fontSize: 9,
            lineHeight: '14px',
            padding: '0 5px',
            borderRadius: 3,
            fontWeight: 600,
          }}
        >
          {fmtDur(duration)}
        </div>
      ) : null}
    </>
  );
}

const VIDEO_CAP = '视频请见群组 / video shared separately';

function capOf(ctx, ref) {
  const inf = ctx.info?.[ref.id];
  if ((inf?.kind || ref.kind) === 'video') return VIDEO_CAP;
  return inf?.caption || ref.caption || '';
}

export function Tile({ mref, w, h, ctx, cap, tag, showTag }) {
  const inf = ctx.info?.[mref.id] || {};
  const url = ctx.measure ? null : ctx.urls?.[mref.id];
  const isVideo = (inf.kind || mref.kind) === 'video';
  const box = containBox(inf, w - 2, h - 2);
  return (
    <div style={{ width: w, flex: 'none' }}>
      {showTag && (
        <div style={{ height: 14, fontSize: 8.5, lineHeight: '13px', color: C.body, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {tag ? fitText(`${zhOf(tag)} ${enOf(tag)}`.trim(), w, 8.5) : ''}
        </div>
      )}
      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          boxSizing: 'border-box',
          background: C.creamDeep,
          border: LINE,
          overflow: 'hidden',
        }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            style={{ position: 'absolute', display: 'block', objectFit: 'contain', ...box }}
          />
        ) : ctx.measure ? null : (
          <div style={{ position: 'absolute', left: 0, right: 0, top: h / 2 - 8, textAlign: 'center', fontSize: 9, lineHeight: '14px', color: C.faint }}>
            {isVideo ? '视频 Video' : '照片缺失 Missing'}
          </div>
        )}
        {isVideo && <PlayBadge duration={inf.duration} big={w > 200} />}
      </div>
      {cap !== undefined && (
        <div style={{ height: 15, paddingTop: 2, fontSize: 8.5, lineHeight: '13px', color: isVideo ? C.mute : C.body, whiteSpace: 'nowrap', overflow: 'hidden', fontStyle: isVideo ? 'italic' : 'normal' }}>
          {fitText(cap, w, 8.5)}
        </div>
      )}
    </div>
  );
}

/** 一行照片：frame = 'table'（检查表行下）/ 'grid'（信息栏里）/ 'none'（文案类，无框） */
function PhotoLine({ atom, ctx, pos }) {
  const P = PHOTO[atom.size] || PHOTO.sm;
  const anyCap = atom.photos.some((p) => has(capOf(ctx, p)));
  const tiles = atom.photos.map((p, i) => (
    <Tile
      key={`${i}:${p.id}`}
      mref={p}
      w={P.w}
      h={P.h}
      ctx={ctx}
      cap={anyCap ? capOf(ctx, p) : undefined}
      showTag={!!atom.tagged}
      tag={p.tag}
    />
  ));
  if (atom.frame === 'none') {
    return <div style={{ display: 'flex', gap: P.gap }}>{tiles}</div>;
  }
  const closing = atom.lineEnd || pos.last;
  const indent = atom.indent || 0;
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        gap: P.gap,
        boxSizing: 'border-box',
        borderLeft: LINE,
        borderRight: LINE,
        borderTop: atom.frame === 'grid' ? `1px solid ${pos.first ? C.line : 'transparent'}` : 'none',
        borderBottom: `1px solid ${closing ? C.line : 'transparent'}`,
        background: C.paper,
        padding: `6px 8px ${atom.lineEnd ? 9 : 3}px ${indent + 8}px`,
      }}
    >
      {atom.label && indent >= 28 && (
        <div style={{ position: 'absolute', left: 0, top: 8, width: indent, textAlign: 'center', fontSize: 8.5, lineHeight: '12px', color: C.mute }}>
          照片
          <br />
          <span style={{ fontSize: 7.5, letterSpacing: 0.3 }}>PHOTOS</span>
        </div>
      )}
      {tiles}
    </div>
  );
}

// ---------- 抬头 ----------

function Logo({ brand, height = 57 }) {
  if (brand === 'plain') {
    return <div style={{ fontSize: 16, fontWeight: 700, lineHeight: '22px', color: C.ink }}>溪岸 Sail</div>;
  }
  const w = Math.round(height * LOGO_RATIO);
  return <img src={LOGO_SRC} alt="Sail 溪岸" style={{ display: 'block', width: w, height }} />;
}

function Badge({ meta, accent }) {
  const b = meta.badge;
  const out = [];
  if (meta.brand === 'vsmooth') {
    out.push(
      <div key="vs" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ background: C.pine, color: '#fff', fontSize: 10.5, fontWeight: 700, letterSpacing: 3.2, lineHeight: '20px', padding: '0 7px 0 10px' }}>
          V-SMOOTH
        </div>
      </div>,
      <div key="vs2" style={{ fontSize: 8.5, color: C.mute, lineHeight: '13px', marginTop: 4, letterSpacing: 1 }}>
        交付体系 · DELIVERY SYSTEM
      </div>,
    );
  }
  if (b) {
    // 两种写法：{ zh:'INTERNAL · 内部文件', en:'not for client' } 或 { zh:'内部文件', en:'INTERNAL', sub:{zh,en} }
    const main = b.sub ? [b.en, b.zh].filter(Boolean).join(' · ') : b.zh || b.en;
    const small = b.sub ? [zhOf(b.sub), enOf(b.sub)].filter(Boolean).join(' ') : b.zh ? b.en : '';
    out.push(
      <div key="b" style={{ marginTop: out.length ? 8 : 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 2.2, color: accent, lineHeight: '15px' }}>{upper(main)}</div>
        {has(small) && <div style={{ fontSize: 9, fontStyle: 'italic', color: C.mute, lineHeight: '13px', marginTop: 2 }}>{small}</div>}
      </div>,
    );
  }
  const stamp = fmtStamp(meta.generatedAt);
  if (stamp) {
    out.push(
      <div key="g" style={{ fontSize: 8.5, color: C.faint, lineHeight: '12px', marginTop: out.length ? 8 : 0, letterSpacing: 0.3 }}>
        生成 Generated · {stamp}
      </div>,
    );
  }
  return <div style={{ textAlign: 'right', paddingTop: 4 }}>{out}</div>;
}

function Header({ ctx }) {
  const { meta, accent } = ctx;
  const t = meta.title || {};
  const sub = meta.subtitle;
  return (
    <div style={{ paddingBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 57 }}>
        <Logo brand={meta.brand} />
        <Badge meta={meta} accent={accent} />
      </div>
      <div style={{ paddingTop: 16 }}>
        {has(meta.kicker) && (
          <div style={{ fontSize: 9.5, lineHeight: '14px', letterSpacing: 1.6, color: C.mute, paddingBottom: 6, fontWeight: 600 }}>{upper(meta.kicker)}</div>
        )}
        <div style={{ fontSize: 28, lineHeight: '36px', fontWeight: 800, color: C.ink, letterSpacing: 2 }}>{zhOf(t) || enOf(t)}</div>
        {has(enOf(t)) && has(zhOf(t)) && (
          <div style={{ fontSize: 12, lineHeight: '18px', fontWeight: 700, color: accent, letterSpacing: 2.6, paddingTop: 2 }}>{upper(enOf(t))}</div>
        )}
        {sub && (has(zhOf(sub)) || has(enOf(sub))) && (
          <div style={{ fontSize: 11, lineHeight: '17px', color: accent, paddingTop: 6 }}>
            {zhOf(sub)}
            {has(enOf(sub)) && (
              <span style={{ fontStyle: 'italic', color: C.mute, marginLeft: has(zhOf(sub)) ? 8 : 0 }}>{enOf(sub)}</span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 12 }}>
          <div style={{ width: 48, height: 3, background: accent }} />
          <div style={{ flex: 1, height: 1, background: C.line }} />
        </div>
      </div>
    </div>
  );
}

function Intro({ atom }) {
  const p = atom.p || {};
  return (
    <div>
      {has(zhOf(p)) && <div style={{ fontSize: 11, lineHeight: '18px', color: C.ink }}>{zhOf(p)}</div>}
      {has(enOf(p)) && <div style={{ fontSize: 9.5, lineHeight: '14px', color: C.mute, paddingTop: 2 }}>{enOf(p)}</div>}
    </div>
  );
}

function Legend({ atom, ctx }) {
  return (
    <div style={{ background: C.cream, borderRadius: 3, padding: '6px 10px', fontSize: 10, lineHeight: '15px', color: C.body, whiteSpace: 'pre-wrap' }}>
      <Stars text={atom.text} color={ctx.accent} />
    </div>
  );
}

/** 续页抬头（每页 2+ 顶部，固定高度） */
export function ContHeader({ ctx, height = 30 }) {
  const { meta, accent } = ctx;
  const t = meta.title || {};
  // 粗估宽度：logo 57 + 分隔 21 + 中文标题 + 项目名，剩下给英文标题
  const proj = fitText(ctx.project || '', 260, 9);
  const projW = Math.min(260, proj.length * 7);
  const enW = CONTENT_W - 57 - 21 - zhOf(t).length * 11.5 - 8 - projW - 20;
  return (
    <div style={{ height, boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderBottom: LINE, paddingBottom: 6 }}>
      {meta.brand === 'plain' ? (
        <div style={{ fontSize: 11, fontWeight: 700 }}>溪岸 Sail</div>
      ) : (
        <img src={LOGO_SRC} alt="" style={{ display: 'block', width: Math.round(22 * LOGO_RATIO), height: 22 }} />
      )}
      <div style={{ width: 1, height: 16, background: C.line, margin: '0 10px' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, lineHeight: '16px', whiteSpace: 'nowrap' }}>{zhOf(t)}</div>
      {has(enOf(t)) && enW > 60 && (
        <div style={{ fontSize: 8.5, fontWeight: 700, color: accent, letterSpacing: 1.4, lineHeight: '16px', marginLeft: 8, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {fitText(upper(enOf(t)), enW, 8.5 * 1.15, 1.4)}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {has(proj) && (
        <div style={{ fontSize: 9, color: C.mute, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 300, textAlign: 'right', marginLeft: 12 }}>
          {proj}
        </div>
      )}
    </div>
  );
}

/** 页脚 */
export function Footer({ ctx, page, total }) {
  const left = [ctx.meta.company, ctx.meta.reportTitle].filter(Boolean).join('  ·  ');
  return (
    <div style={{ height: 18, boxSizing: 'border-box', borderTop: LINE, paddingTop: 5, display: 'flex', fontSize: 8.5, lineHeight: '12px', color: C.mute }}>
      <div style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>{fitText(left, CONTENT_W - 190, 8.5)}</div>
      <div style={{ flex: 'none', marginLeft: 16, color: C.body }}>
        第 {page} / {total} 页<span style={{ color: C.faint, marginLeft: 6 }}>Page {page} of {total}</span>
      </div>
    </div>
  );
}

// ---------- 节标题 ----------

function SecHead({ atom, ctx }) {
  const b = atom.block;
  const { accent } = ctx;
  const t = b.title || {};
  const zh = zhOf(t);
  const en = enOf(t);
  let counts = '';
  if (b.type === 'checklist' && b.counts) {
    counts = `共 ${b.counts.total} 项${b.counts.key ? ` · 其中关键项 ${b.counts.key} 项` : ''}`;
  }
  const note = b.note;
  return (
    <div style={{ paddingBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: C.creamDeep,
          borderLeft: `4px solid ${accent}`,
          padding: '6px 12px 6px 10px',
        }}
      >
        {has(b.no) && <span style={{ fontSize: 13, fontWeight: 800, color: accent, marginRight: 10, lineHeight: '20px' }}>{b.no}</span>}
        {has(en) && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, color: accent, lineHeight: '20px' }}>{upper(en)}</span>}
        {has(en) && has(zh) && <span style={{ color: C.faint, margin: '0 7px', lineHeight: '20px', fontSize: 11 }}>·</span>}
        {has(zh) && <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: '20px' }}>{zh}</span>}
        <span style={{ flex: 1 }} />
        {counts && <span style={{ fontSize: 9.5, color: C.mute, lineHeight: '20px', whiteSpace: 'nowrap', marginLeft: 12 }}>{counts}</span>}
      </div>
      {note && (has(zhOf(note)) || has(enOf(note))) && (
        <div style={{ fontSize: 10, lineHeight: '15px', color: C.body, padding: '5px 2px 0' }}>
          {zhOf(note)}
          {has(enOf(note)) && <span style={{ fontStyle: 'italic', color: C.mute, marginLeft: 6, fontSize: 9.5 }}>{enOf(note)}</span>}
        </div>
      )}
    </div>
  );
}

// ---------- 检查表 ----------

const cellBase = (w, extra = {}) => ({
  width: w,
  flex: 'none',
  boxSizing: 'border-box',
  borderRight: LINE,
  padding: '6px 7px',
  ...extra,
});

function HeadCell({ w, v, first, center, extra }) {
  return (
    <div
      style={cellBase(w, {
        borderTop: LINE,
        borderBottom: LINE,
        borderLeft: first ? LINE : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: center ? 'center' : 'flex-start',
        textAlign: center ? 'center' : 'left',
        padding: '5px 6px',
        ...extra,
      })}
    >
      <div style={{ fontSize: 9.5, lineHeight: '13px', fontWeight: 700, color: C.ink }}>{zhOf(v)}</div>
      {has(enOf(v)) && <div style={{ fontSize: 8, lineHeight: '11px', color: C.mute, letterSpacing: 0.2 }}>{enOf(v)}</div>}
    </div>
  );
}

function ClHead({ block: b }) {
  const Lc = clLayout(b);
  const itemLabel = !b.showStandard && b.rows.some((r) => r.desc)
    ? { zh: '检查项与标准', en: 'Check Item & Standard' }
    : { zh: '检查项目', en: 'Check Item' };
  return (
    <div style={{ display: 'flex', background: C.cream }}>
      <HeadCell w={Lc.NO} v={{ zh: '#', en: 'No.' }} first center />
      <HeadCell w={Lc.item} v={itemLabel} />
      {Lc.std > 0 && <HeadCell w={Lc.std} v={{ zh: '标准要求', en: 'Standard' }} />}
      {Lc.meth > 0 && <HeadCell w={Lc.meth} v={{ zh: '检查方法', en: 'Method' }} />}
      {b.resultLayout === 'columns' ? (
        b.options.map((o) => <HeadCell key={o.v} w={Lc.optW} v={o} center />)
      ) : (
        <HeadCell w={Lc.res} v={{ zh: '判定', en: 'Result' }} />
      )}
      <HeadCell w={Lc.rem} v={b.remarkLabel} />
    </div>
  );
}

function InlineOpts({ row }) {
  const answered = !!row.result;
  return (
    <div>
      {row.options.map((o) => {
        const on = row.result?.v === o.v;
        const t = tone(o.tone);
        return (
          <div
            key={o.v}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 17,
              fontSize: 10,
              color: on ? t.fg : answered ? C.faint : C.body,
              fontWeight: on ? 700 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            <Box on={on} toneKey={o.tone} faded={answered && !on} />
            <span style={{ marginLeft: 5 }}>{o.zh}</span>
            {has(o.en) && <span style={{ marginLeft: 4, fontSize: 8.5, fontWeight: on ? 700 : 400 }}>{o.en}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ItemText({ row, b, accent }) {
  return (
    <div>
      <div style={{ fontSize: 11, lineHeight: '16px', fontWeight: 700, color: C.ink, ...WRAP }}>
        {row.key && <span style={{ color: accent, marginRight: 3 }}>★</span>}
        {zhOf(row.title)}
        {row.media && <MediaTag accent={accent} />}
      </div>
      {has(enOf(row.title)) && <div style={{ fontSize: 9, lineHeight: '13px', color: C.mute }}>{enOf(row.title)}</div>}
      {!b.showStandard && row.desc && (has(zhOf(row.desc)) || has(enOf(row.desc))) && (
        <div style={{ paddingTop: 3 }}>
          {has(zhOf(row.desc)) && <div style={{ fontSize: 10, lineHeight: '15px', color: C.body, ...WRAP }}>{zhOf(row.desc)}</div>}
          {has(enOf(row.desc)) && <div style={{ fontSize: 8.5, lineHeight: '12px', color: C.mute, fontStyle: 'italic', ...WRAP }}>{enOf(row.desc)}</div>}
        </div>
      )}
    </div>
  );
}

function SmallBi({ v }) {
  if (!v) return null;
  return (
    <>
      {has(zhOf(v)) && <div style={{ fontSize: 10, lineHeight: '15px', color: C.body, ...WRAP }}>{zhOf(v)}</div>}
      {has(enOf(v)) && <div style={{ fontSize: 8.5, lineHeight: '12px', color: C.mute, ...WRAP }}>{enOf(v)}</div>}
    </>
  );
}

function InputValue({ row }) {
  if (row.lines && row.lines.length) return <Bullets lines={row.lines} size={10.5} lh={16} contFirst={row.contLine} />;
  if (has(row.value)) {
    return <div style={{ fontSize: 10.5, lineHeight: '16px', color: C.ink, whiteSpace: 'pre-wrap', ...WRAP }}>{row.value}</div>;
  }
  return <BlankLines n={2} h={18} />;
}

const sameOpts = (a, b) => a.length === b.length && a.every((o, i) => o.v === b[i]?.v);

// 长备注 / 长填写内容切出来的续行（atom.cont）：只写那一列，其余格留空；
// 续行之间不画横线、上下内边距收小，看起来是同一格。页末那段照常收边（边框始终 1px，测量高度与位置无关）
const contPad = (atom) => [atom.cont ? 2 : 6, atom.contNext ? 2 : 6];
const contBottom = (atom, pos) => `1px solid ${atom.contNext && !pos.last ? 'transparent' : atom.hasPhotos ? C.lineSoft : C.line}`;

function ClRow({ atom, ctx, pos }) {
  const b = atom.block;
  const r = atom.row;
  const Lc = clLayout(b);
  const failed = r.result?.tone === 'fail';
  const cont = !!atom.cont;
  const [pt, pb] = contPad(atom);
  const bb = contBottom(atom, pos);
  const cell = (w, extra) => cellBase(w, { borderBottom: bb, padding: `${pt}px 7px ${pb}px`, ...extra });
  const columnsOk = b.resultLayout === 'columns' && sameOpts(r.options, b.options);
  return (
    <div style={{ display: 'flex', background: failed ? TONE.fail.bg : '#fff' }}>
      <div
        style={cell(Lc.NO, {
          borderLeft: LINE,
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: failed ? C.fail : C.mute,
          lineHeight: '16px',
          padding: `${pt}px 2px ${pb}px`,
        })}
      >
        {!cont && r.no}
      </div>
      <div style={cell(Lc.item)}>
        {!cont && <ItemText row={r} b={b} accent={ctx.accent} />}
      </div>
      {Lc.std > 0 && (
        <div style={cell(Lc.std)}>
          {!cont && <SmallBi v={r.desc} />}
        </div>
      )}
      {Lc.meth > 0 && (
        <div style={cell(Lc.meth)}>
          {!cont && <SmallBi v={r.method} />}
        </div>
      )}
      {r.input ? (
        <div style={cell(Lc.res + Lc.rem)}>
          <InputValue row={r} />
        </div>
      ) : (
        <>
          {columnsOk ? (
            r.options.map((o) => {
              const on = r.result?.v === o.v;
              return (
                <div key={o.v} style={cell(Lc.optW, { display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: `${cont ? pt : 9}px 7px ${pb}px` })}>
                  {!cont && <Box on={on} toneKey={o.tone} size={12} faded={!!r.result && !on} />}
                </div>
              );
            })
          ) : (
            <div style={cell(Lc.res)}>
              {!cont && <InlineOpts row={r} />}
            </div>
          )}
          <div style={cell(Lc.rem)}>
            {has(r.remark) && (
              <div style={{ fontSize: 10, lineHeight: '15px', color: failed ? C.fail : C.ink, whiteSpace: 'pre-wrap', ...WRAP }}>{r.remark}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 打勾清单（单选项量表，如交付清单「完成」） */
function Tick({ atom, ctx, pos }) {
  const r = atom.row;
  const on = !!r.result;
  const cont = !!atom.cont; // 续行：不画勾选框 / 标题，接着写填写内容或备注
  const [pt, pb] = contPad(atom);
  const top = atom.firstInBlock || pos.first ? C.line : 'transparent';
  return (
    <div
      style={{
        display: 'flex',
        boxSizing: 'border-box',
        borderLeft: LINE,
        borderRight: LINE,
        borderTop: `1px solid ${top}`,
        borderBottom: contBottom(atom, pos),
        background: '#fff',
      }}
    >
      <div style={{ width: 30, flex: 'none', display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        {!cont && <Box on={on} toneKey={r.result?.tone || 'pass'} size={12} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: `${pt}px 10px ${pb}px 0` }}>
        {!cont && (
          <div style={{ fontSize: 11, lineHeight: '17px', color: C.ink, ...WRAP }}>
            {r.key && <span style={{ color: ctx.accent, marginRight: 3 }}>★</span>}
            <span style={{ fontWeight: 600 }}>{zhOf(r.title)}</span>
            {has(enOf(r.title)) && <span style={{ color: C.mute, fontSize: 9.5, marginLeft: 8 }}>{enOf(r.title)}</span>}
            {r.media && <MediaTag accent={ctx.accent} />}
          </div>
        )}
        {!cont && r.desc && (has(zhOf(r.desc)) || has(enOf(r.desc))) && (
          <div style={{ fontSize: 9.5, lineHeight: '14px', color: C.body, ...WRAP }}>
            {zhOf(r.desc)}
            {has(enOf(r.desc)) && <span style={{ color: C.mute, fontStyle: 'italic', marginLeft: 6 }}>{enOf(r.desc)}</span>}
          </div>
        )}
        {r.input && (
          <div style={{ paddingTop: cont ? 0 : 2 }}>
            <InputValue row={r} />
          </div>
        )}
        {has(r.remark) && (
          <div style={{ fontSize: 10, lineHeight: '15px', color: C.body, paddingTop: cont && !r.input ? 0 : 2, whiteSpace: 'pre-wrap', ...WRAP }}>
            {!atom.remarkCont && <span style={{ color: C.mute }}>备注 Remark：</span>}
            {r.remark}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 表格 ----------

function TblHead({ block: b }) {
  const T = tblLayout(b);
  return (
    <div style={{ display: 'flex', background: C.cream }}>
      <HeadCell w={T.NO} v={{ zh: '#', en: 'No.' }} first center extra={{ padding: '5px 2px' }} />
      {b.columns.map((c, i) => (
        <HeadCell key={c.key} w={T.ws[i]} v={c.label} />
      ))}
    </div>
  );
}

function TblRow({ atom, pos }) {
  const b = atom.block;
  const T = tblLayout(b);
  const [pt, pb] = contPad(atom); // 续行（单元格太长切出来的）：序号留空，同一列接着写
  const bb = contBottom(atom, pos);
  return (
    <div style={{ display: 'flex', background: '#fff' }}>
      <div style={cellBase(T.NO, { borderLeft: LINE, borderBottom: bb, textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.mute, lineHeight: '15px', padding: `${pt}px 2px ${pb}px` })}>
        {!atom.cont && atom.ri + 1}
      </div>
      {b.columns.map((c, i) => (
        <div key={c.key} style={cellBase(T.ws[i], { borderBottom: bb, fontSize: 10, lineHeight: '15px', color: C.ink, whiteSpace: 'pre-wrap', padding: `${pt}px 6px ${pb}px`, ...WRAP })}>
          {atom.row.cells[c.key] || ''}
        </div>
      ))}
    </div>
  );
}

function TblEmpty({ block: b }) {
  return (
    <div style={{ borderLeft: LINE, borderRight: LINE, borderBottom: LINE, padding: '9px 10px', textAlign: 'center', fontSize: 10.5, lineHeight: '15px', color: C.mute }}>
      {zhOf(b.emptyText)}
      {has(enOf(b.emptyText)) && <span style={{ color: C.faint, marginLeft: 6 }}>{enOf(b.emptyText)}</span>}
    </div>
  );
}

/** 续页：小字「续」+ 重复表头 */
function ContHead({ block: b, ctx }) {
  const t = b.title || {};
  return (
    <div>
      <div style={{ fontSize: 9, lineHeight: '13px', color: C.mute, paddingBottom: 4 }}>
        {has(b.no) && <span style={{ color: ctx.accent, fontWeight: 700, marginRight: 6 }}>{b.no}</span>}
        {zhOf(t)}
        {has(enOf(t)) && <span style={{ marginLeft: 6, letterSpacing: 0.8 }}>{upper(enOf(t))}</span>}
        <span style={{ marginLeft: 6, color: C.faint }}>（续 cont.）</span>
      </div>
      {b.type === 'table' ? <TblHead block={b} /> : <ClHead block={b} />}
    </div>
  );
}

// ---------- 信息栏 ----------

function FieldValue({ f, ctx, size = 11, lh = 17, list }) {
  if (f.kind === 'video') {
    if (!f.video) return list ? <BlankLines /> : null;
    const P = list ? PHOTO.lg : PHOTO.sm;
    return <Tile mref={f.video} w={P.w} h={P.h} ctx={ctx} cap={VIDEO_CAP} />;
  }
  if (f.kind === 'list') {
    if (!f.lines || !f.lines.length) return list ? <BlankLines n={2} /> : null;
    return <Bullets lines={f.lines} size={size} lh={lh} dot={ctx.accent} contFirst={f.contLine} />;
  }
  if (f.kind === 'photos') {
    return list ? <div style={{ fontSize: 10, lineHeight: '16px', color: C.faint }}>未附照片 No photos</div> : null;
  }
  if (!has(f.value)) return list ? <BlankLines /> : null;
  return (
    <div style={{ fontSize: size, lineHeight: `${lh}px`, color: C.ink, whiteSpace: f.kind === 'block' ? 'pre-wrap' : 'normal', ...WRAP }}>
      {f.value}
    </div>
  );
}

function GridRow({ atom, ctx, pos }) {
  const cols = atom.cols;
  const pair = CONTENT_W / cols;
  const LW = GRID_LABEL_W[cols] || 80;
  const top = `1px solid ${atom.firstInBlock || pos.first ? C.line : 'transparent'}`;
  const bottom = `1px solid ${atom.contNext && !pos.last ? 'transparent' : atom.mediaHead ? C.lineSoft : C.line}`;
  return (
    <div style={{ display: 'flex' }}>
      {atom.cells.map((c, k) => {
        const f = c.field;
        const vw = Math.round(c.span * pair) - LW;
        const n = (f.photos || []).length;
        return [
          <div
            key={`l${k}`}
            style={cellBase(LW, {
              background: C.cream,
              borderTop: top,
              borderBottom: bottom,
              borderLeft: k === 0 ? LINE : 'none',
              padding: `${c.cont ? 2 : 6}px 8px ${atom.contNext ? 2 : 6}px`,
            })}
          >
            {!c.cont && <Bi v={f.label} zh={10} en={8} zhLh={14} enLh={11} />}
          </div>,
          <div key={`v${k}`} style={cellBase(vw, { borderTop: top, borderBottom: bottom, padding: `${c.cont ? 2 : 6}px 9px ${atom.contNext ? 2 : 6}px`, minHeight: 28 })}>
            {atom.mediaHead ? (
              <div style={{ fontSize: 9.5, lineHeight: '14px', color: C.mute }}>
                共 {n} 张 · {n} photo{n > 1 ? 's' : ''}
              </div>
            ) : (
              <FieldValue f={f} ctx={ctx} size={11} lh={16} />
            )}
          </div>,
        ];
      })}
    </div>
  );
}

function ListRow({ atom, ctx }) {
  const cells = atom.cells;
  return (
    <div
      style={{
        display: 'flex',
        gap: 28,
        padding: `${atom.cont ? 0 : 7}px 0 ${atom.contNext ? 0 : 8}px`,
        borderBottom: atom.mediaHead ? 'none' : `1px solid ${atom.contNext ? 'transparent' : C.lineSoft}`,
        alignItems: 'flex-start',
      }}
    >
      {cells.map((f, k) => (
        <div key={f.key || k} style={{ flex: 1, minWidth: 0 }}>
          {!atom.cont && (
            <div style={{ display: 'flex', alignItems: 'baseline', paddingBottom: 2 }}>
              <span style={{ fontSize: 10.5, lineHeight: '15px', fontWeight: 700, color: C.ink }}>{zhOf(f.label)}</span>
              {has(enOf(f.label)) && (
                <span style={{ fontSize: 8, lineHeight: '15px', color: C.faint, letterSpacing: 1.2, marginLeft: 8, fontWeight: 600 }}>{upper(enOf(f.label))}</span>
              )}
              {atom.mediaHead && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: C.mute, lineHeight: '15px' }}>
                  共 {(f.photos || []).length} 张 · {(f.photos || []).length} photos
                </span>
              )}
            </div>
          )}
          {!atom.mediaHead && <FieldValue f={f} ctx={ctx} size={12} lh={18} list />}
        </div>
      ))}
    </div>
  );
}

// ---------- 统计 / 备注 / 签名 ----------

// 统计值超过 LONG_VALUE 字不放小卡片，改成整行
function Summary({ block: b, atom = {} }) {
  const all = b.items || [];
  // 拆开排版时（paginate.js summaryAtoms）：part = 'cards' 卡片 | 'long' 一条长值的一块 | 'conclusion' 结论
  const part = atom.part;
  const items = !part || part === 'cards' ? all.filter((it) => String(it.value ?? '').length <= LONG_VALUE) : [];
  const longs = !part ? all.filter((it) => String(it.value ?? '').length > LONG_VALUE) : part === 'long' ? [atom.item] : [];
  const n = items.length;
  const per = n <= 5 ? Math.max(1, n) : n <= 8 ? Math.ceil(n / 2) : 5;
  const gap = 8;
  const w = Math.floor((CONTENT_W - gap * (per - 1)) / per);
  const c = !part || part === 'conclusion' ? b.conclusion : null;
  // 长值的续块：不写标签、上下内边距收小，和上一块连成一条
  const [pt, pb] = contPad(atom);
  const ct = c ? tone(c.tone) : null;
  return (
    <div>
      {n > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
          {items.map((it, i) => {
            const t = tone(it.tone);
            const v = String(it.value ?? '');
            const big = v.length <= 10;
            return (
              <div key={i} style={{ width: w, boxSizing: 'border-box', background: t.bg, borderTop: `3px solid ${t.bar || t.fg}`, padding: '6px 9px 8px' }}>
                <div style={{ fontSize: 9.5, lineHeight: '13px', fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden' }}>{fitText(zhOf(it.label), w - 18, 9.5)}</div>
                <div style={{ fontSize: 7.5, lineHeight: '11px', color: C.mute, letterSpacing: 0.6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {fitText(upper(enOf(it.label)), w - 18, 7.5 * 1.15, 0.6) || '\u00a0'}
                </div>
                <div style={{ fontSize: big ? 15 : 12, lineHeight: big ? '20px' : '16px', fontWeight: 800, color: t.fg, paddingTop: big ? 3 : 4, ...WRAP }}>{v}</div>
              </div>
            );
          })}
        </div>
      )}
      {longs.map((it, i) => {
        const t = tone(it.tone);
        return (
          <div key={`l${i}`} style={{ display: 'flex', marginTop: n || i ? gap : 0, background: t.bg, borderLeft: `3px solid ${t.bar || t.fg}` }}>
            <div style={{ width: 150, flex: 'none', boxSizing: 'border-box', padding: `${pt + 1}px 10px ${pb + 1}px` }}>
              {!atom.cont && <div style={{ fontSize: 9.5, lineHeight: '13px', fontWeight: 700, color: C.ink }}>{zhOf(it.label)}</div>}
              {!atom.cont && has(enOf(it.label)) && <div style={{ fontSize: 7.5, lineHeight: '11px', color: C.mute, letterSpacing: 0.6 }}>{upper(enOf(it.label))}</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0, padding: `${pt + 1}px 12px ${pb + 1}px 0`, fontSize: 10.5, lineHeight: '16px', fontWeight: 600, color: t.fg, ...WRAP }}>
              {String(it.value ?? '')}
            </div>
          </div>
        );
      })}
      {c && (
        <div
          style={{
            marginTop: n || longs.length ? 10 : 0,
            border: `1.5px solid ${ct.fg}`,
            background: ct.bg,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ flex: 'none' }}>
            <div style={{ fontSize: 10.5, lineHeight: '15px', fontWeight: 700, color: C.ink }}>{zhOf(c.label) || '结论'}</div>
            <div style={{ fontSize: 8, lineHeight: '11px', color: C.mute, letterSpacing: 1 }}>{upper(enOf(c.label) || 'Conclusion')}</div>
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: ct.bd }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, lineHeight: '26px', fontWeight: 800, color: ct.fg, ...WRAP }}>{c.value}</div>
            {has(c.note) && <div style={{ fontSize: 10, lineHeight: '15px', color: C.body, paddingTop: 2, ...WRAP }}>{c.note}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Note({ block: b, ctx }) {
  const warn = b.tone === 'warn';
  const lines = b.lines || [];
  const color = warn ? C.terraDark : C.body;
  const boxed = warn;
  return (
    <div
      style={
        boxed
          ? { background: '#FBF4EF', borderLeft: `3px solid ${ctx.accent}`, padding: '7px 12px 8px' }
          : { padding: '0 2px' }
      }
    >
      {b.title && (has(zhOf(b.title)) || has(enOf(b.title))) && (
        <div style={{ fontSize: 10.5, lineHeight: '16px', fontWeight: 700, color: C.ink, paddingBottom: 3 }}>
          {zhOf(b.title)}
          {has(enOf(b.title)) && <span style={{ fontSize: 8.5, color: ctx.accent, letterSpacing: 1.2, marginLeft: 8 }}>{upper(enOf(b.title))}</span>}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} style={{ paddingTop: i ? 3 : 0 }}>
          {has(zhOf(l)) && (
            <div style={{ fontSize: warn ? 10.5 : 9.5, lineHeight: warn ? '16px' : '14px', color, whiteSpace: 'pre-wrap', ...WRAP }}>
              <Stars text={zhOf(l)} color={ctx.accent} />
            </div>
          )}
          {has(enOf(l)) && (
            <div style={{ fontSize: 8.5, lineHeight: '12px', color: warn ? C.terra : C.mute, fontStyle: 'italic', ...WRAP }}>{enOf(l)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function SigImage({ mref, ctx, w, h }) {
  if (!mref || ctx.measure) return null;
  const url = ctx.urls?.[mref.id];
  if (!url) return null;
  const inf = ctx.info?.[mref.id] || {};
  let width = w;
  let height = h;
  if (inf.w && inf.h) {
    const k = Math.min(w / inf.w, h / inf.h);
    width = Math.round(inf.w * k);
    height = Math.round(inf.h * k);
  }
  return <img src={url} alt="" style={{ display: 'block', width, height, objectFit: 'contain' }} />;
}

function Signatures({ block: b, ctx }) {
  const roles = b.roles || [];
  const n = Math.max(1, roles.length);
  const gap = 22;
  const w = Math.floor((CONTENT_W - gap * (n - 1)) / n);
  const d = b.declaration;
  return (
    <div>
      {d && (has(zhOf(d)) || has(enOf(d))) && (
        <div style={{ background: C.cream, padding: '9px 14px 10px', marginBottom: 16, borderLeft: `3px solid ${C.line}` }}>
          {has(zhOf(d)) && <div style={{ fontSize: 10.5, lineHeight: '17px', color: C.ink, ...WRAP }}>{zhOf(d)}</div>}
          {has(enOf(d)) && <div style={{ fontSize: 8.5, lineHeight: '13px', color: C.mute, fontStyle: 'italic', paddingTop: 3, ...WRAP }}>{enOf(d)}</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap }}>
        {roles.map((r) => (
          <div key={r.id} style={{ width: w, flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, lineHeight: '15px', fontWeight: 700, color: C.ink, marginRight: 6 }}>{zhOf(r.label)}</span>
              {has(enOf(r.label)) && (
                <span style={{ fontSize: 8, lineHeight: '15px', color: C.mute, letterSpacing: 1.2 }}>{upper(enOf(r.label))}</span>
              )}
            </div>
            <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', paddingBottom: 3, boxSizing: 'border-box' }}>
              <SigImage mref={r.image} ctx={ctx} w={Math.min(w, 200)} h={58} />
            </div>
            <div style={{ borderTop: `1px solid ${C.ink}` }} />
            <div style={{ display: 'flex', fontSize: 9.5, lineHeight: '18px', color: C.mute, paddingTop: 3 }}>
              <span style={{ flex: 'none', width: 74 }}>姓名 Name</span>
              <span style={{ color: C.ink, fontWeight: 600, flex: 1, minWidth: 0, ...WRAP }}>{r.name}</span>
            </div>
            <div style={{ display: 'flex', fontSize: 9.5, lineHeight: '18px', color: C.mute, borderTop: `1px dashed ${C.line}` }}>
              <span style={{ flex: 'none', width: 74 }}>日期 Date</span>
              <span style={{ color: C.ink, flex: 1 }}>{r.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndNote({ atom, ctx }) {
  return (
    <div style={{ borderTop: LINE, paddingTop: 8, textAlign: 'center', fontSize: 9.5, lineHeight: '15px', color: C.mute, letterSpacing: 0.4 }}>
      <Stars text={atom.text} color={ctx.accent} />
    </div>
  );
}

// ---------- 分发 ----------

/**
 * @param {{ atom, ctx: { meta, accent, urls, info, project, measure? }, pos: { first, last } }} props
 */
export function Atom({ atom, ctx, pos }) {
  switch (atom.kind) {
    case 'header':
      return <Header ctx={ctx} />;
    case 'intro':
      return <Intro atom={atom} />;
    case 'legend':
      return <Legend atom={atom} ctx={ctx} />;
    case 'secHead':
      return <SecHead atom={atom} ctx={ctx} />;
    case 'gridRow':
      return <GridRow atom={atom} ctx={ctx} pos={pos} />;
    case 'listRow':
      return <ListRow atom={atom} ctx={ctx} />;
    case 'photoLine':
      return <PhotoLine atom={atom} ctx={ctx} pos={pos} />;
    case 'clHead':
      return <ClHead block={atom.block} />;
    case 'clRow':
      return <ClRow atom={atom} ctx={ctx} pos={pos} />;
    case 'tick':
      return <Tick atom={atom} ctx={ctx} pos={pos} />;
    case 'tblHead':
      return <TblHead block={atom.block} />;
    case 'tblRow':
      return <TblRow atom={atom} pos={pos} />;
    case 'tblEmpty':
      return <TblEmpty block={atom.block} />;
    case 'contHead':
      return <ContHead block={atom.block} ctx={ctx} />;
    case 'summary':
      return <Summary block={atom.block} atom={atom} />;
    case 'note':
      return <Note block={atom.block} ctx={ctx} />;
    case 'sig':
      return <Signatures block={atom.block} ctx={ctx} />;
    case 'endNote':
      return <EndNote atom={atom} ctx={ctx} />;
    default:
      return null;
  }
}
