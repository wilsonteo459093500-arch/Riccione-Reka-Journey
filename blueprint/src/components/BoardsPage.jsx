// 独立 Material Board（#/boards）—— 不属于任何提案，和旧版 UKIR STUDIO 的 Material Board 用法一样：
// 材质库、拖拽排版、标题与图例、AI 抠图 / 实拍排版，下载高清 PNG（发 WhatsApp / 社媒 / 打印）。
// 旧版 UKIR STUDIO 的画板和材质库（同一网址时）会自动搬到这里（moodboard/migrate.js）。
// 体检第 4 阶段：这里的画板 + 「我的材质库」可以单独下载备份（首页的「全部备份」也会带上）。

import React, { useEffect, useState } from 'react';
import { LoaderCircle, Archive } from 'lucide-react';
import { downloadBoardsBackup } from '../lib/backupAll.js';
import { readBackupLog, onBackupLogChanged } from '../lib/backupLog.js';
import { formatBytes, timeAgo } from '../lib/format.js';
import { migrateOnce } from '../moodboard/migrate.js';
import Header from './Header.jsx';
import MoodBoard from '../moodboard/MoodBoard.jsx';
import { STANDALONE_ID } from '../moodboard/constants.js';
import { cls } from '../lib/ui.jsx';

const STANDALONE_PROJECT = { id: STANDALONE_ID, info: {}, materials: [] };

export default function BoardsPage({ settings, notify, onOpenSettings, onBack, onOpenProject }) {
  // 第一次打开时旧版 UKIR 的画板 / 材质库还在搬：搬完再显示，免得先建出一块空画板
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    migrateOnce().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // 画板和材质库的备份
  const [lastBackup, setLastBackup] = useState(() => readBackupLog().boards?.at || 0);
  useEffect(() => onBackupLogChanged(() => setLastBackup(readBackupLog().boards?.at || 0)), []);
  const [backing, setBacking] = useState(false);
  async function backup() {
    if (backing) return;
    setBacking(true);
    try {
      const r = await downloadBoardsBackup();
      if (!r) notify({ type: 'warn', text: '还没有画板，也没有材质，没有要备份的。' });
      else notify({ type: 'ok', text: `画板和材质库的备份已下载：${r.boards} 块画板、${r.library} 个材质（${formatBytes(r.size)}）。换电脑时在首页「导入备份」恢复。` });
    } catch (e) {
      notify({ type: 'error', text: `备份失败：${e?.message || e}` });
    } finally {
      setBacking(false);
    }
  }

  // 拖到画板外的文件：别让浏览器直接打开图片把页面换掉（画板自己的拖放不受影响）
  useEffect(() => {
    const stop = (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-bp-paper">
      <Header onOpenSettings={onOpenSettings} hasKey={!!settings?.apiKey} onBack={onBack} title="Material Board" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-16">
        <div className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={cls.eyebrow}>Material Board · 材质排版</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-bp-faint">{lastBackup ? `上次备份 ${timeAgo(lastBackup)}` : '画板和材质库还没备份过'}</span>
              <button type="button" onClick={backup} disabled={backing} className={cls.btnGhost} data-testid="boards-backup" title="这里的画板 + 我的材质库打成一个 .blueprint.zip">
                {backing ? <LoaderCircle size={15} className="animate-spin" /> : <Archive size={15} />}
                {backing ? '备份中…' : '下载画板和材质库的备份'}
              </button>
            </div>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-bp-muted leading-relaxed">
            不做提案也能用：从材质库或电脑里加图，拖拽排版，AI 抠图 / 实拍排版，下载高清 PNG 发客户。
            做提案时，方案封面在项目里的「Material Board 封面」分页制作。
          </p>
        </div>
        {ready ? (
          <MoodBoard project={STANDALONE_PROJECT} settings={settings} notify={notify} onOpenSettings={onOpenSettings} onOpenProject={onOpenProject} standalone />
        ) : (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-bp-faint">
            <LoaderCircle size={16} className="animate-spin" /> 正在打开画板…
          </div>
        )}
      </main>
    </div>
  );
}
