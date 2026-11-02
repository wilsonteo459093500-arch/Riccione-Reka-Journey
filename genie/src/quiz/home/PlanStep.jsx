// P · 给我你家的户型图（SPEC §5.1）—— 一定要有的一步：生成以后就是客人自己的家，不用再上传一次。
//   客人自己的手机（单独打开 / 分享链接）：拍一张（相机）· 从相册或文件选（照片、截图、PDF）· 我还没有户型图；
//   展厅 iPad（许愿模式）：用相机拍（页面里的相机，Camera.jsx）· 请员工帮我上传（文件选择只在员工区里）· 我还没有户型图。
//   许愿模式里客人永远碰不到文件选择（DESIGN.md §6）：这一页在许愿模式里根本没有 <input type=file>。

import { useRef } from 'react';
import { Camera as CameraIcon, ImageUp, UserPlus, House } from 'lucide-react';
import fx from '../../shared/fx.js';
import { t } from '../../shared/i18n.js';
import { Head } from './kit.jsx';

export const MAX_MB = 25;

/** 文件能不能用：图片或 PDF、≤ 25 MB（HEIC 从 iOS 的照片选择里出来已经是 JPEG） */
export function fileOk(file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  const isPdf = type === 'application/pdf' || name.endsWith('.pdf');
  const isImg = type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(name);
  return (isPdf || isImg) && file.size > 0 && file.size <= MAX_MB * 1024 * 1024;
}

/** 图片真的打得开吗（PDF 交给读图的人自己判断） */
export async function decodable(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')) return true;
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      bmp.close?.();
      return true;
    }
  } catch {
    return false;
  }
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      res(true);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      res(false);
    };
    im.src = url;
  });
}

function Choice({ kind = '', icon: Icon, title, sub, onClick, sfx }) {
  return (
    <button type="button" className={`pp-choice ${kind}`} onClick={onClick} data-sfx={sfx}>
      <span className="pp-ico" aria-hidden="true">
        <Icon size={24} strokeWidth={1.7} />
      </span>
      <span className="pp-tt">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

export default function PlanStep({ caseTitle, wish = false, canCamera = false, error = '', onFile, onCamera, onStaff, onLater }) {
  const camIn = useRef(null);
  const fileIn = useRef(null);
  const lead = caseTitle
    ? t('我会照着它，把「{0}」放进你的家 —— 生成以后就是你自己的家，不用再上传一次。', [caseTitle])
    : t('我会照着它，把你的梦想放进你的家 —— 生成以后就是你自己的家，不用再上传一次。');
  const picked = (e, source) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile?.(f, source);
  };
  const press = (e, fn) => {
    if (e?.currentTarget) fx.scan(e.currentTarget, { duration: 300, sound: null });
    fn?.(e);
  };
  return (
    <div className="step hj-card wide">
      <Head eyebrow={t('最后一步')} title={t('给我你家的户型图')} lead={lead} />
      <div className="pp-choices">
        {wish ? (
          <>
            {canCamera && (
              <Choice kind="primary" icon={CameraIcon} title={t('用相机拍')} sub={t('纸本户型图，或者你手机屏幕上的那一张都可以')} onClick={(e) => press(e, onCamera)} sfx="open" />
            )}
            <Choice kind={canCamera ? '' : 'primary'} icon={UserPlus} title={t('请员工帮我上传')} sub={t('在邮件、WhatsApp 里的 PDF 也可以')} onClick={(e) => press(e, onStaff)} />
          </>
        ) : (
          <>
            <Choice kind="primary" icon={CameraIcon} title={t('拍一张')} sub={t('纸本户型图、售楼册那一页')} onClick={() => camIn.current?.click()} sfx="open" />
            <Choice icon={ImageUp} title={t('从相册或文件选')} sub={t('照片、截图、PDF 都可以')} onClick={() => fileIn.current?.click()} sfx="open" />
          </>
        )}
        <Choice kind="quiet" icon={House} title={t('我还没有户型图')} sub={t('先用最接近的示范户型看看')} onClick={(e) => press(e, onLater)} />
      </div>
      {!wish && (
        <span className="pp-inputs" aria-hidden="true">
          <input ref={camIn} type="file" accept="image/*" capture="environment" tabIndex={-1} onChange={(e) => picked(e, 'photo')} />
          <input ref={fileIn} type="file" accept="image/*,application/pdf" tabIndex={-1} onChange={(e) => picked(e, 'file')} />
        </span>
      )}
      {error ? (
        <p className="pp-err" role="alert">
          {error}
        </p>
      ) : (
        <ul className="pp-tips">
          <li>{t('开发商户型图、售楼册、手机截图都可以')}</li>
          <li>{t('四个角都拍进来')}</li>
          <li>{t('有尺寸的更准')}</li>
        </ul>
      )}
    </div>
  );
}
