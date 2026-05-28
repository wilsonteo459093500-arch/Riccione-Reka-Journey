import { useState } from 'react';
import { X, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { T } from '../../theme.js';
import { newId } from '../../utils/helpers.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';

// Drive-link-only attachments. The app never stores binary data — it
// references whatever you already keep in Google Drive / Dropbox / etc.
// If this app disappears tomorrow, your files are still in Drive.
export default function AttachmentModal({ gateName, onClose, onSave }) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const toast = useToast();

  const handleSave = () => {
    if (!linkUrl.trim()) {
      toast('请填写链接 / Please paste a link', 'error');
      return;
    }
    let url = linkUrl.trim();
    if (!url.match(/^https?:\/\//)) url = 'https://' + url;
    onSave({
      id: newId('att'),
      name: linkName.trim() || url,
      url,
      source: 'link',
      uploadedAt: new Date().toISOString(),
    });
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
            <h2 className="font-display text-2xl flex items-center gap-2" style={{ color: T.ink }}>
              <LinkIcon size={18} strokeWidth={1.5} style={{ color: T.wood }} />
              添加链接 / Add Link
            </h2>
            <div className="text-xs mt-1" style={{ color: T.inkSoft }}>{gateName}</div>
          </div>
          <button onClick={onClose} style={{ color: T.inkSoft }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-3">
          <LabeledInput
            label="链接 URL"
            value={linkUrl}
            onChange={setLinkUrl}
            placeholder="https://drive.google.com/... 或 dropbox.com/..."
          />
          <LabeledInput
            label="显示名称 (可选)"
            value={linkName}
            onChange={setLinkName}
            placeholder="例: 复尺照片相册"
          />
          <div className="p-3 text-[11px] leading-relaxed" style={{ background: T.cream, color: T.inkSoft, borderRadius: '2px' }}>
            <div className="flex items-start gap-2">
              <ExternalLink size={13} strokeWidth={1.5} style={{ color: T.wood, marginTop: 2 }} />
              <div>
                <div className="font-medium mb-1" style={{ color: T.ink }}>为什么不直接上传文件？</div>
                把文件放在你自己的 Google Drive / Dropbox 里，应用只保存链接。这样：
                <br />· 文件永远是你的（应用消失也不影响）
                <br />· 不受 2MB 上限约束（视频/大图都可以）
                <br />· 团队共享更顺畅（Drive 自带权限管理）
              </div>
            </div>
          </div>
          <button
            onClick={handleSave}
            className="w-full py-3 text-sm flex items-center justify-center gap-2"
            style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
          >
            <LinkIcon size={14} strokeWidth={1.5} />
            添加链接 / Add
          </button>
        </div>
      </div>
    </div>
  );
}
