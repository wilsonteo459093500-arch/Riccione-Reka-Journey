import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { listProjects, deleteProject } from '../services/projects.js';
import { Btn } from './ui/Bits.jsx';

export default function ProjectsPanel({ open, onClose, onOpenProject, currentId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (open) listProjects().then(setRows);
  }, [open]);

  if (!open) return null;

  const remove = async (id) => {
    await deleteProject(id);
    setRows(await listProjects());
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="w-full sm:w-[380px] h-full bg-sail-paper border-l border-sail-line overflow-y-auto thin-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-sail-paper/95 backdrop-blur border-b border-sail-line px-4 h-14 flex items-center justify-between">
          <h2 className="font-semibold text-sail-ink">项目（存本机）</h2>
          <button onClick={onClose} className="p-1.5 text-sail-muted hover:text-sail-ink">
            <X size={18} />
          </button>
        </header>
        <div className="p-3 space-y-2">
          {rows.length === 0 && <div className="text-sm text-sail-muted px-1 py-6 text-center">还没有保存的项目。</div>}
          {rows.map((r) => (
            <div
              key={r.id}
              className={`flex gap-3 items-center bg-white border rounded-xl p-2 ${
                r.id === currentId ? 'border-sail-green' : 'border-sail-line'
              }`}
            >
              <button className="flex gap-3 items-center flex-1 min-w-0 text-left" onClick={() => onOpenProject(r.id)}>
                {r.thumb ? (
                  <img src={r.thumb} alt="" className="w-14 h-14 object-cover rounded-lg border border-sail-line bg-white" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-sail-tint" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-sail-ink truncate">{r.name || '未命名'}</div>
                  <div className="text-[11px] text-sail-faint">
                    {(r.items?.length || 0)} 条测量 · {new Date(r.ts).toLocaleString('zh-CN', { hour12: false })}
                  </div>
                </div>
              </button>
              <button onClick={() => remove(r.id)} className="p-1.5 text-sail-faint hover:text-sail-danger" title="删除">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <p className="text-[11px] text-sail-faint px-1 pt-2 leading-relaxed">
            只存在这台设备的浏览器里（IndexedDB），最多留 30 个项目。清浏览器数据会一并清掉，重要的记得导出。
          </p>
        </div>
      </aside>
    </div>
  );
}
