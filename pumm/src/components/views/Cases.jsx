import React, { useState, useMemo } from 'react';
import {
  FileText, Search, Printer, Archive, Megaphone, Lightbulb, MessageCircleQuestion, Lock,
  Download, Share2,
} from 'lucide-react';
import {
  memberById, memberName, fmtDate, caseToText, caseToStoryText, download, shareCaseImage,
} from '../../utils.js';
import {
  Card, Button, Badge, EmptyState, SectionTitle, Hint, Modal, CopyButton, Notice, inputCls,
} from '../Shared.jsx';

export default function CasesView({ snapshot, onSaveCase, canEdit }) {
  const { members, sessions, cases } = snapshot;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = cases.slice().sort((a, b) => {
      const da = sessions.find(s => s.id === a.sessionId)?.date || '';
      const db = sessions.find(s => s.id === b.sessionId)?.date || '';
      return db.localeCompare(da);
    });
    if (!needle) return list;
    return list.filter(c => {
      const presenter = memberById(members, c.presenterId);
      const haystack = [
        c.problemStatement, presenter?.name, presenter?.company, presenter?.industry,
        ...(c.advices || []).map(a => a.text),
        ...(c.questions || []).map(x => x.text),
        c.commitmentText,
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [cases, sessions, members, q]);

  return (
    <div className="space-y-5">
      <SectionTitle>案例资产 · E 留证</SectionTitle>

      <Notice tone="warn" icon={Lock}>
        这一页的内容受保密协议约束。会员看不到别人的案例，理事会只看得到案例「数量」。
        导出成招募素材时请用匿名版 —— 那一版会抽掉公司名与人名。
      </Notice>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-pumm-faint absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            className={`${inputCls} pl-8`}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜案例：问题、行业、建议内容…"
          />
        </div>
        <span className="text-xs text-pumm-faint whitespace-nowrap">{rows.length} 个</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title={q ? '没搜到' : '还没有案例'}
            hint={q ? '换个词试试。' : '案例是在会议运行里边开会边产生的：一句话问题 + 只提问 + 一人一条建议 + 一个承诺 = 一页 Case Record。'}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map(c => {
            const presenter = memberById(members, c.presenterId);
            const sess = sessions.find(s => s.id === c.sessionId);
            return (
              <button
                key={c.id} type="button" onClick={() => setOpen(c)}
                className="w-full text-left bg-white border border-pumm-line rounded-lg p-3.5 hover:border-pumm-brand transition-colors"
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-pumm-ink">
                    {presenter?.name || '（已移除会员）'}
                  </span>
                  <span className="text-xs text-pumm-brass">{presenter?.industry}</span>
                  <span className="text-xs text-pumm-faint ml-auto">{fmtDate(sess?.date)}</span>
                </div>
                <div className="text-sm text-pumm-ink mt-1.5 leading-snug line-clamp-2">
                  {c.problemStatement || <span className="text-pumm-faint">（问题还没写）</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Badge color="#23303D"><MessageCircleQuestion className="w-3 h-3" />{(c.questions || []).length} 问</Badge>
                  <Badge color="#B08D4F"><Lightbulb className="w-3 h-3" />{(c.advices || []).length} 条建议</Badge>
                  {c.commitmentText && <Badge color="#3F7D5C">已锁诺</Badge>}
                  {c.archivedAt && <Badge color="#7C8087"><Archive className="w-3 h-3" />已归档</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <CaseRecordModal
          kase={cases.find(c => c.id === open.id) || open}
          members={members}
          session={sessions.find(s => s.id === open.sessionId)}
          canEdit={canEdit}
          onSaveCase={onSaveCase}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 1 页 Case Record —— 看、印、导出、变招募素材
// ---------------------------------------------------------------------
function CaseRecordModal({ kase, members, session, canEdit, onSaveCase, onClose }) {
  const presenter = memberById(members, kase.presenterId);
  const [tab, setTab] = useState('record');

  const recordText = caseToText(kase, { members, session });
  const storyText = caseToStoryText(kase, { members, session });
  const baseName = `pumm-case-${session?.date || ''}-${presenter?.name || ''}`;

  // 打印/存 PDF：把当前文字版临时挂到 body 下，只印它
  const printRecord = () => {
    const sheet = document.createElement('pre');
    sheet.className = 'case-print-sheet';
    sheet.style.whiteSpace = 'pre-wrap';
    sheet.textContent = tab === 'record' ? recordText : storyText;
    document.body.appendChild(sheet);
    document.body.classList.add('printing-case');
    const cleanup = () => {
      document.body.classList.remove('printing-case');
      sheet.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Safari 不一定触发 afterprint，兜底清一次
    setTimeout(cleanup, 2000);
  };

  const archive = () => onSaveCase({
    ...kase,
    archivedAt: kase.archivedAt ? null : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return (
    <Modal
      wide
      title="Case Record · 1 页"
      subtitle={`${presenter?.name || '—'}　·　${fmtDate(session?.date)}`}
      onClose={onClose}
      footer={<>
        <CopyButton size="md" text={tab === 'record' ? recordText : storyText} label="复制文字" />
        <Button icon={Share2} onClick={() => shareCaseImage(kase, { members, session }, `${baseName}.png`)}>
          分享图片
        </Button>
        <Button icon={Printer} onClick={printRecord}>打印 / PDF</Button>
        <Button
          icon={Download}
          onClick={() => download(`${baseName}.txt`, tab === 'record' ? recordText : storyText)}
        >
          txt
        </Button>
        {canEdit && (
          <Button tone={kase.archivedAt ? 'ghost' : 'primary'} icon={Archive} onClick={archive}>
            {kase.archivedAt ? '取消归档' : '归档'}
          </Button>
        )}
      </>}
    >
      <div className="flex gap-1 mb-4">
        <TabBtn on={tab === 'record'} onClick={() => setTab('record')} icon={FileText}>会内记录</TabBtn>
        <TabBtn on={tab === 'story'} onClick={() => setTab('story')} icon={Megaphone}>招募素材（匿名）</TabBtn>
      </div>

      {tab === 'record' ? (
        <div className="print-page space-y-4">
          <div>
            <Label>案主</Label>
            <div className="text-sm text-pumm-ink">
              {presenter ? `${presenter.name}（${presenter.company}）· ${presenter.industry}` : '—'}
            </div>
          </div>

          <div>
            <Label>问题 · 一句话</Label>
            <div className="text-base text-pumm-ink leading-relaxed font-display">
              {kase.problemStatement || '—'}
            </div>
          </div>

          <div>
            <Label>只提问（{(kase.questions || []).length}）</Label>
            <ol className="space-y-1.5">
              {(kase.questions || []).map((q, i) => (
                <li key={q.id} className="text-sm text-pumm-ink leading-snug">
                  <span className="text-pumm-faint font-mono mr-1.5">{i + 1}</span>
                  {q.text}
                  <span className="text-pumm-brass text-xs ml-1.5">—— {memberName(members, q.askerId)}</span>
                </li>
              ))}
              {(kase.questions || []).length === 0 && <li className="text-sm text-pumm-faint">—</li>}
            </ol>
          </div>

          <div>
            <Label>同桌老板给的建议（{(kase.advices || []).length}）</Label>
            <ol className="space-y-1.5">
              {(kase.advices || []).map((a, i) => (
                <li key={a.id} className="text-sm text-pumm-ink leading-snug">
                  <span className="text-pumm-faint font-mono mr-1.5">{i + 1}</span>
                  {a.text}
                  <span className="text-pumm-brass text-xs ml-1.5">—— {memberName(members, a.advisorId)}</span>
                </li>
              ))}
              {(kase.advices || []).length === 0 && <li className="text-sm text-pumm-faint">—</li>}
            </ol>
            <Hint>每一条都挂着建议人 —— 这一栏就是「老板帮老板，不是顾问给答案」的证据。</Hint>
          </div>

          <div>
            <Label>锁诺 · 30 天 1 件事</Label>
            <div className="text-sm text-pumm-ink">{kase.commitmentText || '—'}</div>
            {kase.commitmentDue && (
              <div className="text-xs text-pumm-faint mt-0.5">到期 {fmtDate(kase.commitmentDue)}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Notice tone="info">
            这一版抽掉了公司名与人名，只留行业 —— 三场攒一个故事，故事回流招募。
            发出去之前还是请案主本人过目一次。
          </Notice>
          <pre className="whitespace-pre-wrap text-sm text-pumm-ink leading-relaxed font-sans bg-pumm-tint border border-pumm-line rounded-md p-3.5">
{storyText}
          </pre>
        </div>
      )}
    </Modal>
  );
}

function Label({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-1">{children}</div>
  );
}

function TabBtn({ on, onClick, icon: Icon, children }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
        on ? 'bg-pumm-brand text-white border-pumm-brand' : 'bg-white text-pumm-muted border-pumm-line'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />{children}
    </button>
  );
}
