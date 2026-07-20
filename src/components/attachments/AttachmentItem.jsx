import { memo } from 'react';
import { Link as LinkIcon, ExternalLink, X } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';

// All attachments are now external links (Google Drive, Dropbox, etc.).
// The app never holds binary data — your files outlive the app.
function AttachmentItem({ attachment: a, onRemove }) {
  const confirm = useConfirm();

  const handleRemove = async () => {
    if (await confirm({ title: '删除链接', message: `确定移除「${a.name}」?`, danger: true, confirmText: '删除' })) {
      onRemove();
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs" style={{ background: T.cream, borderRadius: '2px' }}>
      <LinkIcon size={13} strokeWidth={1.5} style={{ color: T.wood }} />
      <span className="flex-1 truncate" style={{ color: T.ink }}>{a.name}</span>
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        className="opacity-60 hover:opacity-100"
        style={{ color: T.inkSoft }}
        title="在新标签打开 / Open in new tab"
      >
        <ExternalLink size={12} />
      </a>
      <button onClick={handleRemove} className="opacity-40 hover:opacity-100" style={{ color: T.terra }} title="移除">
        <X size={12} />
      </button>
    </div>
  );
}

export default memo(AttachmentItem);
