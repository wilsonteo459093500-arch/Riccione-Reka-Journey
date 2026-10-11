// 开始一个空间：上传平面图 / 自己画 / 户型模板 / 打开以前的方案。有梦想家档案时，顶部显示「为谁定制」。

import { TEMPLATES, ROOM_TYPES, bounds } from '../plan/model.js';
import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import { t, L, isEn } from '../../shared/i18n.js';
import { Icon, Modal } from './kit.jsx';

function MiniPlan({ plan }) {
  const b = bounds(plan);
  return (
    <svg viewBox={`${b.x0 - 0.3} ${b.y0 - 0.3} ${b.w + 0.6} ${b.d + 0.6}`} className="miniplan" aria-hidden="true">
      {plan.rooms.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_TYPES[r.type]?.color || 'var(--bg-deep)'} className="miniplan-room" />
      ))}
    </svg>
  );
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
    <Modal eyebrow={t('3D 梦想工作室')} title={t('开始一个空间')} onClose={onClose} wide>
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
          <em>{t('图片 / PDF · AI 自动识别房间（有 key 时），30 秒校正后生成 3D')}</em>
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
        {TEMPLATES.map((tp) => (
          <button key={tp.id} type="button" className="tpl" onClick={() => onTemplate(tp.id)}>
            <MiniPlan plan={tp.plan} />
            <span>
              <b>{L(tp)}</b>
              {!isEn() && <em>{tp.en}</em>}
            </span>
          </button>
        ))}
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
