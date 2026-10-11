// 独立画板 → 复制到某个提案：画板（含 AI 实拍历史）复制一份挂到该项目，打开项目即可「设为方案封面」
import React, { useEffect, useState } from 'react';
import { FolderInput, LoaderCircle } from 'lucide-react';
import { Modal } from '../lib/ui.jsx';
import { listProjects } from '../store/db.js';
import { listShots, putBoard, putShot, setActiveBoardId } from './store.js';
import { timeAgo } from '../lib/format.js';

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 把一块画板复制到项目（新 id）；成为该项目当前打开的画板 */
export async function copyBoardToProject(rec, projectId) {
  const id = uid('b');
  const now = Date.now();
  const ok = await putBoard({ ...rec, id, projectId, name: `${rec.name || '画板'}（来自 Material Board）`, createdAt: now, ts: now });
  if (!ok) throw new Error('画板没能保存（浏览器存储空间可能不足）');
  for (const s of [...(await listShots(rec.id))].reverse()) {
    await putShot({ ...s, id: uid('shot'), boardId: id, projectId });
  }
  await setActiveBoardId(projectId, id);
  return id;
}

/**
 * props: { getRecord: () => Promise<boardRecord>, notify, onOpenProject?(id), onClose }
 */
export default function CopyToProject({ getRecord, notify, onOpenProject, onClose }) {
  const [projects, setProjects] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  async function copyTo(p) {
    setBusy(p.id);
    try {
      const rec = await getRecord();
      await copyBoardToProject(rec, p.id);
      notify?.({ type: 'ok', text: `已复制到「${p.name || '未命名方案'}」—— 在项目的「Material Board 封面」里点「设为方案封面」` });
      onClose();
      if (onOpenProject && window.confirm(`现在打开「${p.name || '未命名方案'}」？`)) onOpenProject(p.id, 'board');
    } catch (e) {
      notify?.({ type: 'error', text: `复制失败：${e?.message || e}` });
      setBusy(null);
    }
  }

  return (
    <Modal title="复制到提案" icon={<FolderInput size={16} className="text-bp-eyebrow" />} onClose={onClose} busy={!!busy}>
      <p className="text-xs text-bp-muted mb-3 leading-relaxed">
        画板会复制一份到所选提案（原画板不变），打开那个项目的「Material Board 封面」就能设为方案封面。
      </p>
      {projects === null ? (
        <div className="py-6 flex justify-center text-bp-faint">
          <LoaderCircle size={18} className="animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="py-6 text-center text-sm text-bp-faint">还没有提案 —— 先在首页上传一份方案 PDF。</div>
      ) : (
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto thin-scroll">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!!busy}
              onClick={() => copyTo(p)}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-bp-line bg-white px-3 py-2.5 text-left hover:border-bp-gold hover:bg-bp-tint disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-sm text-bp-ink truncate">{p.name || '未命名方案'}</span>
                <span className="block text-[11px] text-bp-faint">{p.updatedAt ? timeAgo(p.updatedAt) : ''}</span>
              </span>
              {busy === p.id ? <LoaderCircle size={15} className="animate-spin text-bp-faint" /> : <FolderInput size={15} className="text-bp-faint" />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
