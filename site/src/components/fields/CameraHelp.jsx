// 拍照 / 相册打不开时的帮助：
//   - CameraHelpSteps：解决办法（用浏览器打开 / 允许相机和存储权限 / 用网页相机）
//   - CameraHelpSheet：上面内容的弹层（设置页、提示卡片里打开）
//   - NoShowCard：点了拍照 / 相册却什么都没弹出时，出现在按钮下面的提示
//   - InAppBanner：在 WhatsApp / 微信等 App 里直接打开时，页面顶部提示用浏览器打开
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, useUI } from '../ui/UI.jsx';
import { t, tb } from '../../lib/i18n.js';
import { inAppBrowser, isAndroid, isHuawei, openInBrowserUrl, pageUrl } from '../../lib/camera.js';

/** 复制当前网址（App 内置浏览器里 clipboard 可能不给用，退回老办法） */
export async function copyPageUrl() {
  const url = pageUrl();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyLinkButtons() {
  const { toast } = useUI();
  const copy = async () => {
    const ok = await copyPageUrl();
    toast(ok ? t('链接已复制，打开浏览器粘贴到地址栏', 'Link copied — paste it into your browser') : t('复制失败，请长按地址栏复制', "Couldn't copy — long-press the address bar to copy"), ok ? 'ok' : 'warn');
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className="btn-ghost px-3 py-2 text-[13px]" onClick={copy}>
        <Icon name="Copy" size={15} /> {t('复制链接', 'Copy link')}
      </button>
      {isAndroid() && inAppBrowser() && (
        <a className="btn-ghost px-3 py-2 text-[13px]" href={openInBrowserUrl()}>
          <Icon name="Link" size={15} /> {t('用浏览器打开', 'Open in browser')}
        </a>
      )}
    </div>
  );
}

/** 解决办法（按最常见的原因排） */
export function CameraHelpSteps({ onWebCamera }) {
  const huawei = isHuawei();
  const step = 'whitespace-pre-line text-[13px] leading-relaxed text-ink-soft';
  return (
    <ol className="space-y-3">
      <li className="rounded-xl bg-white p-3 ring-1 ring-line">
        <div className="text-[14px] font-bold text-ink">1. {t('用手机浏览器打开，不要在 App 里直接开', 'Open it in the phone browser, not inside an app')}</div>
        <div className={step}>
          {tb(
            '在 WhatsApp / 微信里点开的网页，常常拍不了照。点右上角「⋮」→「在浏览器中打开」；或复制链接，粘贴到「华为浏览器」（或手机自带浏览器）打开，再加到桌面。',
            'Pages opened inside WhatsApp / WeChat often cannot take photos. Tap "⋮" at the top right → "Open in browser", or copy the link and paste it into Huawei Browser (or the phone\'s own browser), then add it to the home screen.',
          )}
        </div>
        <CopyLinkButtons />
      </li>
      <li className="rounded-xl bg-white p-3 ring-1 ring-line">
        <div className="text-[14px] font-bold text-ink">2. {t('允许浏览器用相机和照片', 'Allow the browser to use the camera and photos')}</div>
        <div className={step}>
          {huawei
            ? tb(
                '华为手机：「设置」→「应用和服务」→「权限管理」→「华为浏览器」→「相机」选「允许」；「存储」（有的叫「文件和媒体」/「照片和视频」）也选「允许」。找不到就在「设置」最上面搜「权限管理」。以前点过「禁止」的，要在这里改回来；开着「超级隐私模式」的要先关掉。\n只是「拍照」没反应、「相册」能用，多半就是浏览器的相机权限被关了。',
                'Huawei phones: Settings → Apps & services → Permission manager → Huawei Browser → Camera → Allow, and set Storage (or "Files and media" / "Photos and videos") to Allow too. Can\'t find it? Search "Permission manager" at the top of Settings. If you tapped "Deny" before, change it back here; if "Super Privacy Mode" is on, turn it off first.\nIf only "Camera" does nothing while "Gallery" works, the browser\'s camera permission is almost certainly off.',
              )
            : tb(
                '手机「设置」→「应用」→ 你用的浏览器 →「权限」→「相机」和「照片 / 存储」都选「允许」。以前点过「拒绝」的，要在这里改回来。',
                'Phone Settings → Apps → your browser → Permissions → set Camera and Photos / Storage to Allow. If you tapped "Deny" before, change it back here.',
              )}
        </div>
      </li>
      <li className="rounded-xl bg-white p-3 ring-1 ring-line">
        <div className="text-[14px] font-bold text-ink">3. {t('还是不行：用「网页相机」', 'Still not working: use the web camera')}</div>
        <div className={step}>
          {tb(
            '「网页相机」在页面里直接打开摄像头拍照 / 录像，不经过手机的相机和相册，拍好就存进报告。',
            'The web camera opens the camera right inside the page to take photos / record video — it does not go through the phone\'s camera or gallery app — and saves them straight into the report.',
          )}
        </div>
        {onWebCamera && (
          <button type="button" className="btn-primary mt-2 px-3 py-2 text-[13px]" onClick={onWebCamera}>
            <Icon name="Camera" size={15} /> {t('打开网页相机', 'Open web camera')}
          </button>
        )}
      </li>
    </ol>
  );
}

export function CameraHelpSheet({ open, onClose, onWebCamera }) {
  return (
    <Sheet open={open} onClose={onClose} title={t('拍照 / 相册打不开？', 'Camera or gallery not opening?')}>
      <div className="pb-2">
        <CameraHelpSteps onWebCamera={onWebCamera} />
      </div>
    </Sheet>
  );
}

/** 点了拍照 / 相册却什么都没弹出来：按钮下面的提示 */
export function NoShowCard({ video = false, onWebCamera, onClose }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="mt-2 rounded-xl border border-terra/30 bg-terra-soft/60 p-3" role="status">
      <div className="flex items-start gap-2">
        <Icon name="CircleAlert" size={18} className="mt-0.5 shrink-0 text-terra" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink">
            {video ? t('录像没有打开？', "Video recorder didn't open?") : t('相机 / 相册没有打开？', "Camera / gallery didn't open?")}
          </div>
          <div className="whitespace-pre-line text-[12px] leading-snug text-ink-soft">
            {tb('这台手机的浏览器可能打不开系统相机。可以直接用网页相机。', "This phone's browser may not be able to open the system camera. You can use the web camera instead.")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onWebCamera && (
              <button type="button" className="btn-primary px-3 py-2 text-[13px]" onClick={onWebCamera}>
                <Icon name={video ? 'Video' : 'Camera'} size={15} /> {video ? t('网页相机录像', 'Record with web camera') : t('用网页相机拍', 'Use web camera')}
              </button>
            )}
            <button type="button" className="btn-ghost px-3 py-2 text-[13px]" onClick={() => setHelp(true)}>
              <Icon name="Info" size={15} /> {t('怎么解决', 'How to fix')}
            </button>
          </div>
        </div>
        <button type="button" className="shrink-0 rounded-full p-1 text-ink-faint" onClick={onClose} aria-label={t('关闭提示', 'Dismiss')}>
          <Icon name="X" size={16} />
        </button>
      </div>
      <CameraHelpSheet
        open={help}
        onClose={() => setHelp(false)}
        onWebCamera={
          onWebCamera &&
          (() => {
            setHelp(false);
            onWebCamera();
          })
        }
      />
    </div>
  );
}

