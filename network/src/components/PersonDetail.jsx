import React, { useState } from 'react';
import {
  ChevronLeft, MessageCircle, Phone, Mail, Sparkles, RefreshCw, Pencil, Trash2, Plus, Globe, MapPin,
  Building2, ExternalLink, Gift, Users, CalendarDays, AlertTriangle, MessagesSquare,
} from 'lucide-react';
import { useStore, stripView } from '../lib/store.jsx';
import { DIMS, TIERS, worthVerdict, waLink, fmtDate, relDay, splitTags } from '../lib/logic.js';
import { Avatar, Button, Chip, Section, TierBadge, WorthGem, Input, Textarea, Field, Sheet, Spinner, useToast, cx, inputCls } from './ui.jsx';
import PhotoGrid from './PhotoGrid.jsx';
import { PhonesEditor } from './ScanCard.jsx';

export default function PersonDetail({ id, onBack, autoAnalyze, onAnalyzed }) {
  const store = useStore();
  const toast = useToast();
  const raw = store.data.people.find((p) => p.id === id);
  const p = raw ? store.view(raw) : null;
  const [step, setStep] = useState(''); // '' | company | assess
  const [editing, setEditing] = useState(false);
  const started = React.useRef(false);

  async function analyze(refreshCompany = false) {
    setStep(p.company && (!p.company.background || refreshCompany) ? 'company' : 'assess');
    try {
      await store.deepAnalyze(p.id, { refreshCompany, onStep: (s) => setStep(s === 'done' ? '' : s) });
      toast('分析好了');
    } catch (e) {
      toast(`分析失败：${e.message}`, 'error');
    } finally {
      setStep('');
    }
  }

  React.useEffect(() => {
    if (autoAnalyze && p && !started.current) {
      started.current = true;
      onAnalyzed && onAnalyzed();
      analyze(false);
    }
  }, [autoAnalyze, p]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) {
    return (
      <div className="p-6 text-center text-muted">
        {store.loading ? <Spinner label="读取中…" /> : '找不到这个人'}
        {!store.loading && <div className="mt-3"><Button variant="outline" onClick={onBack}>回列表</Button></div>}
      </div>
    );
  }

  const a = p.assessment;
  const wa = waLink(p.whatsapp);
  const phone = p.phones && p.phones[0];
  const email = p.emails && p.emails[0];

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-3 sm:pb-10">
      {/* ---------- 头 ---------- */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="-ml-2 rounded-full p-2 hover:bg-ink/5 lg:invisible" aria-label="返回"><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />编辑</Button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <Avatar person={p} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{p.name}</h1>
          {p.name_alt && <div className="text-muted">{p.name_alt}</div>}
          <div className="mt-1 text-[15px] text-ink/80">{[p.title, p.company && p.company.name].filter(Boolean).join(' · ')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />见过 {p.meetings} 次</span>
            {p.met_on && <span>认识于 {fmtDate(p.met_on)}</span>}
            {p.last_contact_at && <span>上次联系 {relDay(p.last_contact_at)}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ActionLink href={wa} icon={MessageCircle} label="WhatsApp" accent />
        <ActionLink href={phone ? `tel:${phone.number.replace(/[^\d+]/g, '')}` : ''} icon={Phone} label="电话" />
        <ActionLink href={email ? `mailto:${email}` : ''} icon={Mail} label="邮件" />
      </div>

      {/* ---------- 圈层 ---------- */}
      <div className="flex gap-1 rounded-2xl border border-line bg-white p-1" role="radiogroup" aria-label="圈层">
        {TIERS.map((t) => (
          <button
            key={t.key}
            role="radio"
            aria-checked={p.tier === t.key}
            onClick={() => p.tier !== t.key && store.setTier(p, t.key).catch((e) => toast(e.message, 'error'))}
            className={cx('flex-1 rounded-xl px-1 py-2 text-sm transition-colors', p.tier === t.key ? 'text-white' : 'text-muted hover:bg-ink/5')}
            style={p.tier === t.key ? { background: t.color } : undefined}
          >
            {t.label}<span className="ml-0.5 text-[11px] opacity-70">{t.cap}</span>
          </button>
        ))}
      </div>

      {/* ---------- 值得认识吗 ---------- */}
      <Section
        title="值得认识吗？"
        action={a && !step && (
          <Button size="sm" variant="ghost" onClick={() => analyze(false)}><RefreshCw className="h-3.5 w-3.5" />重新分析</Button>
        )}
      >
        {step ? (
          <div className="space-y-2 py-4">
            <Spinner label={step === 'company' ? '正在网上查他的公司…（约 20–40 秒）' : '正在评分、想我能给他什么…'} />
            <p className="text-xs text-faint">可以先离开这页，结果会自动存好。</p>
          </div>
        ) : a ? (
          <Assessment a={a} score={p.worth_score} suggested={a.suggested_tier !== p.tier ? a.suggested_tier : null} onApplyTier={() => store.setTier(p, a.suggested_tier)} />
        ) : (
          <div className="py-2 text-center">
            <p className="text-sm text-muted">查公司背景，按 4 个维度评分：能带来家具生意、是不是超级连接者、有没有我缺的资源、我能不能帮到他。</p>
            <Button variant="accent" className="mt-3" onClick={() => analyze(false)}><Sparkles className="h-4 w-4" />深度分析</Button>
            <p className="mt-2 text-xs text-faint">Sonnet + 网页搜索，约 RM0.5；公司查过一次就存起来</p>
          </div>
        )}
      </Section>

      {/* ---------- 我能给他什么 ---------- */}
      {a && a.give_ideas && a.give_ideas.length > 0 && (
        <Section title={<span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-plum" />我可以给他什么（家具以外）</span>}>
          <ul className="space-y-2.5">
            {a.give_ideas.map((g, i) => {
              const added = p.resources.some((r) => r.kind === 'give' && r.label === g.idea);
              return (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-plum/10 text-xs font-semibold text-plum-deep">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{g.idea}</div>
                    <div className="text-sm text-muted">{g.why}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-faint">{{ low: '容易做', medium: '要花点功夫', high: '要花大功夫' }[g.effort]}</span>
                      <button
                        disabled={added}
                        onClick={() => store.addResource(p.id, 'give', g.idea, g.why)}
                        className="text-xs font-medium text-plum-deep disabled:text-faint"
                      >
                        {added ? '✓ 已加进「我能给的」' : '+ 加进「我能给的」'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ---------- 资源 ---------- */}
      <Section title="资源">
        <div className="space-y-3">
          <ResourceRow person={p} kind="has" label="他有的" />
          <ResourceRow person={p} kind="needs" label="他需要的" />
          <ResourceRow person={p} kind="give" label="我能给的" />
        </div>
      </Section>

      {/* ---------- 商会 / 圈子 ---------- */}
      <CirclesSection person={p} />

      {/* ---------- 公司背景 ---------- */}
      {p.company && <CompanySection company={p.company} busy={!!step} onRefresh={() => analyze(true)} />}

      {/* ---------- 互动记录 ---------- */}
      <InteractionsSection person={p} />

      {/* ---------- 照片 ---------- */}
      <PhotoGrid person={p} />

      {/* ---------- 联系方式 & 资料 ---------- */}
      <InfoSection person={p} />

      <div className="pt-4 text-center">
        <DeleteButton person={p} onDeleted={onBack} />
      </div>

      <EditSheet open={editing} onClose={() => setEditing(false)} person={p} />
    </div>
  );
}

function ActionLink({ href, icon: Icon, label, accent }) {
  const cls = cx('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium',
    !href ? 'pointer-events-none border-line bg-white text-faint' : accent ? 'border-plum bg-plum text-white' : 'border-line bg-white text-ink hover:border-ink/30');
  return <a href={href || undefined} target={href && href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls} aria-disabled={!href}><Icon className="h-4 w-4" />{label}</a>;
}

function Assessment({ a, score, suggested, onApplyTier }) {
  const v = worthVerdict(score);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <WorthGem score={score} size={52} />
        <div>
          <div className="font-semibold">{v.label}</div>
          <div className="text-sm text-muted">{a.one_line}</div>
        </div>
      </div>
      <div className="space-y-3">
        {DIMS.map((d) => {
          const x = (a.dims && a.dims[d.key]) || { score: 0, reason: '' };
          return (
            <div key={d.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="tabular-nums text-muted">{x.score}/10</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/5">
                <div className="h-full rounded-full bg-plum" style={{ width: `${x.score * 10}%`, opacity: 0.35 + x.score * 0.065 }} />
              </div>
              {x.reason && <p className="mt-1 text-[13px] text-muted">{x.reason}</p>}
            </div>
          );
        })}
      </div>
      {a.talk_topics && a.talk_topics.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><MessagesSquare className="h-4 w-4" />下次可以聊</div>
          <div className="flex flex-wrap gap-1.5">{a.talk_topics.map((t, i) => <Chip key={i} tone="soft">{t}</Chip>)}</div>
        </div>
      )}
      {a.caution && <p className="flex gap-1.5 rounded-xl bg-amber-50 p-2.5 text-[13px] text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{a.caution}</p>}
      {suggested && (
        <div className="flex items-center justify-between rounded-xl bg-ink/5 p-2.5 text-sm">
          <span>AI 建议放进 <TierBadge tier={suggested} /></span>
          <Button size="sm" variant="outline" onClick={onApplyTier}>照建议改</Button>
        </div>
      )}
      <p className="text-right text-[11px] text-faint">{fmtDate(a.assessed_at)} 分析</p>
    </div>
  );
}

function ResourceRow({ person, kind, label }) {
  const store = useStore();
  const [text, setText] = useState('');
  const list = person.resources.filter((r) => r.kind === kind);
  async function add(e) {
    e.preventDefault();
    for (const l of splitTags(text)) await store.addResource(person.id, kind, l);
    setText('');
  }
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((r) => (
          <Chip key={r.id} tone={r.source === 'ai' ? 'ai' : kind} title={r.detail || (r.source === 'ai' ? 'AI 推测的' : '')} onRemove={() => store.removeResource(r.id)}>
            {r.source === 'ai' && '✦ '}{r.label}
          </Chip>
        ))}
        <form onSubmit={add} className="inline-flex">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ 加" aria-label={`加${label}`}
            className="w-24 rounded-full border border-dashed border-line bg-transparent px-2.5 py-1 text-[13px] outline-none focus:w-40 focus:border-ink/40" />
        </form>
      </div>
    </div>
  );
}

function CirclesSection({ person }) {
  const store = useStore();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const known = store.data.circles.filter((c) => !person.circles.some((x) => x.id === c.id));
  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await store.addCircle(person.id, name, role);
    setName('');
    setRole('');
  }
  return (
    <Section title={<span className="flex items-center gap-1.5"><Users className="h-4 w-4" />商会 / 圈子</span>}>
      <div className="flex flex-wrap gap-1.5">
        {person.circles.map((c) => <Chip key={c.link.id} onRemove={() => store.removePersonCircle(c.link.id)}>{c.name}{c.link.role && <span className="text-muted"> · {c.link.role}</span>}</Chip>)}
        {!person.circles.length && <span className="text-sm text-faint">还没有</span>}
      </div>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input list="circle-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="商会 / 圈子名" className={cx(inputCls, '!py-2 text-sm')} />
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="职位" className={cx(inputCls, '!w-24 !py-2 text-sm')} />
        <Button size="sm" variant="outline" type="submit" className="!h-auto">加</Button>
        <datalist id="circle-names">{known.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      </form>
    </Section>
  );
}

function CompanySection({ company, busy, onRefresh }) {
  const b = company.background;
  return (
    <Section
      title={<span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{company.name}</span>}
      action={b && <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5" />重查</Button>}
    >
      {!b ? (
        <p className="text-sm text-muted">还没查。按上面的「深度分析」会一起查。</p>
      ) : (
        <div className="space-y-2 text-sm">
          {!b.found && <p className="text-amber-700">网上查不太到这家公司的资料。</p>}
          {b.summary && <p className="leading-relaxed">{b.summary}</p>}
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[13px]">
            {b.industry && <><dt className="text-muted">行业</dt><dd>{b.industry}</dd></>}
            {b.size && <><dt className="text-muted">规模</dt><dd>{b.size}</dd></>}
            {b.founded && <><dt className="text-muted">成立</dt><dd>{b.founded}</dd></>}
            {b.location && <><dt className="text-muted">地点</dt><dd>{b.location}</dd></>}
          </dl>
          {b.products && b.products.length > 0 && <div className="flex flex-wrap gap-1">{b.products.map((x, i) => <Chip key={i} tone="soft">{x}</Chip>)}</div>}
          {b.notable && b.notable.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{b.notable.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {b.furniture_angle && <p className="rounded-xl bg-plum/5 p-2.5 text-[13px]"><b>跟家具生意的关系：</b>{b.furniture_angle}</p>}
          {b.sources && b.sources.length > 0 && (
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted">来源 {b.sources.length} 个 · 把握：{{ high: '高', medium: '中', low: '低' }[b.confidence]}</summary>
              <ul className="mt-1 space-y-1">
                {b.sources.map((s) => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-sky-700 hover:underline">{s.title}<ExternalLink className="h-3 w-3 shrink-0" /></a></li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-right text-[11px] text-faint">{fmtDate(b.fetched_at)} 查的</p>
        </div>
      )}
    </Section>
  );
}

const KIND_LABEL = { meeting: '见面', call: '电话', message: '讯息', event: '活动', note: '备注', card_scan: '交换名片' };

function InteractionsSection({ person }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: 'meeting', date: fmtDate(new Date().toISOString()), title: '', summary: '' });
  async function add(e) {
    e.preventDefault();
    try {
      await store.addInteraction(person, { kind: f.kind, occurred_at: new Date(`${f.date}T12:00:00`).toISOString(), title: f.title, summary: f.summary });
      setF({ ...f, title: '', summary: '' });
      setOpen(false);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <Section
      title={<span>见面 / 互动 <span className="font-normal text-faint">{person.interactions.length}</span></span>}
      action={<Button size="sm" variant="ghost" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" />记一笔</Button>}
    >
      {open && (
        <form onSubmit={add} className="mb-4 space-y-2 rounded-xl bg-ink/5 p-3">
          <div className="flex gap-2">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={cx(inputCls, '!w-28 !py-2 text-sm')}>
              {['meeting', 'call', 'message', 'event', 'note'].map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={cx(inputCls, '!py-2 text-sm')} />
          </div>
          <Input placeholder="标题（例：喝咖啡、商会晚宴）" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="!py-2 text-sm" />
          <Textarea placeholder="聊了什么、他提到的兴趣 / 需要" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} className="text-sm" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>取消</Button>
            <Button size="sm" type="submit">存</Button>
          </div>
        </form>
      )}
      {person.interactions.length === 0 && <p className="text-sm text-faint">还没有记录</p>}
      <ol className="relative space-y-3 border-l border-line pl-4">
        {person.interactions.map((i) => (
          <li key={i.id} className="group">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink/30" />
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm"><span className="font-medium">{i.title || KIND_LABEL[i.kind]}</span> <span className="text-xs text-faint">{KIND_LABEL[i.kind]} · {fmtDate(i.occurred_at)}</span></div>
              <button onClick={() => window.confirm('删掉这笔记录？') && store.removeInteraction(i.id)} className="text-faint opacity-0 hover:text-danger group-hover:opacity-100" aria-label="删除记录"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {i.summary && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-muted">{i.summary}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function TagEditor({ label, values, onChange }) {
  const [text, setText] = useState('');
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => <Chip key={v} tone="soft" onRemove={() => onChange(values.filter((x) => x !== v))}>{v}</Chip>)}
        <form onSubmit={(e) => { e.preventDefault(); onChange([...new Set([...values, ...splitTags(text)])]); setText(''); }} className="inline-flex">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ 加" aria-label={`加${label}`}
            className="w-24 rounded-full border border-dashed border-line bg-transparent px-2.5 py-1 text-[13px] outline-none focus:w-40 focus:border-ink/40" />
        </form>
      </div>
    </div>
  );
}

function InfoSection({ person }) {
  const store = useStore();
  const save = (patch) => store.savePerson({ ...stripView(person), ...patch });
  return (
    <Section title="资料">
      <div className="space-y-4">
        <TagEditor label="兴趣" values={person.interests || []} onChange={(interests) => save({ interests })} />
        <TagEditor label="标签" values={person.tags || []} onChange={(tags) => save({ tags })} />
        <dl className="space-y-2 text-sm">
          {(person.phones || []).map((ph, i) => <Row key={i} icon={Phone} label={ph.label}><a className="text-sky-700" href={`tel:${ph.number.replace(/[^\d+]/g, '')}`}>{ph.number}</a></Row>)}
          {(person.emails || []).map((e) => <Row key={e} icon={Mail}><a className="break-all text-sky-700" href={`mailto:${e}`}>{e}</a></Row>)}
          {person.website && <Row icon={Globe}><a className="break-all text-sky-700" href={/^https?:/.test(person.website) ? person.website : `https://${person.website}`} target="_blank" rel="noreferrer">{person.website}</a></Row>}
          {person.address && <Row icon={MapPin}><a className="text-sky-700" href={`https://maps.google.com/?q=${encodeURIComponent(person.address)}`} target="_blank" rel="noreferrer">{person.address}</a></Row>}
          {(person.socials || []).map((s, i) => <Row key={i} icon={ExternalLink} label={s.platform}>{s.handle}</Row>)}
        </dl>
        {person.how_met && <p className="text-sm"><span className="text-muted">怎么认识：</span>{person.how_met}</p>}
        {person.card_notes && <p className="whitespace-pre-wrap text-sm"><span className="text-muted">名片上还写：</span>{person.card_notes}</p>}
        <NotesEditor value={person.notes || ''} onSave={(notes) => save({ notes })} />
      </div>
    </Section>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
      {label && <span className="w-16 shrink-0 text-xs capitalize text-faint">{label}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function NotesEditor({ value, onSave }) {
  const [text, setText] = useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <Field label="我的备注">
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onSave(text)} placeholder="他家人、喜好、要避开的话题…（离开输入框自动存）" />
    </Field>
  );
}

function DeleteButton({ person, onDeleted }) {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm" variant="danger" busy={busy}
      onClick={async () => {
        if (!window.confirm(`删掉「${person.name}」？他的记录、名片照片都会删掉（合照留着）。`)) return;
        setBusy(true);
        try { await store.deletePerson(person); onDeleted(); } catch (e) { toast(e.message, 'error'); setBusy(false); }
      }}
    >
      <Trash2 className="h-4 w-4" />删掉这个人
    </Button>
  );
}

function EditSheet({ open, onClose, person }) {
  const store = useStore();
  const toast = useToast();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (open) {
      setF({
        name: person.name, name_alt: person.name_alt || '', title: person.title || '', company: person.company ? person.company.name : '',
        phones: person.phones || [], emails: (person.emails || []).join(', '), whatsapp: person.whatsapp || '', website: person.website || '',
        address: person.address || '', how_met: person.how_met || '', met_on: person.met_on || '',
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  async function save() {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const company = f.company.trim() ? await store.ensureCompany(f.company) : null;
      await store.savePerson({
        ...stripView(person), name: f.name.trim(), name_alt: f.name_alt, title: f.title, company_id: company ? company.id : null,
        phones: f.phones.filter((p) => p.number.trim()), emails: f.emails.split(/[,，\s]+/).filter(Boolean), whatsapp: f.whatsapp.replace(/\D/g, ''),
        website: f.website, address: f.address, how_met: f.how_met, met_on: f.met_on || null,
      });
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="编辑资料">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="名字"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="另一种写法"><Input value={f.name_alt} onChange={(e) => setF({ ...f, name_alt: e.target.value })} /></Field>
        </div>
        <Field label="职位"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="公司"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <PhonesEditor phones={f.phones} onChange={(phones) => setF({ ...f, phones })} />
        <Field label="WhatsApp（数字含国家码）"><Input inputMode="tel" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
        <Field label="邮箱"><Input value={f.emails} onChange={(e) => setF({ ...f, emails: e.target.value })} /></Field>
        <Field label="网站"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></Field>
        <Field label="地址"><Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="怎么认识"><Input value={f.how_met} onChange={(e) => setF({ ...f, how_met: e.target.value })} /></Field>
          <Field label="认识日期"><Input type="date" value={f.met_on || ''} onChange={(e) => setF({ ...f, met_on: e.target.value })} /></Field>
        </div>
        <Button className="w-full" busy={busy} onClick={save}>存</Button>
      </div>
    </Sheet>
  );
}
