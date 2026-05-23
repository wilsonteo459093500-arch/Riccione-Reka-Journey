import { useEffect, useState } from 'react';
import {
  ArrowLeft, Share2, MapPin, ChevronDown, CheckCircle2, Paperclip,
  BookOpen, FileText, Plus, Trash2,
} from 'lucide-react';
import { T } from '../../theme.js';
import { STAGES, OWNERS } from '../../constants/stages.js';
import { FORMS } from '../../constants/forms.js';
import {
  stageProgress, currentStage, isComplete, overallProgress,
  daysUntil, fmt, formCompletion, avatarFor, dateInputValue,
} from '../../utils/helpers.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useConfirm } from '../ui/UIProvider.jsx';
import GateRow from './GateRow.jsx';
import RiskForm from '../risks/RiskForm.jsx';
import RiskRow from '../risks/RiskRow.jsx';
import DailyReportsBlock from '../daily/DailyReportsBlock.jsx';
import DefectsBlock from '../defects/DefectsBlock.jsx';

export default function ProjectDetail({
  project, onBack, onToggleGate, onUpdate, onDelete, onUpdateNote,
  onAddRisk, onRemoveRisk, onAddAttachment, onRemoveAttachment,
  fetchAttachment, onClientView, onOpenForm,
  onSaveDailyReport, onDeleteDailyReport,
  onSaveDefect, onDeleteDefect,
}) {
  const [expandedStage, setExpandedStage] = useState(currentStage(project).code);
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [meta, setMeta] = useState({
    name: project.name, client: project.client, address: project.address,
    propertyType: project.propertyType, area: project.area, moveIn: project.moveIn,
  });
  const [assigned, setAssigned] = useState(project.assigned || { SD: '', SS: '', WH: '', PU: '' });
  const confirm = useConfirm();

  useEffect(() => {
    setMeta({
      name: project.name, client: project.client, address: project.address,
      propertyType: project.propertyType, area: project.area, moveIn: project.moveIn,
    });
    setAssigned(project.assigned || { SD: '', SS: '', WH: '', PU: '' });
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const overall = overallProgress(project);
  const daysToMove = daysUntil(project.moveIn);
  const cur = currentStage(project);

  const saveMeta = () => {
    onUpdate({ ...meta, assigned });
    setEditingMeta(false);
  };

  const handleDelete = async () => {
    if (await confirm({ title: '删除项目', message: '确定删除此项目? 附件也会一并删除，且无法恢复。', danger: true, confirmText: '删除' })) {
      onDelete();
    }
  };

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm hover:opacity-100 opacity-70" style={{ color: T.inkSoft }}>
          <ArrowLeft size={14} strokeWidth={1.5} />
          返回看板
        </button>
        <button onClick={onClientView} className="flex items-center gap-1.5 text-sm px-3 py-1.5" style={{ background: T.cream, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
          <Share2 size={13} strokeWidth={1.5} />
          客户分享视图
        </button>
      </div>

      {/* Header */}
      <div className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          {editingMeta ? (
            <div className="space-y-3">
              <input
                value={meta.name}
                onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                className="font-display text-5xl w-full bg-transparent outline-none"
                style={{ color: T.ink, borderBottom: `1px solid ${T.line}` }}
              />
              <div className="grid grid-cols-2 gap-3 mt-4">
                <LabeledInput label="客户 Client" value={meta.client} onChange={(v) => setMeta({ ...meta, client: v })} />
                <LabeledInput label="地址 Address" value={meta.address} onChange={(v) => setMeta({ ...meta, address: v })} />
                <LabeledInput label="房屋类型 Type" value={meta.propertyType} onChange={(v) => setMeta({ ...meta, propertyType: v })} />
                <LabeledInput label="面积 Area" value={meta.area} onChange={(v) => setMeta({ ...meta, area: v })} />
                <LabeledInput label="入住日期 Move-in" type="date" value={dateInputValue(meta.moveIn)} onChange={(v) => setMeta({ ...meta, moveIn: v })} />
              </div>
              <div className="mt-5">
                <div className="text-xs uppercase tracking-wider mb-2" style={{ color: T.inkSoft }}>团队分工 Team</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(OWNERS).map((k) => (
                    <LabeledInput key={k} label={OWNERS[k].full} value={assigned[k] || ''} onChange={(v) => setAssigned({ ...assigned, [k]: v })} compact />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveMeta} className="px-4 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>保存</button>
                <button onClick={() => setEditingMeta(false)} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>取消</button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: T.wood }}>
                Currently in: {cur.name} · {cur.nameCN}
              </div>
              <h1 className="font-display text-5xl leading-tight mb-3" style={{ color: T.ink }}>{project.name}</h1>
              <div className="text-base mb-1" style={{ color: T.inkSoft }}>{project.client}</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: T.inkSoft }}>
                <span className="flex items-center gap-1.5"><MapPin size={13} strokeWidth={1.5} />{project.address}</span>
                <span>·</span>
                <span>{project.propertyType}</span>
                <span>·</span>
                <span>{project.area}</span>
              </div>
              <button onClick={() => setEditingMeta(true)} className="mt-4 text-xs underline opacity-50 hover:opacity-100" style={{ color: T.inkSoft }}>
                编辑项目信息 + 分工
              </button>
            </>
          )}
        </div>

        <div className="p-5" style={{ background: T.cream, borderRadius: '2px' }}>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>整体进度</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl" style={{ color: T.ink }}>{Math.round(overall.pct)}%</span>
                <span className="font-mono text-xs" style={{ color: T.inkSoft }}>{overall.done}/{overall.total} gates</span>
              </div>
              <div className="mt-2 h-1" style={{ background: T.lineSoft }}>
                <div className="h-full" style={{ background: isComplete(project) ? T.sage : T.wood, width: `${overall.pct}%` }} />
              </div>
            </div>

            <div className="ink-divider !my-4" />

            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>入住日期</div>
              <div className="text-sm font-mono" style={{ color: T.ink }}>
                {fmt(project.moveIn)}
                {daysToMove !== null && (
                  <span className="ml-2 text-xs" style={{ color: daysToMove < 0 ? T.terra : daysToMove <= 30 ? T.gold : T.inkSoft }}>
                    {daysToMove < 0 ? `逾期 ${Math.abs(daysToMove)} 天` : daysToMove === 0 ? '今天' : `+${daysToMove} 天`}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>团队</div>
              <div className="space-y-1 text-xs">
                {Object.keys(OWNERS).map((k) => {
                  const name = project.assigned?.[k];
                  const a = avatarFor(name);
                  return (
                    <div key={k} className="flex items-center justify-between" style={{ color: T.ink }}>
                      <span style={{ color: OWNERS[k].color }}>{OWNERS[k].label}</span>
                      <span className="flex items-center gap-1.5" style={{ color: T.inkSoft }}>
                        {a && (
                          <span className="flex items-center justify-center font-mono text-[9px]" style={{ width: 16, height: 16, borderRadius: '50%', background: a.color, color: T.paper }}>
                            {a.initial}
                          </span>
                        )}
                        {name || '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-3 mb-12">
        {STAGES.map((stage) => {
          const sp = stageProgress(project, stage);
          const isExpanded = expandedStage === stage.code;
          const done = sp.pct === 100;
          const isCurrent = currentStage(project).code === stage.code && !isComplete(project);
          const stageAttachCount = stage.gates.reduce((a, g) => a + (project.attachments?.[g.id]?.length || 0), 0);

          return (
            <div key={stage.code} style={{ background: T.paper, border: `1px solid ${isCurrent ? T.wood : T.line}`, borderRadius: '2px', transition: 'all 0.3s' }}>
              <button onClick={() => setExpandedStage(isExpanded ? null : stage.code)} className="w-full p-5 flex items-center gap-4 text-left">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: '52px', height: '52px', background: done ? T.sage : isCurrent ? T.wood : T.cream, color: done || isCurrent ? T.paper : T.inkSoft, borderRadius: '2px' }}
                >
                  {done ? <CheckCircle2 size={22} strokeWidth={1.5} /> : <span className="font-display text-3xl">{stage.code}</span>}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                    <h2 className="font-display text-3xl leading-none" style={{ color: T.ink }}>{stage.name}</h2>
                    <span className="font-display text-xl italic" style={{ color: T.wood }}>{stage.nameCN}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: T.inkSoft }}>
                    <span className="font-mono">{stage.framework}</span>
                    <span>·</span>
                    <span>主理 <span style={{ color: OWNERS[stage.owner].color, fontWeight: 600 }}>{OWNERS[stage.owner].label}</span></span>
                    <span>·</span>
                    <span>{stage.days}</span>
                    <span>·</span>
                    <span className="font-mono">{sp.done}/{sp.total}</span>
                    {stageAttachCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-0.5"><Paperclip size={11} />{stageAttachCount}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                  <div className="w-32 h-1" style={{ background: T.lineSoft }}>
                    <div className="h-full transition-all duration-500" style={{ background: done ? T.sage : T.wood, width: `${sp.pct}%` }} />
                  </div>
                </div>
                <ChevronDown size={18} strokeWidth={1.5} style={{ color: T.inkSoft, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
              </button>

              {isExpanded && (
                <div className="px-5 pb-5">
                  <div className="ink-divider mb-3" />
                  <div className="text-xs italic mb-4 px-3" style={{ color: T.inkSoft }}>"{stage.tagline}"</div>

                  {(stage.linkedForms || []).map((lf) => {
                    if (!FORMS[lf.formCode]) return null;
                    const fc = formCompletion(project, lf.formCode);
                    const f = FORMS[lf.formCode];
                    return (
                      <div key={lf.formCode} className="mb-4 p-4 flex items-center justify-between gap-4 flex-wrap" style={{ background: T.cream, borderRadius: '2px' }}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                            <div className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>{f.en}</div>
                            <div className="font-display text-xl" style={{ color: T.ink }}>{f.title}</div>
                            {lf.gate && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5" style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>{lf.gate}</span>
                            )}
                          </div>
                          <div className="text-xs mb-2" style={{ color: T.inkSoft }}>{f.purpose}</div>
                          <div className="text-sm" style={{ color: T.ink }}>
                            <span className="font-mono">{fc.filled}/{fc.total}</span>
                            <span className="ml-2" style={{ color: T.inkSoft }}>项已填写  ·  {Math.round(fc.pct)}%</span>
                          </div>
                          <div className="mt-2 h-1 max-w-xs" style={{ background: T.lineSoft }}>
                            <div className="h-full" style={{ background: fc.pct === 100 ? T.sage : T.wood, width: `${fc.pct}%` }} />
                          </div>
                        </div>
                        <button onClick={() => onOpenForm(lf.formCode)} className="text-sm flex items-center gap-1.5 px-4 py-2 flex-shrink-0" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
                          <BookOpen size={13} strokeWidth={1.5} />
                          {fc.filled === 0 ? '开始填写' : fc.filled === fc.total ? '查看 / 编辑' : '继续填写'}
                        </button>
                      </div>
                    );
                  })}

                  {stage.hasDailyReports && (
                    <DailyReportsBlock
                      project={project}
                      onSaveReport={onSaveDailyReport}
                      onDeleteReport={onDeleteDailyReport}
                      fetchAttachment={fetchAttachment}
                    />
                  )}

                  <div className="space-y-3">
                    {stage.gates.map((gate) => (
                      <GateRow
                        key={gate.id}
                        gate={gate}
                        checked={!!project.gates?.[gate.id]}
                        note={project.notes?.[gate.id] || ''}
                        attachments={project.attachments?.[gate.id] || []}
                        onToggle={() => onToggleGate(gate.id)}
                        onUpdateNote={(n) => onUpdateNote(gate.id, n)}
                        onAddAttachment={(a, c) => onAddAttachment(gate.id, a, c)}
                        onRemoveAttachment={(a) => onRemoveAttachment(gate.id, a)}
                        fetchAttachment={fetchAttachment}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Defects & Reorders */}
      <DefectsBlock
        project={project}
        onSaveDefect={onSaveDefect}
        onDeleteDefect={onDeleteDefect}
        fetchAttachment={fetchAttachment}
      />

      {/* Risks */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-3xl" style={{ color: T.ink }}>
            风险 & 障碍 <span className="ml-3 font-body text-sm" style={{ color: T.inkSoft }}>Risks & Issues</span>
          </h2>
          <button onClick={() => setShowRiskForm(!showRiskForm)} className="text-sm flex items-center gap-1.5 px-3 py-1.5" style={{ background: 'transparent', color: T.terra, border: `1px solid ${T.terra}`, borderRadius: '2px' }}>
            <Plus size={13} />
            登记风险
          </button>
        </div>
        {showRiskForm && <RiskForm onCancel={() => setShowRiskForm(false)} onSave={(r) => { onAddRisk(r); setShowRiskForm(false); }} />}
        {(project.risks?.length || 0) === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: T.inkSoft, background: T.cream, borderRadius: '2px' }}>✓ 当前无登记风险</div>
        ) : (
          <div className="space-y-2">
            {project.risks.map((r) => (
              <RiskRow key={r.id} risk={r} onRemove={() => onRemoveRisk(r.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="pt-8" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        <button onClick={handleDelete} className="text-xs flex items-center gap-1.5 opacity-50 hover:opacity-100" style={{ color: T.terra }}>
          <Trash2 size={12} strokeWidth={1.5} />
          删除此项目
        </button>
      </div>
    </div>
  );
}
