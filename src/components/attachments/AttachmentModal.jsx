import { useRef, useState } from 'react';
import { X, Upload, Link as LinkIcon } from 'lucide-react';
import { T } from '../../theme.js';
import { MAX_UPLOAD_BYTES } from '../../constants/storage.js';
import { newId, fmtBytes, fileToBase64 } from '../../utils/helpers.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';

export default function AttachmentModal({ gateName, onClose, onSave }) {
  const [tab, setTab] = useState('upload');
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const fileRef = useRef(null);
  const toast = useToast();

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast(`文件过大 (${fmtBytes(file.size)})，上限 ${fmtBytes(MAX_UPLOAD_BYTES)}。大文件请用云盘链接。`, 'error');
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      await onSave(
        { id: newId('att'), name: file.name, type: file.type, size: file.size, source: 'upload', uploadedAt: new Date().toISOString() },
        base64
      );
    } catch (e) {
      toast('上传失败: ' + e.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleLink = () => {
    if (!linkUrl.trim()) {
      toast('请填写链接', 'error');
      return;
    }
    let url = linkUrl.trim();
    if (!url.match(/^https?:\/\//)) url = 'https://' + url;
    onSave({ id: newId('att'), name: linkName.trim() || url, url, source: 'link', uploadedAt: new Date().toISOString() }, null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(45, 62, 54, 0.35)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-lg p-6 fade-up" style={{ background: T.paper, borderRadius: '2px' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl" style={{ color: T.ink }}>添加附件</h2>
            <div className="text-xs mt-1" style={{ color: T.inkSoft }}>{gateName}</div>
          </div>
          <button onClick={onClose} style={{ color: T.inkSoft }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex gap-1 mb-5">
          <button
            onClick={() => setTab('upload')}
            className="flex-1 py-2 text-sm flex items-center justify-center gap-1.5"
            style={{
              background: tab === 'upload' ? T.cream : 'transparent',
              color: tab === 'upload' ? T.ink : T.inkSoft,
              borderBottom: `2px solid ${tab === 'upload' ? T.wood : 'transparent'}`,
            }}
          >
            <Upload size={14} strokeWidth={1.5} />
            上传文件
          </button>
          <button
            onClick={() => setTab('link')}
            className="flex-1 py-2 text-sm flex items-center justify-center gap-1.5"
            style={{
              background: tab === 'link' ? T.cream : 'transparent',
              color: tab === 'link' ? T.ink : T.inkSoft,
              borderBottom: `2px solid ${tab === 'link' ? T.wood : 'transparent'}`,
            }}
          >
            <LinkIcon size={14} strokeWidth={1.5} />
            云盘链接
          </button>
        </div>

        {tab === 'upload' ? (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full py-10 transition-colors"
              style={{ background: T.cream, border: `2px dashed ${T.line}`, borderRadius: '2px', color: T.inkSoft }}
            >
              {uploading ? (
                <div>上传中…</div>
              ) : (
                <>
                  <Upload size={28} strokeWidth={1} className="mx-auto mb-2" style={{ color: T.wood }} />
                  <div className="text-sm mb-1" style={{ color: T.ink }}>点击选择文件</div>
                  <div className="text-xs">支持: 图片 / PDF / Excel / Word</div>
                  <div className="text-[10px] mt-1 opacity-60">最大 {fmtBytes(MAX_UPLOAD_BYTES)} (大文件请用链接)</div>
                </>
              )}
            </button>
            <div className="mt-3 text-[10px] leading-relaxed" style={{ color: T.inkSoft, opacity: 0.7 }}>
              💡 适合: 签好的验收表 (PDF), 量尺照, 客户签字图纸截图…
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <LabeledInput label="链接 URL" value={linkUrl} onChange={setLinkUrl} placeholder="https://drive.google.com/... 或 dropbox.com/..." />
            <LabeledInput label="显示名称 (可选)" value={linkName} onChange={setLinkName} placeholder="例: 复尺照片相册" />
            <div className="text-[10px] leading-relaxed" style={{ color: T.inkSoft, opacity: 0.7 }}>
              💡 适合: Google Drive 文件夹, Dropbox PDF, WeChat 链接 … (大小无限制)
            </div>
            <button onClick={handleLink} className="w-full py-3 text-sm mt-3" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
              添加链接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