const BANNER_KEY = 'tora.inapp-dismissed';

/** 在 App 内置浏览器里打开：顶部提示用浏览器打开（关掉后本次不再出现） */
export function InAppBanner() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !inAppBrowser()) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(BANNER_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="relative z-50 border-b border-terra/30 bg-terra-soft px-3 pb-2 pt-[calc(var(--safe-top)+8px)]" role="status">
      <div className="mx-auto flex max-w-lg items-start gap-2">
        <Icon name="TriangleAlert" size={18} className="mt-0.5 shrink-0 text-terra" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-ink">{t('你正在 App 里直接打开 TORA', "You're opening TORA inside another app")}</div>
          <div className="whitespace-pre-line text-[12px] leading-snug text-ink-soft">
            {tb(
              '这里拍照 / 选照片可能用不了，资料也可能存不住。请点右上角「⋮」→「在浏览器中打开」，或复制链接到浏览器打开。',
              'Taking or choosing photos may not work here, and your data may not be kept. Tap "⋮" at the top right → "Open in browser", or copy the link into your browser.',
            )}
          </div>
          <CopyLinkButtons />
        </div>
        <button type="button" className="shrink-0 rounded-full p-1 text-ink-faint" onClick={dismiss} aria-label={t('关闭提示', 'Dismiss')}>
          <Icon name="X" size={16} />
        </button>
      </div>
    </div>
  );
}
