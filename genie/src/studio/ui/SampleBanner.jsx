// 示范户型的提示条（SPEC §8.4）：客人还没有给户型图（或读不清）→ 3D 是最接近他答的那种房子的示范户型，要说清楚，
// 再轻轻提一句：上传户型图，就会变成你的家。
//   客人自己的手机 / 分享链接：「上传户型图」→ quiz.html#plan=<档案 id>（同一台设备，许愿之旅接着收户型图）；
//   许愿模式（展厅 iPad，客人不能选文件）：「请员工帮你上传」→ 告诉外壳在等（WISH 字标上一个金点），员工在员工区选文件，
//   外壳把文件发过来（{ type:'plan-file' }），StudioApp 读图、换成他的家（案例和保留的颜色不变）。
// state：'idle' | 'waiting' | 'reading' | 'unreadable'；pct：读图进度。

import { t } from '../../shared/i18n.js';
import { Icon } from './kit.jsx';

export default function SampleBanner({ wish = false, profileId = null, state = 'idle', pct = 0, top = false, onStaff, onCancelWait }) {
  const href = profileId ? `quiz.html#plan=${encodeURIComponent(profileId)}` : null;
  let body;
  let action = null;
  if (state === 'reading') {
    body = (
      <span className="st-banner-text">
        <b>{t('正在读你的户型图 · {0}%', [Math.round(pct)])}</b>
        <span className="st-banner-bar" aria-hidden="true">
          <i style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
        </span>
      </span>
    );
    action = <Icon name="spinner" size={20} className="st-spin" />;
  } else if (state === 'waiting') {
    body = (
      <span className="st-banner-text">
        <b>{t('好的，请员工帮你上传，我在这里等。')}</b>
        <span>{t('员工上传以后，这里就会变成你的家')}</span>
      </span>
    );
    action = (
      <button type="button" className="st-banner-btn ghost" onClick={onCancelWait} data-sfx="back">
        {t('先不用')}
      </button>
    );
  } else {
    body = (
      <span className="st-banner-text">
        {state === 'unreadable' ? (
          <b>{t('这张我读不清 —— 先用最接近的示范户型给你看，设计师会照你的户型图重新画。')}</b>
        ) : (
          <>
            <b>{t('这是示范户型')}</b>
            {/* 能上传（自己的设备 / 展厅请员工）→ 轻轻提一句；分享来的（别人的手机，没有这份档案）→ 只说设计师会换 */}
            <span>{wish || href ? t('上传你的户型图，就会变成你的家') : t('设计师会换成你家的户型图')}</span>
          </>
        )}
      </span>
    );
    if (wish)
      action = (
        <button type="button" className="st-banner-btn" onClick={onStaff} data-sfx="confirm">
          <Icon name="upload" size={16} />
          {t('请员工帮你上传')}
        </button>
      );
    else if (href)
      action = (
        <a className="st-banner-btn" href={href} data-sfx="open">
          <Icon name="upload" size={16} />
          {t('上传户型图')}
        </a>
      );
  }
  return (
    <div className={`glass st-banner ${top ? 'top' : ''} ${state}`} role="status" aria-live="polite">
      <span className="st-banner-ico" aria-hidden="true">
        <Icon name={state === 'unreadable' ? 'info' : 'home'} size={17} />
      </span>
      {body}
      {action}
    </div>
  );
}
