// 首页「资料安全」（体检第 4 阶段）：
//   长期保存 已开 / 没开（没开 → 教怎么开、再申请一次）· 本机用了多少 · 刚自动清掉多少没用的图片
//   全部备份：备份到资料夹（Chrome / Edge；平时用这个）/ 打包成一个文件 / 导入备份 · 上次全部备份几时
//   几个项目改过、7 天以上没备份 → 黄色一行
//   清除本机全部资料（危险，放最后）

import React, { useState } from 'react';
import {
  ShieldCheck, ShieldAlert, HardDrive, FolderDown, PackageOpen, ArchiveRestore, Loader2, AlertTriangle, Sparkles, Trash2, RefreshCw, FolderCog,
} from 'lucide-react';
import { Modal, cls } from '../../lib/ui.jsx';
import { formatBytes, timeAgo } from '../../lib/format.js';
import { BACKUP_DUE_DAYS } from '../../lib/backupLog.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/**
 * @param {{
 *   persist:'on'|'off'|'unsupported'|null, onAskPersist:()=>Promise<void>,
 *   usage:{usage:number, quota:number}|null, cleaned:{images:number, bytes:number, boards:number}|null,
 *   log:object, dueCount:number, hasData:boolean,
 *   folderOk:boolean, folderName:string|null, backing:string|null,
 *   onBackupFolder:()=>void, onChangeFolder:()=>void, onBackupFile:()=>void, onPickRestore:()=>void, restoring:string|null,
 *   onWipe:()=>void,
 * }} props
 */
