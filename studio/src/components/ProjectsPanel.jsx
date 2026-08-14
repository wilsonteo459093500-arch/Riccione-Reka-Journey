import React, { useEffect } from 'react';
import { X, Trash2, FolderOpen, Save } from 'lucide-react';
import { Btn, Empty, Tag } from './ui/Bits.jsx';

export default function ProjectsPanel({ projects, onClose, onLoad, onDelete, onSaveCurrent, canSave }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-sail-ink/50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md bg-sail-paper h-full overflow-y-auto thin-scroll shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-sail-paper/95 backdrop-blur border-b border-sail-line px-5 h-14 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">项目</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sail-tint text-sail-muted">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-sail-tint border border-sail-line p-4">
            <p className="text-xs text-sail-muted leading-relaxed mb-3">
              存的是「脑子」—— 配方、剪辑方案、文案、素材清单。
              <strong className="text-sail-ink"> 原始视频不会被存进浏览器</strong>（几百 MB 会把它拖垮），
              重新打开项目后把原文件再拖进来就能继续预览和导出。
            </p>
            <Btn size="sm" icon={Save} onClick={onSaveCurrent} disabled={!canSave} className="w-full">
              保存当前项目
            </Btn>
          </div>

          {projects.length === 0 ? (
            <Empty icon={FolderOpen} title="还没有存档">
              做出配方或剪辑方案后，点上面的按钮存下来。
            </Empty>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id} className="p-3.5 rounded-xl border border-sail-line bg-sail-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sail-ink truncate">{p.name}</p>
                      <p className="text-[11px] text-sail-faint mt-0.5">
                        {new Date(p.ts).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="p-1.5 rounded-lg text-sail-faint hover:bg-sail-danger/10 hover:text-sail-danger shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.recipe && <Tag color="#2D4A3E">配方</Tag>}
                    {p.plan && <Tag color="#A87C4F">{p.plan.timeline?.length} 拍</Tag>}
                    {p.assets?.length > 0 && <Tag color="#6B6358">{p.assets.length} 素材</Tag>}
                  </div>

                  <Btn size="sm" variant="soft" className="w-full mt-2.5" onClick={() => onLoad(p)}>
                    打开
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
