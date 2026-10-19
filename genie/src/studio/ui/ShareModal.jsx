// 分享：复制链接 / WhatsApp。链接里就是整份方案（平面图 + 家具 + 材质 + 时间），不经过任何服务器。
// 打开的人得到的是自己的一份（新 id），不会盖掉你这台设备上的原稿。
// 两种链接（设计师的东西绝不能到客人手上）：
//   复制链接、「WhatsApp 发给客人」→ 客人版 studio.html#s=…（打开没有收纳对账、没有见面要聊的）
//   「发到公司 WhatsApp」→ 设计师自己分享时是员工版 studio.html?staff=1#s=…（同事打开照样有收纳对账）；
//   客人在客人版里分享时仍是客人版（那条消息也留在客人自己的 WhatsApp 里）。
// guest = 客人在自己的设备上（「带它回家」生成的家，不是展厅的许愿模式）：按钮说客人的话 ——「发给家人」「发给我们的设计师」，
//   不说「客人」「公司」。展厅 iPad 上（许愿模式，员工在旁边）照旧。

import { useEffect, useState } from 'react';
import { Icon, Modal, listSep } from './kit.jsx';
import { CONFIG } from '../../shared/config.js';
import { MAT_BY_ID } from '../../shared/materials.js';
import { t, L, withLang } from '../../shared/i18n.js';
import { fmt } from '../../shared/units.js'; // 千分位：3,267

export default function ShareModal({ project, pack, staff = false, guest = false, onClose }) {
  const mine = guest && !staff;
  const [links, setLinks] = useState({ client: '', staff: '' });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    pack().then((s) => {
      if (!alive) return;
      setLinks({
        client: withLang(new URL(`studio.html#s=${s}`, location.href).href),
        // 员工链接只在设计师版里做出来：客人版连算都不算
        staff: staff ? withLang(new URL(`studio.html?staff=1#s=${s}`, location.href).href) : '',
      });
    });
    return () => {
      alive = false;
    };
  }, [pack, staff]);
  const link = links.client;
  const mats = ['floor', 'walls', 'cabinetry', 'upholstery']
    .map((k) => L(MAT_BY_ID[project.materials[k]]))
    .filter(Boolean)
    .join(listSep());
  const message = (url) => [t(project.name), t('3D 概念：{0}', [mats]), t('打开就能转、能换材质：{0}', [url])].join('\n');
  const toClient = message(link);
  const toCompany = message(staff ? links.staff : link);
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
    <Modal eyebrow={t('分享')} title={mine ? t('分享你的家') : t('分享这个 3D 概念')} onClose={onClose}>
      <p className="m-p">{mine ? t('链接里就是你的整个家。家人用手机打开，也能转、能换材质、能拖太阳。') : t('链接里就是整份方案。客人用手机打开，也能转、能换材质、能拖太阳。')}</p>
      <div className="share-link">
        <input readOnly value={link || t('生成中…')} onFocus={(e) => e.target.select()} aria-label={t('分享链接')} />
        <button type="button" className="s-btn primary" disabled={!link} onClick={copy}>
          <Icon name={copied ? 'check' : 'link'} size={16} />
          {copied ? t('已复制') : t('复制链接')}
        </button>
      </div>
      <div className="share-row">
        <a className="s-btn" href={`https://wa.me/?text=${encodeURIComponent(toClient)}`} target="_blank" rel="noopener" aria-disabled={!link || undefined} onClick={(e) => !link && e.preventDefault()}>
          <Icon name="whatsapp" size={17} />
          {mine ? t('发给家人') : t('WhatsApp 发给客人')}
        </a>
        <a className="s-btn" href={`https://wa.me/${CONFIG.inbox}?text=${encodeURIComponent(toCompany)}`} target="_blank" rel="noopener" aria-disabled={!link || undefined} onClick={(e) => !link && e.preventDefault()}>
          <Icon name="inbox" size={17} />
          {mine ? t('发给我们的设计师') : t('发到公司 WhatsApp')}
        </a>
      </div>
      {/* 客人：上传过户型图才说一句「原图不放进链接」（示范户型没有原图）；设计师：链接长度 */}
      {mine ? !project.sample && <p className="m-fine">{t('你上传的户型图原图不会放进链接。')}</p> : <p className="m-fine">{t('链接长度约 {0} 字。平面图底图（原图）不会放进链接。', [fmt(link.length)])}</p>}
    </Modal>
  );
}
