// 设置：界面语言、我的资料（自动带入报告）、文件默认语言、存储空间、备份 / 恢复、安装到主屏幕
import { useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { TopBar, Spinner, useUI } from './ui/UI.jsx';
import { useStore } from '../lib/store.jsx';
import LangPicker from './LangPicker.jsx';
import LangSwitch from './ui/LangSwitch.jsx';
import { normLang } from '../lib/lang.js';
import { t, tb, uiLabel, getUiLang } from '../lib/i18n.js';
import { storageEstimate, requestPersist } from '../lib/db.js';
import { exportBackup, importBackup } from '../lib/backup.js';
import { downloadBlob } from '../lib/share.js';
import { fmtBytes } from '../lib/images.js';
import { todayISO } from '../lib/format.js';

// 「设置」的默认值（lib/store.jsx DEFAULT_SETTINGS）：English 界面下显示成英文，存的值不变
// （文件里按文件语言换写法；一打字就存打的内容）
const DEFAULT_COMPANY = '溪岸 Sail by Riccione Reka';
const DEFAULT_EN = { '安装部': 'Installation Department', [DEFAULT_COMPANY]: 'Sail by Riccione Reka' };
const shownValue = (v) => (getUiLang() === 'en' && typeof v === 'string' && DEFAULT_EN[v] ? DEFAULT_EN[v] : v);

/** 「例：xxx」提示：中文 例：xxx；English e.g. xxx；中英 例 e.g. xxx */
const ex = (v) => (getUiLang() === 'both' ? `例 e.g. ${v}` : t(`例：${v}`, `e.g. ${v}`));

/** 带粗体等标签的段落：中文 / English 各一份，中英时上下两行 */
function Both({ zh, en }) {
  const lang = getUiLang();
  return (
    <>
      {lang !== 'en' && zh}
      {lang === 'both' && <br />}
      {lang !== 'zh' && en}
    </>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// label / hint = { zh, en }；placeholder = 渲染时取（跟界面语言）
const ME = [
  {
    key: 'name',
    label: { zh: '我的名字', en: 'My name' },
    placeholder: () => ex('Wilson'),
    hint: { zh: '进场通知「现场负责人」、检查人、签名人', en: 'Site notice "person in charge", inspector and signer' },
  },
  { key: 'phone', label: { zh: '我的电话', en: 'My phone' }, placeholder: () => ex('016-3881819'), type: 'tel' },
  {
    key: 'dept',
    label: { zh: '部门落款', en: 'Department (sign-off)' },
    placeholder: () => t('安装部', 'Installation Department'),
    hint: { zh: '每日汇报最后的落款', en: 'Signed at the end of the daily report' },
  },
  {
    key: 'company',
    label: { zh: '公司名称', en: 'Company name' },
    placeholder: () => shownValue(DEFAULT_COMPANY),
    hint: { zh: '印在文件页脚', en: 'Printed in the document footer' },
  },
];

export default function Settings() {
  const store = useStore();
  const { toast, confirm } = useUI();
  const [form, setForm] = useState(store.settings);
  const [est, setEst] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [busy, setBusy] = useState('');
  const [prog, setProg] = useState('');
  const [noVideo, setNoVideo] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const fileRef = useRef(null);
  const editing = useRef(false);
  // 只保存「我的资料」这几项：其他设置（如师傅模式）在别处改，不能被这里的旧快照盖回去
  const mine = (f) => Object.fromEntries(ME.filter((x) => x.key in f).map((x) => [x.key, f[x.key]]));

  useEffect(() => {
    if (!editing.current) setForm(store.settings);
  }, [store.settings]);

  // 我的资料：改了就自动保存（停手 0.6 秒）
  useEffect(() => {
    if (!editing.current) return undefined;
    const timer = setTimeout(async () => {
      await store.updateSettings(mine(form));
      editing.current = false;
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    }, 600);
    return () => clearTimeout(timer);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    storageEstimate().then(setEst);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, [store.reports.length]);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

  const formRef = useRef(form);
  formRef.current = form;
  // 离开设置页时还有没保存的改动 → 立刻保存
  useEffect(
    () => () => {
      if (editing.current) store.updateSettings(mine(formRef.current));
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const change = (key, v) => {
    editing.current = true;
    setForm((x) => ({ ...x, [key]: v }));
  };

  const backup = async () => {
    setBusy('backup');
    try {
      const blob = await exportBackup({ includeVideos: !noVideo, onProgress: (d, total) => setProg(`${d} / ${total}`) });
      const name =
        getUiLang() === 'en'
          ? `TORA_backup_${todayISO()}${noVideo ? '_no_video' : ''}.jsonl`
          : `TORA备份_${todayISO()}${noVideo ? '_无视频' : ''}.jsonl`;
      downloadBlob(blob, name);
      toast(t(`备份文件已下载（${fmtBytes(blob.size)}），请存到云盘`, `Backup downloaded (${fmtBytes(blob.size)}). Save it to cloud storage.`));
    } catch (e) {
      toast(t(`备份失败：${e.message}`, `Backup failed: ${e.message}`), 'error');
    } finally {
      setBusy('');
      setProg('');
    }
  };

  const restore = async (file) => {
    if (!file) return;
    const ok = await confirm({
      title: t('从备份恢复？', 'Restore from backup?'),
      message: tb(
        '会把备份里的项目 / 报告 / 照片合并进这台手机。\n同一份报告，本机较新的版本会保留；你在本机填的名字电话不会被覆盖。',
        "Projects, reports and photos in the backup will be merged into this phone.\nIf a report is on both, the newer copy on this phone is kept. The name and phone you entered here won't be overwritten.",
        '\n\n',
      ),
      okText: t('恢复', 'Restore'),
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const r = await importBackup(file, { onProgress: (d, total) => setProg(total ? `${d} / ${total}` : String(d)) });
      await store.reload();
      toast(
        t(
          `已恢复：${r.projects} 个项目，${r.reports} 份报告，${r.media} 个照片/视频${r.skipped ? `（${r.skipped} 份本机较新，保留本机）` : ''}`,
          `Restored: ${plural(r.projects, 'project', 'projects')}, ${plural(r.reports, 'report', 'reports')}, ${plural(r.media, 'photo/video', 'photos/videos')}${
            r.skipped ? ` (${r.skipped} newer on this phone, kept)` : ''
          }`,
        ),
      );
    } catch (e) {
      toast(e.message || t('恢复失败', 'Restore failed'), 'error');
    } finally {
      setBusy('');
      setProg('');
    }
  };

  return (
    <div className="pb-28">
      <TopBar title={t('设置', 'Settings')} sub={t('资料只存在这台手机', 'Data stays on this phone')} right={<div className="mr-1"><LangSwitch /></div>} />
      <main className="mx-auto max-w-lg space-y-4 px-3 pt-3">
        <LangPicker
          title={t('界面语言', 'App language')}
          hint={tb('这台手机上 App 的显示语言；右上角也能切换', 'Language of the app on this phone. You can also switch it at the top right.')}
          value={getUiLang()}
          onChange={(v) => store.updateSettings({ uiLang: v })}
        />

        <section className="card space-y-4 p-4">
          <div className="text-[15px] font-bold text-ink">{t('我的资料', 'My info')}</div>
          <div className="-mt-2 whitespace-pre-line text-[12px] text-ink-mute">
            {tb('新建报告时自动带入（已建的报告不受影响）', 'Filled into new reports automatically (existing reports stay as they are)')}
          </div>
          {ME.map((f) => {
            const { primary, secondary } = uiLabel(f.label);
            return (
              <div key={f.key}>
                <label className="label">
                  {primary}
                  {secondary && <span className="ml-1.5 text-[11px] font-normal text-ink-mute">{secondary}</span>}
                </label>
                <input
                  className="input"
                  type={f.type || 'text'}
                  value={shownValue(form[f.key]) || ''}
                  placeholder={f.placeholder()}
                  onChange={(e) => change(f.key, e.target.value)}
                />
                {f.hint && <div className="mt-1 whitespace-pre-line text-[12px] text-ink-mute">{tb(f.hint.zh, f.hint.en)}</div>}
              </div>
            );
          })}
          <div className={`flex items-center gap-1.5 text-[12px] ${savedTick ? 'text-pass' : 'text-ink-mute'}`}>
            <Icon name="CircleCheck" size={14} /> {savedTick ? t('已保存', 'Saved') : t('改动会自动保存', 'Changes are saved automatically')}
          </div>
        </section>

        <LangPicker
          title={t('文件默认语言', 'Default document language')}
          hint={tb(
            '新导出的 PDF / Word / Excel / 文案默认用这个；每份报告导出时还可以单独改',
            'Used for new PDF / Word / Excel files and messages. You can still change it per report when exporting.',
          )}
          value={normLang(store.settings.docLang)}
          onChange={(v) => store.updateSettings({ docLang: v })}
        />

        {!standalone && (
          <section className="card border-l-4 border-l-terra p-4">
            <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <Icon name="Smartphone" size={18} className="shrink-0 text-terra" /> {t('加到手机主屏幕（强烈建议）', 'Add to home screen (highly recommended)')}
            </div>
            <div className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">
              {isIOS ? (
                <Both
                  zh={<>用 <b>Safari</b> 打开本网址 → 点底部「分享」按钮 → 「添加到主屏幕」。</>}
                  en={<>Open this page in <b>Safari</b> → tap the Share button at the bottom → “Add to Home Screen”.</>}
                />
              ) : (
                <Both
                  zh={<>用 <b>Chrome</b> 打开 → 右上角「⋮」→「添加到主屏幕 / 安装应用」。</>}
                  en={<>Open in <b>Chrome</b> → “⋮” at the top right → “Add to Home screen / Install app”.</>}
                />
              )}
              <br />
              {tb(
                '像 App 一样一键打开，没信号也能填写；iPhone 上还能避免浏览器 7 天不用自动清掉资料。',
                'Opens in one tap like an app and works without signal. On iPhone it also stops Safari from clearing your data after 7 days without use.',
              )}
              {isIOS && (store.reports.length > 0 || store.projects.length > 0) && (
                <>
                  <br />
                  <Both
                    zh={
                      <>
                        <b className="text-terra">注意：</b>主屏幕 App 和 Safari 的资料是分开的。已在这里填的资料，请先点下面「导出备份」，再到主屏幕 App 里「从备份恢复」。
                      </>
                    }
                    en={
                      <>
                        <b className="text-terra">Note:</b> the home-screen app and Safari keep separate data. For data already entered here, tap “Export backup” below first, then “Restore backup” in the home-screen app.
                      </>
                    }
                  />
                </>
              )}
            </div>
          </section>
        )}

        {(store.settings.crew || store.projects.some((p) => p.shared)) && (
          <section className="card p-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 accent-terra"
                checked={!!store.settings.crew}
                onChange={(e) => store.updateSettings({ crew: e.target.checked, crewChosen: true })}
              />
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-ink">{t('安装师傅模式', 'Installer mode')}</span>
                <span className="block whitespace-pre-line text-[12px] text-ink-mute">
                  {tb(
                    '首页只显示每日汇报（新手机第一次用主管发的链接打开时自动开启）',
                    "Home shows only the daily report (turns on automatically when a new phone first opens a supervisor's link)",
                  )}
                </span>
              </span>
            </label>
          </section>
        )}

        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Icon name="HardDrive" size={18} className="text-pine" /> {t('存储与备份', 'Storage & backup')}
          </div>
          <div className="text-[13px] leading-relaxed text-ink-soft">
            <Both
              zh={
                <>
                  报告和照片<b>只存在这台手机的浏览器里</b>，不会上传。换手机、清理浏览器之前，请先备份。
                </>
              }
              en={
                <>
                  Reports and photos are <b>stored only in this phone’s browser</b> and never uploaded. Back up before changing phones or clearing the browser.
                </>
              }
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{store.projects.length}</div>
              <div className="text-[11px] text-ink-mute">{t('项目', 'Projects')}</div>
            </div>
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{store.reports.length}</div>
              <div className="text-[11px] text-ink-mute">{t('报告', 'Reports')}</div>
            </div>
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{est?.usage != null ? fmtBytes(est.usage) : '—'}</div>
              <div className="text-[11px] text-ink-mute">{t('已用空间', 'Used')}</div>
            </div>
          </div>
          {persisted === false && (
            <button className="w-full whitespace-pre-line text-left text-[12px] text-terra underline" onClick={async () => setPersisted(await requestPersist())}>
              {tb(
                '系统可能在空间不足时清理数据，点此申请「持久保存」',
                'The system may clear data when storage runs low. Tap to request persistent storage.',
              )}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost text-[14px]" disabled={!!busy} onClick={backup}>
              {busy === 'backup' ? <Spinner /> : <Icon name="Download" size={17} />}{' '}
              <span className="whitespace-pre-line">{busy === 'backup' && prog ? t(`打包中 ${prog}`, `Packing ${prog}`) : tb('导出备份', 'Export backup')}</span>
            </button>
            <button className="btn-ghost text-[14px]" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === 'restore' ? <Spinner /> : <Icon name="Upload" size={17} />}{' '}
              <span className="whitespace-pre-line">{busy === 'restore' && prog ? t(`恢复中 ${prog}`, `Restoring ${prog}`) : tb('从备份恢复', 'Restore backup')}</span>
            </button>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-terra" checked={noVideo} onChange={(e) => setNoVideo(e.target.checked)} />
            <span className="whitespace-pre-line">
              {tb('备份时不含视频（文件小很多；视频建议另存云盘）', 'Leave videos out of the backup (much smaller file; save videos to cloud storage separately)')}
            </span>
          </label>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }} />
        </section>

        <section className="px-2 pb-4 text-center text-[12px] leading-relaxed text-ink-mute">
          TORA by Riccione Reka · {t('现场报告', 'Site reports')} v1
          <br />
          {shownValue(store.settings.company || DEFAULT_COMPANY)}
        </section>
      </main>
    </div>
  );
}
