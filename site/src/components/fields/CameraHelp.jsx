// 拍照 / 相册打不开时的帮助：
//   - CameraHelpSteps：解决办法（App 里打开的先用浏览器打开 / 允许相机和存储权限 / 用网页相机）
//   - CameraHelpSheet：上面内容的弹层（设置页、提示卡片里打开）
//   - NoShowCard：点了拍照 / 相册却什么都没弹出时，出现在按钮下面的提示
//   - InAppBanner：在 WhatsApp / 微信等 App 里直接打开时，页面顶部提示用浏览器打开
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { Sheet, useUI } from '../ui/UI.jsx';
import { t, tb } from '../../lib/i18n.js';
import { canOpenIntent, inAppBrowser, isHuawei, openInBrowserUrl, pageUrl, setWebCamAlways, webCamAlways, canWebCamera } from '../../lib/camera.js';

/** 复制网址（App 内置浏览器里 clipboard 可能不给用，退回老办法） */
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

/** 怎么给浏览器开相机 / 存储权限（华为按各版本 EMUI / 鸿蒙都有的路径写） */
export function permissionText() {
  return isHuawei()
    ? tb(
        '「设置」→「应用」（鸿蒙叫「应用和服务」）→「应用管理」→「浏览器」（也叫「华为浏览器」）→「权限」→「相机」选「允许」；「存储」（有的叫「文件和媒体」/「照片和视频」）也选「允许」。也可以：「设置」→「隐私」→「权限管理」→「相机」→ 打开「浏览器」。找不到就在「设置」最上面搜「权限」。以前点过「禁止」的要在这里改回来；开着「超级隐私模式」要先关掉。',
        'Settings → Apps (on HarmonyOS: Apps & services) → Apps / App management → Browser (Huawei Browser) → Permissions → Camera → Allow, and set Storage (or "Files and media" / "Photos and videos") to Allow. Or: Settings → Privacy → Permission manager → Camera → turn on Browser. Can\'t find it? Search "Permissions" at the top of Settings. If you tapped "Deny" before, change it back here; if "Super Privacy Mode" is on, turn it off first.',
      )
    : tb(
        '手机「设置」→「应用」→ 你用的浏览器 →「权限」→「相机」和「照片 / 存储」都选「允许」。以前点过「拒绝」的，要在这里改回来。',
        'Phone Settings → Apps → your browser → Permissions → set Camera and Photos / Storage to Allow. If you tapped "Deny" before, change it back here.',
      );
}

export function CopyLinkButtons() {
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
      {canOpenIntent() && (
        <a className="btn-ghost px-3 py-2 text-[13px]" href={openInBrowserUrl()}>
          <Icon name="Link" size={15} /> {t('用浏览器打开', 'Open in browser')}
        </a>
      )}
    </div>
  );
}

/** 解决办法（按这台手机最可能的原因排，编号按实际显示的步骤） */
export function CameraHelpSteps({ onWebCamera, inWebCam = false }) {
  const [always, setAlways] = useState(webCamAlways);
  const step = 'whitespace-pre-line text-[13px] leading-relaxed text-ink-soft';
  const steps = [];
  if (inAppBrowser()) {
    steps.push({
      key: 'browser',
      title: t('用手机浏览器打开，不要在 App 里直接开', 'Open it in the phone browser, not inside an app'),
      body: tb(
        '在 WhatsApp / 微信里点开的网页，常常拍不了照。点右上角「⋮」→「在浏览器中打开」；或复制链接，粘贴到「华为浏览器」（或手机自带浏览器）打开，再加到桌面。',
        'Pages opened inside WhatsApp / WeChat often cannot take photos. Tap "⋮" at the top right → "Open in browser", or copy the link and paste it into Huawei Browser (or the phone\'s own browser), then add it to the home screen.',
      ),
      extra: <CopyLinkButtons />,
    });
  }
  steps.push({
    key: 'perm',
    title: t('允许浏览器用相机和照片', 'Allow the browser to use the camera and photos'),
    body: `${permissionText()}\n${tb(
      '只是「拍照」没反应、「相册」能用，多半就是浏览器的相机权限被关了。',
      'If only "Camera" does nothing while "Gallery" works, the browser\'s camera permission is almost certainly off.',
    )}`,
  });
  if (!inWebCam && canWebCamera()) {
    steps.push({
      key: 'webcam',
      title: t('还是不行：用「网页相机」', 'Still not working: use the web camera'),
      body: tb(
        '「网页相机」在页面里直接打开摄像头拍照 / 录像，不经过手机的相机和相册，拍好就存进报告。',
        'The web camera opens the camera right inside the page to take photos / record video — it does not go through the phone\'s camera or gallery app — and saves them straight into the report.',
      ),
      extra: onWebCamera ? (
        <button type="button" className="btn-primary mt-2 px-3 py-2 text-[13px]" onClick={onWebCamera}>
          <Icon name="Camera" size={15} /> {t('打开网页相机', 'Open web camera')}
        </button>
      ) : (
        <label className="mt-2 flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 accent-terra"
            checked={always}
            onChange={(e) => {
              setWebCamAlways(e.target.checked);
              setAlways(e.target.checked);
            }}
          />
          {t('照片区总是显示「网页相机」按钮', 'Always show the "Web camera" button next to photos')}
        </label>
      ),
    });
  }
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.key} className="rounded-xl bg-white p-3 ring-1 ring-line">
          <div className="text-[14px] font-bold text-ink">
            {i + 1}. {s.title}
          </div>
          <div className={step}>{s.body}</div>
          {s.extra}
        </li>
      ))}
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
            {onWebCamera
              ? tb('这台手机的浏览器可能打不开系统相机。可以直接用网页相机。', "This phone's browser may not be able to open the system camera. You can use the web camera instead.")
              : tb('这台手机的浏览器可能打不开系统相机。看看怎么解决。', "This phone's browser may not be able to open the system camera. See how to fix it.")}
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
            // 先关帮助弹层、等它的返回记录退掉，再开网页相机（不然多一条历史，按返回键没反应）
            setHelp(false);
            setTimeout(onWebCamera, 350);
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