export default function DataPanel(props) {
  const { persist, usage, cleaned, log, dueCount, hasData, folderOk, folderName, backing, restoring } = props;
  const [help, setHelp] = useState(false);
  const busy = !!backing || !!restoring;
  const all = log?.all;
  const via = all?.via === 'folder' ? `资料夹「${all.folder || ''}」` : all?.via === 'downloads' ? '一个个下载' : '打包成一个文件';

  return (
    <section className={`${cls.card} px-4 sm:px-5 py-4 space-y-3`} data-testid="data-panel" aria-label="资料安全">
      {/* 第一行：长期保存 · 用量 · 自动清理 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {persist === 'on' ? (
          <span className="inline-flex items-center gap-1.5 text-bp-green" data-testid="persist-state" data-state="on">
            <ShieldCheck size={15} /> 长期保存：已开
          </span>
        ) : persist === 'off' ? (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-bp-warn" data-testid="persist-state" data-state="off">
            <ShieldAlert size={15} /> 长期保存：没开 —— 电脑空间紧张时，浏览器可能把项目整批清掉
            <button type="button" className="underline underline-offset-2 hover:text-bp-ink" onClick={() => setHelp(true)}>
              怎么开
            </button>
          </span>
        ) : persist === 'unsupported' ? (
          <span className="inline-flex items-center gap-1.5 text-bp-faint" data-testid="persist-state" data-state="unsupported">
            <ShieldAlert size={15} /> 这个浏览器看不到「长期保存」开没开 —— 请定期全部备份
          </span>
        ) : null}
        {usage && usage.usage > 0 && (
          <span className="inline-flex items-center gap-1.5 text-bp-faint" title="项目和图片都存在这台电脑的浏览器里">
            <HardDrive size={13} />
            本机已用 {formatBytes(usage.usage)}
            {usage.quota ? ` / 可用约 ${formatBytes(usage.quota)}` : ''}
          </span>
        )}
        {cleaned && (cleaned.images > 0 || cleaned.boards > 0) && (
          <span className="inline-flex items-center gap-1.5 text-bp-faint" data-testid="cleaned">
            <Sparkles size={13} />
            刚自动清掉 {cleaned.images ? `${cleaned.images} 张没用的图片` : ''}
            {cleaned.images && cleaned.boards ? '、' : ''}
            {cleaned.boards ? `${cleaned.boards} 块没用的画板` : ''}
            {cleaned.bytes ? `，腾出 ${formatBytes(cleaned.bytes)}` : ''}
          </span>
        )}
      </div>

      {/* 第二行：全部备份 */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-0">
            <div className="text-sm text-bp-ink font-medium">全部备份</div>
            <div className="text-xs text-bp-faint" data-testid="all-backup-at">
              {all?.at ? `上次：${timeAgo(all.at)} · ${via}` : '还没有做过全部备份'}
            </div>
          </div>
          {folderOk ? (
            <>
              <button type="button" onClick={props.onBackupFolder} disabled={busy} className={cls.btnPrimary} data-testid="backup-folder"
                title="每个项目一个文件，只重写改过的。可以选会自动同步的 Google Drive / OneDrive 资料夹">
                {backing?.startsWith('folder') ? <Loader2 size={15} className="animate-spin" /> : <FolderDown size={15} />}
                {backing?.startsWith('folder') ? `备份中 ${backing.slice(7)}` : folderName ? `备份到「${folderName}」` : '备份到资料夹…'}
              </button>
              {folderName && !busy && (
                <button type="button" onClick={props.onChangeFolder} className={cls.iconBtn} title="换一个资料夹" aria-label="换一个备份资料夹">
                  <FolderCog size={15} />
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={props.onBackupFolder} disabled={busy} className={cls.btnPrimary} data-testid="backup-folder"
              title="这个浏览器不能选资料夹：改过的项目一个个下载">
              {backing?.startsWith('folder') ? <Loader2 size={15} className="animate-spin" /> : <FolderDown size={15} />}
              {backing?.startsWith('folder') ? `下载中 ${backing.slice(7)}` : '全部下载（改过的）'}
            </button>
          )}
          <button type="button" onClick={props.onBackupFile} disabled={busy} className={cls.btnGhost} data-testid="backup-file" title="全部项目 + Material Board 打成一个文件（例如交还电脑前）">
            {backing?.startsWith('file') ? <Loader2 size={15} className="animate-spin" /> : <PackageOpen size={15} />}
            {backing?.startsWith('file') ? `打包中 ${backing.slice(5)}` : '打包成一个文件'}
          </button>
          <button type="button" onClick={props.onPickRestore} disabled={busy} className={cls.btnGhost} data-testid="restore-pick">
            {restoring ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
            {restoring ? `恢复中 ${restoring}` : '导入备份'}
          </button>
        </div>
      )}
      {!hasData && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto text-xs text-bp-faint">有备份档（.blueprint.zip）？从这里恢复。</div>
          <button type="button" onClick={props.onPickRestore} disabled={busy} className={cls.btnGhost} data-testid="restore-pick">
            {restoring ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}
            {restoring ? `恢复中 ${restoring}` : '导入备份'}
          </button>
        </div>
      )}

      {dueCount > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-bp-warn/10 text-bp-warn text-xs px-3 py-2" data-testid="backup-due" role="status">
          <AlertTriangle size={15} className="shrink-0 mt-px" />
          <span>
            {dueCount} 个项目改过、{BACKUP_DUE_DAYS} 天以上没备份了（下面标黄的）。按「全部备份」一次备份好，或在项目卡片上单独备份。
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={props.onWipe} disabled={busy} className="inline-flex items-center gap-1 text-[11px] text-bp-faint hover:text-bp-danger disabled:opacity-50" data-testid="wipe-open">
          <Trash2 size={12} /> 清除本机全部资料
        </button>
      </div>

      {help && <PersistHelp onAsk={props.onAskPersist} persist={persist} onClose={() => setHelp(false)} />}
    </section>
  );
}

function PersistHelp({ onAsk, persist, onClose }) {
  const [asking, setAsking] = useState(false);
  const [tried, setTried] = useState(false);
  async function ask() {
    setAsking(true);
    try {
      await onAsk();
    } finally {
      setAsking(false);
      setTried(true);
    }
  }
  return (
    <Modal title="打开「长期保存」" icon={<ShieldAlert size={18} className="text-bp-warn" />} onClose={onClose} width="max-w-md"
      footer={
        <>
          <div className="flex-1 text-xs text-bp-faint">
            {persist === 'on' ? '已经开了 ✓' : tried ? '浏览器还没答应 —— 先照上面做，过几天再按一次' : ''}
          </div>
          <button type="button" onClick={onClose} className={cls.btnGhost}>
            关闭
          </button>
          <button type="button" onClick={ask} disabled={asking || persist === 'on'} className={cls.btnPrimary} data-testid="persist-ask">
            {asking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            再申请一次
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-bp-muted leading-relaxed">
        <p>
          项目和图片存在这台电脑的浏览器里。浏览器没答应「长期保存」的话，电脑空间紧张时它可能把这个网站的资料
          <b className="font-medium text-bp-ink">整批清掉</b>，不会先问。
        </p>
        <div>
          <div className="text-xs font-medium text-bp-ink">Chrome / Edge（展厅和设计师电脑用这个）</div>
          <ol className="mt-1 list-decimal pl-5 text-xs space-y-0.5">
            <li>按 {isMac ? '⌘D' : 'Ctrl+D'}，把这个网址加进书签</li>
            <li>回到这里按「再申请一次」</li>
            <li>还是没开：照常用几天再按一次。Chrome 是看这个网站常不常用、有没有加书签自己决定的，不会弹出问题问你</li>
          </ol>
        </div>
        <div>
          <div className="text-xs font-medium text-bp-ink">Firefox</div>
          <p className="text-xs">按「再申请一次」，浏览器会问要不要让这个网站长期保存资料，选「允许」。</p>
        </div>
        <p className="text-xs rounded-xl bg-bp-tint border border-bp-line px-3 py-2">
          开了也不是万无一失：电脑坏了、清了浏览器资料、换电脑，项目一样会不见。<b className="font-medium text-bp-ink">定期「全部备份」才是最保险的</b>。
        </p>
      </div>
    </Modal>
  );
}
