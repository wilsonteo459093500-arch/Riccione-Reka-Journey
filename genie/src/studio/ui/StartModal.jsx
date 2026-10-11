// 开始一个空间：上传平面图 / 户型模板 / 打开以前的方案。有梦想家档案时，顶部显示「为谁定制」。

import { TEMPLATES, bounds } from '../plan/model.js';
import { DREAMER_BY_CODE } from '../../shared/dreamers.js';
import { ROOM_TYPES } from '../plan/model.js';
import { Modal } from './kit.jsx';

function MiniPlan({ plan }) {
  const b = bounds(plan);
  return (
    <svg viewBox={`${b.x0 - 0.3} ${b.y0 - 0.3} ${b.w + 0.6} ${b.d + 0.6}`} className="miniplan">
      {plan.rooms.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_TYPES[r.type]?.color || '#ddd'} stroke="#3a3025" strokeWidth="0.08" />
      ))}
    </svg>
  );
}

export default function StartModal({ profile, projects, onTemplate, onUpload, onDraw, onOpen, onClose }) {
  const d = profile && DREAMER_BY_CODE[profile.code];
  return (
    <Modal title="开始一个空间" onClose={onClose} wide>
      {d && (
        <div className="start-profile">
          <span className="sp-num">{d.num}</span>
          <div>
            <b>
              为 {profile.name || '贵宾'} 定制 · {d.zh}
            </b>
            <p>占卜里选的材质、收纳量、生活习惯（神台、宠物、在家办公…）会自动套进 3D。选一个起点 ↓</p>
          </div>
        </div>
      )}
      <div className="start-grid">
        <button type="button" className="start-card primary" onClick={onUpload}>
          <span className="start-ico">📐</span>
          <b>上传平面图</b>
          <em>图片 / PDF · AI 自动识别房间（有 key 时），30 秒校正后生成 3D</em>
        </button>
        <button type="button" className="start-card" onClick={onDraw}>
          <span className="start-ico">✏️</span>
          <b>自己画</b>
          <em>拉几个方块就是房间，再点墙放门窗</em>
        </button>
      </div>
      <h3 className="start-h">户型模板（马上就有）</h3>
      <div className="start-templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="tpl" onClick={() => onTemplate(t.id)}>
            <MiniPlan plan={t.plan} />
            <b>{t.zh}</b>
            <em>{t.en}</em>
          </button>
        ))}
      </div>
      {projects.length > 0 && (
        <>
          <h3 className="start-h">最近的方案</h3>
          <div className="start-recent">
            {projects.slice(0, 8).map((p) => (
              <button key={p.id} type="button" className="recent" onClick={() => onOpen(p)}>
                <MiniPlan plan={p.plan} />
                <span>
                  <b>{p.name}</b>
                  <em>{new Date(p.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</em>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
