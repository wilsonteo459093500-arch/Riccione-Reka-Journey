import { Sparkles, BookOpen, Plus } from 'lucide-react';
import { T } from '../theme.js';

export default function EmptyState({ onLoadSample, onNew, onSeeMethod }) {
  return (
    <div className="text-center py-24 max-w-2xl mx-auto fade-up">
      <div className="font-display text-5xl mb-3" style={{ color: T.ink }}>The SAIL Method</div>
      <div className="text-sm tracking-widest uppercase mb-12" style={{ color: T.wood }}>
        Where Design Meets Nature
      </div>
      <div className="ink-divider mb-12 max-w-xs mx-auto" />
      <p className="text-base mb-3 leading-relaxed" style={{ color: T.inkSoft }}>
        <span className="font-display text-xl" style={{ color: T.ink }}>
          Vision · Blueprint · Craft · Arrival · Signature
        </span>
      </p>
      <p className="text-sm mb-12 leading-relaxed" style={{ color: T.inkSoft }}>
        让 SD / SS / WH / 采购 在同一份方法论上协作。
        <br />
        <span className="text-xs">数据本地存储 · 文件可上传 · 客户可分享视图</span>
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={onLoadSample}
          className="px-6 py-3 text-sm hover-lift"
          style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        >
          <Sparkles size={14} className="inline mr-2" strokeWidth={1.5} />
          载入示范数据
        </button>
        <button
          onClick={onSeeMethod}
          className="px-6 py-3 text-sm hover-lift"
          style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        >
          <BookOpen size={14} className="inline mr-2" strokeWidth={1.5} />
          阅读 Method
        </button>
        <button onClick={onNew} className="px-6 py-3 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
          <Plus size={14} className="inline mr-2" strokeWidth={2} />
          新建第一个项目
        </button>
      </div>
    </div>
  );
}
