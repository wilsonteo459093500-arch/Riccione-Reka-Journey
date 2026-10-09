// 设置：我的资料（自动带入报告）、存储空间、备份 / 恢复、安装到主屏幕
import { useEffect, useRef, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { TopBar, Spinner, useUI } from './ui/UI.jsx';
import { useStore } from '../lib/store.jsx';
import { storageEstimate, requestPersist } from '../lib/db.js';
import { exportBackup, importBackup } from '../lib/backup.js';
import { downloadBlob } from '../lib/share.js';
import { fmtBytes } from '../lib/images.js';
import { todayISO } from '../lib/format.js';

const ME = [
  { key: 'name', label: '我的名字', placeholder: '例：Wilson', hint: '进场通知「现场负责人」、检查人、签名人' },
  { key: 'phone', label: '我的电话', placeholder: '例：016-3881819', type: 'tel' },
  { key: 'dept', label: '部门落款', placeholder: '安装部', hint: '每日汇报最后的落款' },
  { key: 'company', label: '公司名称', placeholder: '溪岸 Sail by Riccione Reka', hint: '印在文件页脚' },
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
    const t = setTimeout(async () => {
      await store.updateSettings(mine(form));
      editing.current = false;
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    }, 600);
    return () => clearTimeout(t);
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
      const blob = await exportBackup({ includeVideos: !noVideo, onProgress: (d, t) => setProg(`${d} / ${t}`) });
      downloadBlob(blob, `TORA备份_${todayISO()}${noVideo ? '_无视频' : ''}.jsonl`);
      toast(`备份文件已下载（${fmtBytes(blob.size)}），请存到云盘`);
    } catch (e) {
      toast(`备份失败：${e.message}`, 'error');
    } finally {
      setBusy('');
      setProg('');
    }
  };

  const restore = async (file) => {
    if (!file) return;
    const ok = await confirm({
      title: '从备份恢复？',
      message: '会把备份里的项目 / 报告 / 照片合并进这台手机。\n同一份报告，本机较新的版本会保留；你在本机填的名字电话不会被覆盖。',
      okText: '恢复',
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const r = await importBackup(file, { onProgress: (d, t) => setProg(t ? `${d} / ${t}` : String(d)) });
      await store.reload();
      toast(`已恢复：${r.projects} 个项目，${r.reports} 份报告，${r.media} 个照片/视频${r.skipped ? `（${r.skipped} 份本机较新，保留本机）` : ''}`);
    } catch (e) {
      toast(e.message || '恢复失败', 'error');
    } finally {
      setBusy('');
      setProg('');
    }
  };

  return (
    <div className="pb-28">
      <TopBar title="设置" sub="资料只存在这台手机" />
      <main className="mx-auto max-w-lg space-y-4 px-3 pt-3">
        <section className="card space-y-4 p-4">
          <div className="text-[15px] font-bold text-ink">我的资料</div>
          <div className="-mt-2 text-[12px] text-ink-mute">新建报告时自动带入（已建的报告不受影响）</div>
          {ME.map((f) => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" type={f.type || 'text'} value={form[f.key] || ''} placeholder={f.placeholder} onChange={(e) => change(f.key, e.target.value)} />
              {f.hint && <div className="mt-1 text-[12px] text-ink-mute">{f.hint}</div>}
            </div>
          ))}
          <div className={`flex items-center gap-1.5 text-[12px] ${savedTick ? 'text-pass' : 'text-ink-mute'}`}>
            <Icon name="CircleCheck" size={14} /> {savedTick ? '已保存' : '改动会自动保存'}
          </div>
        </section>

        {!standalone && (
          <section className="card border-l-4 border-l-terra p-4">
            <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <Icon name="Smartphone" size={18} className="text-terra" /> 加到手机主屏幕（强烈建议）
            </div>
            <div className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              {isIOS ? (
                <>用 <b>Safari</b> 打开本网址 → 点底部「分享」按钮 → 「添加到主屏幕」。</>
              ) : (
                <>用 <b>Chrome</b> 打开 → 右上角「⋮」→「添加到主屏幕 / 安装应用」。</>
              )}
              <br />
              像 App 一样一键打开，没信号也能填写；iPhone 上还能避免浏览器 7 天不用自动清掉资料。
              {isIOS && (store.reports.length > 0 || store.projects.length > 0) && (
                <>
                  <br />
                  <b className="text-terra">注意：</b>主屏幕 App 和 Safari 的资料是分开的。已在这里填的资料，请先点下面「导出备份」，再到主屏幕 App 里「从备份恢复」。
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
                onChange={(e) => store.updateSettings({ crew: e.target.checked })}
              />
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-ink">安装师傅模式</span>
                <span className="block text-[12px] text-ink-mute">首页只显示每日汇报（用主管发的链接打开时自动开启）</span>
              </span>
            </label>
          </section>
        )}

        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <Icon name="HardDrive" size={18} className="text-pine" /> 存储与备份
          </div>
          <div className="text-[13px] leading-relaxed text-ink-soft">
            报告和照片<b>只存在这台手机的浏览器里</b>，不会上传。换手机、清理浏览器之前，请先备份。
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{store.projects.length}</div>
              <div className="text-[11px] text-ink-mute">项目</div>
            </div>
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{store.reports.length}</div>
              <div className="text-[11px] text-ink-mute">报告</div>
            </div>
            <div className="rounded-xl bg-cream-deep/70 p-2.5">
              <div className="text-[17px] font-bold text-ink">{est?.usage != null ? fmtBytes(est.usage) : '—'}</div>
              <div className="text-[11px] text-ink-mute">已用空间</div>
            </div>
          </div>
          {persisted === false && (
            <button className="w-full text-left text-[12px] text-terra underline" onClick={async () => setPersisted(await requestPersist())}>
              系统可能在空间不足时清理数据，点此申请「持久保存」
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost text-[14px]" disabled={!!busy} onClick={backup}>
              {busy === 'backup' ? <Spinner /> : <Icon name="Download" size={17} />} {busy === 'backup' && prog ? `打包中 ${prog}` : '导出备份'}
            </button>
            <button className="btn-ghost text-[14px]" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === 'restore' ? <Spinner /> : <Icon name="Upload" size={17} />} {busy === 'restore' && prog ? `恢复中 ${prog}` : '从备份恢复'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-terra" checked={noVideo} onChange={(e) => setNoVideo(e.target.checked)} />
            备份时不含视频（文件小很多；视频建议另存云盘）
          </label>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }} />
        </section>

        <section className="px-2 pb-4 text-center text-[12px] leading-relaxed text-ink-mute">
          TORA by Riccione Reka · 现场报告 v1
          <br />
          {store.settings.company || '溪岸 Sail by Riccione Reka'}
        </section>
      </main>
    </div>
  );
}
