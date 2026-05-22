import { memo, useState } from 'react';
import { Link as LinkIcon, Image as ImageIcon, FileText, ExternalLink, Eye, Download, X } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtBytes, isImage, isPDF } from '../../utils/helpers.js';
import { useConfirm, useToast } from '../ui/UIProvider.jsx';

function AttachmentItem({ attachment: a, onRemove, fetchAttachment }) {
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [content, setContent] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const handleOpen = async () => {
    if (a.source === 'link') {
      window.open(a.url, '_blank');
      return;
    }
    setLoading(true);
    const c = await fetchAttachment(a.id);
    setLoading(false);
    if (!c) {
      toast('文件读取失败', 'error');
      return;
    }
    setContent(c);
    setPreviewOpen(true);
  };

  const handleDownload = async () => {
    if (a.source === 'link') {
      window.open(a.url, '_blank');
      return;
    }
    let c = content;
    if (!c) {
      setLoading(true);
      c = await fetchAttachment(a.id);
      setLoading(false);
    }
    if (!c) {
      toast('文件读取失败', 'error');
      return;
    }
    const link = document.createElement('a');
    link.href = c;
    link.download = a.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRemove = async () => {
    if (await confirm({ title: '删除附件', message: `确定删除「${a.name}」?`, danger: true, confirmText: '删除' })) {
      onRemove();
    }
  };

  const Icon = a.source === 'link' ? LinkIcon : isImage(a.type) ? ImageIcon : FileText;

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs" style={{ background: T.cream, borderRadius: '2px' }}>
        <Icon size={13} strokeWidth={1.5} style={{ color: T.wood }} />
        <span className="flex-1 truncate" style={{ color: T.ink }}>{a.name}</span>
        {a.source === 'upload' && <span className="font-mono" style={{ color: T.inkSoft, opacity: 0.6 }}>{fmtBytes(a.size)}</span>}
        <button onClick={handleOpen} disabled={loading} className="opacity-60 hover:opacity-100" style={{ color: T.inkSoft }}>
          {loading ? <span className="text-[10px]">…</span> : a.source === 'link' ? <ExternalLink size={12} /> : <Eye size={12} />}
        </button>
        {a.source === 'upload' && (
          <button onClick={handleDownload} className="opacity-60 hover:opacity-100" style={{ color: T.inkSoft }}>
            <Download size={12} />
          </button>
        )}
        <button onClick={handleRemove} className="opacity-40 hover:opacity-100" style={{ color: T.terra }}>
          <X size={12} />
        </button>
      </div>

      {previewOpen && content && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(45, 62, 54, 0.85)' }}
          onClick={() => setPreviewOpen(false)}
        >
          <div className="max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {isImage(a.type) ? (
              <img src={content} alt={a.name} className="max-w-full" style={{ background: T.paper }} />
            ) : isPDF(a.type) ? (
              <iframe src={content} className="w-[80vw] h-[85vh]" title={a.name} style={{ background: T.paper }} />
            ) : (
              <div className="p-8" style={{ background: T.paper, borderRadius: '2px' }}>
                <FileText size={48} strokeWidth={1} className="mx-auto mb-4" style={{ color: T.wood }} />
                <div className="font-display text-2xl mb-2" style={{ color: T.ink }}>{a.name}</div>
                <div className="text-sm mb-4" style={{ color: T.inkSoft }}>无法预览此格式 — 请下载查看</div>
                <button onClick={handleDownload} className="px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
                  <Download size={14} className="inline mr-2" />
                  下载
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default memo(AttachmentItem);
