// 分享：复制链接 / WhatsApp。链接里就是整份方案（平面图 + 家具 + 材质 + 时间），不经过任何服务器。
// 打开的人得到的是自己的一份（新 id），不会盖掉你这台设备上的原稿。

import { useEffect, useState } from 'react';
import { Icon, Modal, listSep } from './kit.jsx';
import { CONFIG } from '../../shared/config.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { t, L, withLang } from '../../shared/i18n.js';

export default function ShareModal({ project, pack, onClose }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    pack().then((s) => alive && setLink(withLang(new URL(`studio.html#s=${s}`, location.href).href)));
    return () => {
      alive = false;
    };
  }, [pack]);
  const mats = ['floor', 'walls', 'cabinetry', 'upholstery']
    .map((k) => L(MAT_BY_ID[project.materials[k]]))
    .filter(Boolean)
    .join(listSep());
  const text = [t(project.name), t('3D 概念：{0}', [mats]), t('打开就能转、能换材质：{0}', [link])].join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* 复制不了：输入框里可以手动全选 */
    }
  };
  return (
    <Modal eyebrow={t('分享')} title={t('分享这个 3D 概念')} onClose={onClose}>
      <p className="m-p">{t('链接里就是整份方案。客人用手机打开，也能转、能换材质、能拖太阳。')}</p>
      <div className="share-link">
        <input readOnly value={link || t('生成中…')} onFocus={(e) => e.target.select()} aria-label={t('分享链接')} />
        <button type="button" className="s-btn primary" disabled={!link} onClick={copy}>
          <Icon name={copied ? 'check' : 'link'} size={16} />
          {copied ? t('已复制') : t('复制链接')}
        </button>
      </div>
      <div className="share-row">
        <a className="s-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          <Icon name="whatsapp" size={17} />
          {t('WhatsApp 发给客人')}
        </a>
        <a className="s-btn" href={`https://wa.me/${CONFIG.inbox}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">
          <Icon name="inbox" size={17} />
          {t('发到公司 WhatsApp')}
        </a>
      </div>
      <p className="m-fine">{t('链接长度约 {0} 字。平面图底图（原图）不会放进链接。', [link.length])}</p>
    </Modal>
  );
}
