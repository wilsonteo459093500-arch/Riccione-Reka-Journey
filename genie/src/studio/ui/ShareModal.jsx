// 分享：复制链接 / WhatsApp。链接里就是整份方案（平面图 + 家具 + 材质 + 时间），不经过任何服务器。

import { useEffect, useState } from 'react';
import { Modal } from './kit.jsx';
import { CONFIG } from '../../shared/config.js';
import { MAT_BY_ID } from '../../shared/materials.js';

export default function ShareModal({ project, pack, onClose }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    pack().then((s) => setLink(new URL(`studio.html#s=${s}`, location.href).href));
  }, [pack]);
  const text = `✨ ${project.name}\n3D 概念：${['floor', 'walls', 'cabinetry', 'upholstery'].map((k) => MAT_BY_ID[project.materials[k]]?.zh).join(' · ')}\n打开就能转、能换材质：${link}`;
  return (
    <Modal title="分享这个 3D 概念" onClose={onClose}>
      <p className="m-p">链接里就是整份方案。客人用手机打开，也能转、能换材质、能拖太阳。</p>
      <div className="share-link">
        <input readOnly value={link || '生成中…'} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="s-btn gold"
          disabled={!link}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* ignore */
            }
          }}
        >
          {copied ? '已复制 ✓' : '复制链接'}
        </button>
      </div>
      <div className="share-row">
        <a className="s-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          💬 WhatsApp 发给客人
        </a>
        <a className="s-btn" href={`https://wa.me/${CONFIG.inbox}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          📥 发到公司 WhatsApp
        </a>
      </div>
      <p className="m-fine">链接长度约 {link.length} 字。平面图底图（原图）不会放进链接。</p>
    </Modal>
  );
}
