// 开始一个空间：上传平面图 / 自己画 / 户型模板 / 打开以前的方案。有梦想家档案时，顶部显示「为谁定制」。
// 模板、最近的方案都画一张小平面图：多层的各层并排，带「双层」小章。

import { TEMPLATES, ROOM_TYPES, bounds, migratePlan } from '../plan/model.js';
import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { Icon, Modal } from './kit.jsx';
import { BRAND } from '../../shared/config.js';

/** 小平面图：多层的方案各层并排（一楼在左），右上角一个「双层 / 三层」的小章 */
const LAYERS = { 2: '双层', 3: '三层', 4: '四层' };
function MiniPlan({ plan: raw }) {
  const plan = migratePlan(raw);
  const floors = plan.floors.filter((f) => f.rooms.length);
  const list = floors.length ? floors : plan.floors.slice(0, 1);
  const GAP = 1.2;
  let x = 0;
  const placed = list.map((f) => {
    const b = bounds(f);
    const at = { f, b, dx: x - b.x0 };
    x += b.w + GAP;
    return at;
  });
  const W = Math.max(1, x - GAP);
  const D = Math.max(1, ...placed.map((p) => p.b.d));
  const y0 = Math.min(...placed.map((p) => p.b.y0));
  return (
    <span className="miniplan-wrap">
      <svg viewBox={`${-0.3} ${y0 - 0.3} ${W + 0.6} ${D + 0.6}`} className="miniplan" aria-hidden="true">
        {placed.map(({ f, dx }) => (
          <g key={f.id} transform={`translate(${dx} 0)`}>
            {f.rooms.map((r) => (
              <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_TYPES[r.type]?.color || 'var(--bg-deep)'} className="miniplan-room" />
            ))}
          </g>
        ))}
      </svg>
      {list.length > 1 && <i className="miniplan-badge">{t(LAYERS[list.length] || '多层')}</i>}
    </span>
  );
}

/**
 * 模板卡片的第二行：中文模式放英文全名（Condo · 3R2B · ~1,100 sqft）；
 * 英文模式标题已经是英文了，就只放标题里还没说的那几段（3R2B · ~1,100 sqft），两种语言都看得到面积。
 */
function tplSub(tp) {
  if (!isEn()) return tp.en || '';
  const title = L(tp).toLowerCase();
  return String(tp.en || '')
    .split(' · ')
    .filter((seg) => seg && !title.includes(seg.toLowerCase()))
    .join(' · ');
}

const when = (iso) => {
  try {
    return new Date(iso).toLocaleString(isEn() ? 'en-GB' : 'zh-CN', { month: isEn() ? 'short' : 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function StartModal({ profile, projects, onTemplate, onUpload, onDraw, onOpen, onClose }) {
  const d = profile && DREAMER_BY_CODE[profile.code];
  return (
    <Modal eyebrow={isEn() ? BRAND.studioEn : BRAND.studio} title={t('开始一个空间')} onClose={onClose} wide>
      {d && (
        <div className="start-profile">
          <span className="sp-num">{d.num}</span>
          <div>
            <b>{t('为 {0} 定制 · {1}', [profile.name || t('贵宾'), L(d)])}</b>
            <p>{t('许愿时选的材质、收纳量、生活习惯（神台、宠物、在家办公…）会自动套进 3D。选一个起点')}</p>
          </div>
        </div>
      )}
      <div className="start-grid">
        <button type="button" className="start-card primary" onClick={onUpload}>
          <span className="start-ico">
            <Icon name="upload" size={22} />
          </span>
          <b>{t('上传平面图')}</b>
          <em>{t('图片或 PDF。填了 AI key 会自动识别房间，校正 30 秒就能生成 3D。')}</em>
        </button>
        <button type="button" className="start-card" onClick={onDraw}>
          <span className="start-ico">
            <Icon name="plan" size={22} />
          </span>
          <b>{t('自己画')}</b>
          <em>{t('拉几个方块就是房间，再点墙放门窗')}</em>
        </button>
      </div>
      <h3 className="start-h">{t('户型模板（马上就有）')}</h3>
      <div className="start-templates">
        {TEMPLATES.filter((tp) => !tp.hidden).map((tp) => {
          const sub = tplSub(tp);
          return (
            <button key={tp.id} type="button" className="tpl" onClick={() => onTemplate(tp.id)}>
              <MiniPlan plan={tp.plan} />
              <span>
                <b>{L(tp)}</b>
                {sub && <em>{sub}</em>}
              </span>
            </button>
          );
        })}
      </div>
      {projects.length > 0 && (
        <>
          <h3 className="start-h">{t('最近的方案')}</h3>
          <div className="start-recent">
            {projects.slice(0, 8).map((p) => (
              <button key={p.id} type="button" className="recent" onClick={() => onOpen(p)}>
                <MiniPlan plan={p.plan} />
                <span>
                  <b>{t(p.name)}</b>
                  <em>
                    {when(p.updatedAt)}
                    {p.sharedFrom && <> · {t('分享来的')}</>}
                  </em>
                </span>
                <Icon name="chevron" size={16} className="recent-go" />
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
