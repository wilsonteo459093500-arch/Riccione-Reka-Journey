// 恢复备份时要设计师决定的那一下（体检第 4 阶段）：
//   项目备份、这台电脑上已经有同一个项目 → 「更新原项目」或「另存一份」（以前每次都多出一份同名的）
//   全部备份的大文件 → 这台电脑上已经有的几个项目：用备份更新 / 另存一份 / 跳过
// 这台电脑上没有的项目不用问，直接恢复（照原来的项目 id，下次再恢复才认得出是同一个）。

import React, { useMemo, useState } from 'react';
import { ArchiveRestore, AlertTriangle, Loader2 } from 'lucide-react';
import { Modal, cls } from '../../lib/ui.jsx';
import { timeAgo, formatDay } from '../../lib/format.js';
import { restoreProjectBackup, restoreAllBackup } from '../../lib/backupAll.js';

const when = (ts) => (ts ? `${formatDay(ts)}（${timeAgo(ts)}）` : '不知道');

/**
 * @param {{ opened:object, projects:object[], notify, onDone:(r:{ openId?:string })=>void, onClose:()=>void }} props
 *   opened = openBackupFile 的结果（kind 'project' 且这台电脑上有同一个项目，或 kind 'all'）
 */
export default function RestoreDialog({ opened, projects, notify, onDone, onClose }) {
  const [busy, setBusy] = useState(null); // null | 进度文字
  const [error, setError] = useState('');
  const names = useMemo(() => (projects || []).map((p) => p.name), [projects]);
  const localIds = useMemo(() => new Set((projects || []).map((p) => p.id)), [projects]);

  if (opened.kind === 'all') {
    return <RestoreAll opened={opened} projects={projects} names={names} localIds={localIds} notify={notify} onDone={onDone} onClose={onClose} />;
  }

  const local = (projects || []).find((p) => p.id === opened.project.id);
  const backupAt = opened.exportedAt;
  const localNewer = local && backupAt && (local.updatedAt || 0) > backupAt;

  async function go(mode) {
    setBusy('准备中…');
    setError('');
    try {
      const r = await restoreProjectBackup(opened, mode, {
        existingNames: names,
        onProgress: (_s, done, total) => setBusy(`${done} / ${total}`),
      });
      notify({ type: 'ok', text: mode === 'update' ? `已用备份更新「${r.project.name || '未命名方案'}」` : `已另存为「${r.project.name}」` });
      if (r.missing) notify({ type: 'warn', text: `备份里少了 ${r.missing} 张图片，对应位置会显示灰块。` });
      onDone({ openId: r.project.id });
    } catch (e) {
      setError(e?.message || '恢复失败');
      setBusy(null);
    }
  }

  return (
    <Modal title="这个项目这台电脑上已经有了" icon={<ArchiveRestore size={18} className="text-bp-gold" />} onClose={onClose} busy={!!busy} width="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={!!busy} className={cls.btnGhost}>
            取消
          </button>
          <div className="flex-1" />
          <button type="button" onClick={() => go('copy')} disabled={!!busy} className={cls.btnGhost} data-testid="restore-copy">
            另存一份
          </button>
          <button type="button" onClick={() => go('update')} disabled={!!busy} className={cls.btnPrimary} data-testid="restore-update" autoFocus>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? `恢复中 ${busy}` : '更新原项目'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-bp-muted leading-relaxed">
        <p>
          备份里的「<span className="text-bp-ink">{opened.project.name || '未命名方案'}</span>」就是这台电脑上的「
          <span className="text-bp-ink">{local?.name || '未命名方案'}</span>」。
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs rounded-xl bg-bp-tint border border-bp-line px-3 py-2.5">
          <dt className="text-bp-faint">备份是</dt>
          <dd className="text-bp-ink">{when(backupAt)}</dd>
          <dt className="text-bp-faint">这台电脑上最后改</dt>
          <dd className="text-bp-ink">{when(local?.updatedAt)}</dd>
        </dl>
        <ul className="text-xs space-y-1">
          <li>
            <b className="font-medium text-bp-ink">更新原项目</b>：这台电脑上的换成备份里的样子，不会多出一份
          </li>
          <li>
            <b className="font-medium text-bp-ink">另存一份</b>：两份都留着，备份那份名字后面加「副本」
          </li>
        </ul>
        {localNewer && (
          <div className="flex items-start gap-2 rounded-xl bg-bp-warn/10 text-bp-warn text-xs p-2.5" role="alert">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>这台电脑上的比备份新：选「更新原项目」，{formatDay(backupAt)} 之后在这里改的会被盖掉。拿不准就选「另存一份」。</span>
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-bp-danger/10 text-bp-danger text-xs p-2.5" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RestoreAll({ opened, projects, names, localIds, notify, onDone, onClose }) {
  const here = opened.projects.filter((e) => e.id && localIds.has(e.id));
  const fresh = opened.projects.length - here.length;
  const newerHere = here.filter((e) => {
    const p = projects.find((x) => x.id === e.id);
    return p && (p.updatedAt || 0) > (e.updatedAt || 0);
  }).length;
  const [conflict, setConflict] = useState('skip');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function go() {
    setBusy('准备中…');
    setError('');
    try {
      const r = await restoreAllBackup(opened, {
        conflict,
        localIds,
        existingNames: names,
        onProgress: (i, n, name) => setBusy(`${Math.min(i + 1, n)} / ${n} · ${name}`),
      });
      const parts = [
        r.added && `加了 ${r.added} 个项目`,
        r.updated && `更新了 ${r.updated} 个`,
        r.copied && `另存了 ${r.copied} 份`,
        r.skipped && `跳过 ${r.skipped} 个这里已经有的`,
        r.boards && (r.boards.boards || r.boards.library) && `Material Board 画板 ${r.boards.boards} 块、材质 ${r.boards.library} 个`,
      ].filter(Boolean);
      notify({ type: 'ok', text: `全部备份恢复好了：${parts.join('，') || '没有要加的'}` });
      if (r.missing) notify({ type: 'warn', text: `备份里少了 ${r.missing} 张图片，对应位置会显示灰块。` });
      if (r.failed.length) notify({ type: 'error', text: `这几个没能恢复：${r.failed.join('、')}` });
      onDone({});
    } catch (e) {
      setError(e?.message || '恢复失败');
      setBusy(null);
    }
  }

  const opt = (v, label, hint) => (
    <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 cursor-pointer ${conflict === v ? 'border-bp-gold bg-bp-gold/10' : 'border-bp-line hover:bg-bp-tint'}`}>
      <input type="radio" name="restore-conflict" value={v} checked={conflict === v} onChange={() => setConflict(v)} disabled={!!busy} className="mt-1 accent-bp-gold" />
      <span>
        <span className="block text-sm text-bp-ink">{label}</span>
        <span className="block text-xs text-bp-faint">{hint}</span>
      </span>
    </label>
  );

  return (
    <Modal title="恢复全部备份" icon={<ArchiveRestore size={18} className="text-bp-gold" />} onClose={onClose} busy={!!busy} width="max-w-md"
      footer={
        <>
          <div className="flex-1 min-w-0 truncate text-xs text-bp-faint">{busy || ''}</div>
          <button type="button" onClick={onClose} disabled={!!busy} className={cls.btnGhost}>
            取消
          </button>
          <button type="button" onClick={go} disabled={!!busy} className={cls.btnPrimary} data-testid="restore-all-go" autoFocus>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? '恢复中' : '开始恢复'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-bp-muted leading-relaxed">
        <p>
          这个文件是 {formatDay(opened.exportedAt) || '某一天'} 的全部备份：{opened.projects.length} 个项目
          {opened.boards ? '，还有 Material Board 画板和材质库（合并进来，不会盖掉这里比较新的）' : ''}。
        </p>
        <p className="text-xs">
          这台电脑上没有的 {fresh} 个会直接加进来。
          {here.length ? (
            <>
              另外 <b className="font-medium text-bp-ink">{here.length} 个这台电脑上已经有了</b>
              {newerHere ? `（其中 ${newerHere} 个这里的比备份新）` : ''}：
            </>
          ) : null}
        </p>
        {here.length > 0 && (
          <div className="space-y-2">
            {opt('skip', '跳过，留着这里的', '最保险')}
            {opt('update', '用备份更新', newerHere ? `这里比备份新的 ${newerHere} 个，备份之后改的会被盖掉` : '换成备份里的样子，不会多出一份')}
            {opt('copy', '另存一份', '两份都留着，备份那份名字后面加「副本」')}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-bp-danger/10 text-bp-danger text-xs p-2.5" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
