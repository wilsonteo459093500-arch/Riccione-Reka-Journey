// 师傅链接：师傅打开主管发的链接 → 导入项目 → 直接打开今天的每日汇报；主管在项目页生成链接
import { useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { Spinner, useUI } from './ui/UI.jsx';
import { useStore } from '../lib/store.jsx';
import { getTemplate } from '../templates/index.js';
import { siteLabelUi } from '../lib/report.js';
import { t, tb, getUiLang } from '../lib/i18n.js';
import { navigate } from '../lib/router.js';
import { copyText, openWhatsApp } from '../lib/share.js';
import {
  CREW_FIELDS, CREW_FIELD_LABELS, CREW_TEMPLATE, crewLink, crewMessage, crewPayloadOf, hasOwnWork, mergeCrewProject, parseCrew, todayReport,
} from '../lib/crew.js';

/** 打开（或新建）这个项目今天的每日汇报 */
export async function openCrewToday(store, project, { replace = false } = {}) {
  const tpl = getTemplate(CREW_TEMPLATE);
  const { report, created } = todayReport(tpl, project, store.reports, store.settings);
  if (created) await store.saveReport(report, { touch: false });
  navigate(`/r/${report.id}`, { replace });
}

/** 导入链接里的项目；新手机（没有自己的项目 / 报告）第一次自动切换成师傅模式（之后以手动开关为准）。返回项目 */
export async function importCrew(store, data) {
  const local = store.projectById(data.project.id);
  const merged = mergeCrewProject(local, data);
  const fresh = !hasOwnWork(store.projects, store.reports);
  const project = merged ? await store.saveProject(merged) : local;
  if (fresh && !store.settings.crew && !store.settings.crewChosen) await store.updateSettings({ crew: true, crewChosen: true });
  return project;
}

export default function CrewLink({ payload }) {
  const store = useStore();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const data = parseCrew(payload);
    if (!data) {
      setError(tb('链接不完整或已损坏，请让主管重新发一次。', 'This link is incomplete or broken. Please ask your supervisor to send it again.'));
      return;
    }
    importCrew(store, data)
      .then((project) => openCrewToday(store, project, { replace: true }))
      .catch((e) => setError(e?.message || tb('打开失败，请再点一次链接', "Couldn't open it. Please tap the link again.")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto flex min-h-screen supports-[height:1dvh]:min-h-[100dvh] max-w-md flex-col items-center justify-center p-6 text-center">
      {error ? (
        <>
          <Icon name="CircleAlert" size={32} className="text-fail" />
          <div className="mt-3 text-[17px] font-bold text-ink">{t('打不开这个链接', "Can't open this link")}</div>
          <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-soft">{error}</div>
          <button className="btn-primary mt-5" onClick={() => navigate('/', { replace: true })}>
            {t('回首页', 'Back to Home')}
          </button>
        </>
      ) : (
        <>
          <Spinner size={28} className="text-terra" />
          <div className="mt-3 text-[15px] text-ink-soft">{t('正在打开今天的每日汇报…', "Opening today's daily report…")}</div>
        </>
      )}
    </div>
  );
}

/**
 * 项目页：把每日汇报链接发给安装师傅。
 * current() 同步给出含未保存修改的项目；先打开 WhatsApp / 复制，再 persist() 保存 ——
 * iPhone 只在点按当下允许弹出 / 写剪贴板，中间等存储就会失效。
 */
export function CrewShare({ project, current, persist }) {
  const store = useStore();
  const { toast } = useUI();
  const included = CREW_FIELDS.filter((k) => project[k] != null && String(project[k]).trim()).map((k) => CREW_FIELD_LABELS[k]);
  const zhList = included.map((l) => l.zh).join('、');
  const enList = included.map((l) => l.en).join(', ');

  const build = () => {
    const { p, dirty } = current?.() || { p: project, dirty: false };
    return { p, dirty, link: crewLink(p, store.settings) };
  };

  return (
    <section className="card mt-4 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-terra/10 p-2.5 text-terra">
          <Icon name="Send" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink">{t('发给安装师傅填每日汇报', 'Send installers the daily report link')}</div>
          <div className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
            {tb(
              '你不在工地时，师傅点开链接就能填这个项目的每日汇报（拍照 / 视频），填好直接发到群里。不用注册，师傅填的内容存在师傅自己手机里。',
              "When you're not on site, installers open the link to fill in this project's daily report (photos / video) and send it straight to the group. No sign-up needed; what they fill in stays on their own phone.",
            )}
          </div>
          <div className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-ink-mute">
            {tb(
              `链接里带：${zhList || '项目名称'}。不带 SO、设计师和备注。`,
              `The link includes: ${enList || 'Project name'}. Not included: SO, designer and remarks.`,
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary flex-1 py-2.5 text-[14px]"
          onClick={() => {
            const { p, dirty, link } = build();
            openWhatsApp(crewMessage(siteLabelUi(p), link));
            if (dirty) persist?.(p);
          }}
        >
          {/* 按钮只有半行宽：English 只写 WhatsApp（中英也只写「WhatsApp 发送」，WhatsApp 本身就是英文） */}
          <Icon name="MessageCircle" size={17} /> {getUiLang() === 'en' ? 'WhatsApp' : 'WhatsApp 发送'}
        </button>
        <button
          className="btn-ghost flex-1 py-2.5 text-[14px]"
          onClick={async () => {
            const { p, dirty, link } = build();
            const copied = copyText(link);
            if (dirty) persist?.(p);
            const ok = await copied;
            toast(
              ok
                ? t('链接已复制，可以粘贴到 WhatsApp 发给师傅', 'Link copied. Paste it in WhatsApp to send to the installer.')
                : t('复制失败，请改用「WhatsApp 发送」', 'Copy failed. Use the WhatsApp button instead.'),
              ok ? 'ok' : 'error',
            );
          }}
        >
          <Icon name="Link" size={17} /> {t('复制链接', 'Copy link')}
        </button>
      </div>
    </section>
  );
}

/** 新手机首页：粘贴主管发的链接（iPhone 主屏幕 App 和 Safari 资料分开，点链接导入不到主屏幕 App 时用） */
export function CrewPaste({ label }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  if (!open) {
    return (
      <button className="mx-auto mb-6 block text-[13px] font-semibold text-terra" onClick={() => setOpen(true)}>
        {label || t('安装师傅？点这里粘贴主管发的链接', 'Installer? Tap here to paste the link from your supervisor')}
      </button>
    );
  }
  const go = () => {
    if (!parseCrew(value)) return setBad(true);
    navigate(`/crew/${crewPayloadOf(value)}`);
  };
  return (
    <div className="card mb-6 p-3">
      <div className="whitespace-pre-line text-[13px] text-ink-soft">
        {tb('把主管在 WhatsApp 发的链接长按复制，粘贴到下面：', 'Long-press the link your supervisor sent on WhatsApp, copy it and paste it below:')}
      </div>
      <textarea
        className="input mt-2 resize-none text-[14px]"
        rows={3}
        value={value}
        placeholder="https://…/#/crew/…"
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
      />
      {bad && (
        <div className="mt-1 whitespace-pre-line text-[12px] text-fail">
          {tb('这不是完整的师傅链接，请重新复制一次', "That's not a complete installer link. Please copy it again.")}
        </div>
      )}
      <button className="btn-primary mt-2 w-full py-2.5 text-[14px]" disabled={!value.trim()} onClick={go}>
        {t('打开每日汇报', 'Open daily report')}
      </button>
    </div>
  );
}
