import React, { useState } from 'react';
import { TABLE, ROLES, ROLE_KEYS, INDUSTRY_SUGGESTIONS, DEFAULT_PIN } from '../../constants.js';
import { validateMember, uid, todayISO, addDays, isDirector } from '../../utils.js';
import { Modal, Button, Field, inputCls, Notice } from '../Shared.jsx';

const blank = () => ({
  id: uid('mbr'),
  tableId: TABLE.id,
  name: '', company: '', industry: '',
  role: 'member',
  joinedAt: todayISO(),
  feeStatus: 'unpaid',
  feeAmount: TABLE.annualFee,
  feeDueDate: addDays(todayISO(), 365),
  renewalStatus: 'pending',
  ndaSigned: false,
  status: 'active',
  phone: '',
  pin: DEFAULT_PIN,
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function MemberFormModal({ member, members, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...blank(), ...(member || {}) }));
  const [errors, setErrors] = useState([]);
  const isNew = !member;
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const submit = () => {
    const errs = validateMember(draft, members);
    if (errs.length) { setErrors(errs); return; }
    onSave({ ...draft, updatedAt: new Date().toISOString() });
    onClose();
  };

  return (
    <Modal
      title={isNew ? '新增会员' : `编辑 ${draft.name}`}
      subtitle="同桌行业不得重复 —— 保存时会自动查重。"
      onClose={onClose}
      footer={<>
        <Button onClick={onClose}>取消</Button>
        <Button tone="primary" onClick={submit}>{isNew ? '加进这桌' : '保存'}</Button>
      </>}
    >
      <div className="space-y-4">
        {errors.length > 0 && (
          <Notice tone="danger" title="不能保存">
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </Notice>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名" required>
            <input className={inputCls} value={draft.name} onChange={e => set('name', e.target.value)} placeholder="老板姓名" />
          </Field>
          <Field label="角色">
            <select className={inputCls} value={draft.role} onChange={e => set('role', e.target.value)}>
              {ROLE_KEYS.map(k => <option key={k} value={k}>{ROLES[k].label}</option>)}
            </select>
          </Field>
        </div>

        {isDirector(draft) ? (
          <Notice tone="info">
            理事会不占桌上席位：不参与行业查重、不算进出席率、看不到任何案例内容，只看统计数字。
          </Notice>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="公司" required>
                <input className={inputCls} value={draft.company} onChange={e => set('company', e.target.value)} />
              </Field>
              <Field label="行业" required hint="这一栏是桌规查重的依据，写具体一点。">
                <input
                  className={inputCls}
                  list="pumm-industries"
                  value={draft.industry}
                  onChange={e => set('industry', e.target.value)}
                  placeholder="例：家具/全屋定制"
                />
                <datalist id="pumm-industries">
                  {INDUSTRY_SUGGESTIONS.map(i => <option key={i} value={i} />)}
                </datalist>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="入桌日期">
                <input type="date" className={inputCls} value={draft.joinedAt} onChange={e => set('joinedAt', e.target.value)} />
              </Field>
              <Field label="联络电话">
                <input className={inputCls} value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="01x-xxx xxxx" />
              </Field>
            </div>

            <div className="border-t border-pumm-line pt-4">
              <div className="text-[10px] uppercase tracking-wider text-pumm-muted font-semibold mb-2">
                入桌条件 —— 两项齐了才算在桌
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="年费">
                  <select className={inputCls} value={draft.feeStatus} onChange={e => set('feeStatus', e.target.value)}>
                    <option value="unpaid">未到账</option>
                    <option value="paid">已到账</option>
                  </select>
                </Field>
                <Field label={`实收金额（${TABLE.currency}）`}>
                  <input
                    type="number" min="0" className={inputCls}
                    value={draft.feeAmount}
                    onChange={e => set('feeAmount', Number(e.target.value) || 0)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="年费到期日" hint="到期前 30 天会出现续会提醒。">
                  <input type="date" className={inputCls} value={draft.feeDueDate} onChange={e => set('feeDueDate', e.target.value)} />
                </Field>
                <Field label="续会状态">
                  <select className={inputCls} value={draft.renewalStatus} onChange={e => set('renewalStatus', e.target.value)}>
                    <option value="pending">未定</option>
                    <option value="renewed">已续会</option>
                    <option value="left">不续</option>
                  </select>
                </Field>
              </div>

              <label className="flex items-center gap-2 mt-3 text-sm text-pumm-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.ndaSigned}
                  onChange={e => set('ndaSigned', e.target.checked)}
                  className="w-4 h-4 accent-[#23303D]"
                />
                已签保密协议（NDA）
              </label>
            </div>
          </>
        )}

        <div className="border-t border-pumm-line pt-4 grid grid-cols-2 gap-3">
          <Field label="登录 PIN" hint="给这位会员登录用。">
            <input className={inputCls} value={draft.pin} onChange={e => set('pin', e.target.value)} />
          </Field>
          <Field label="在桌状态">
            <select className={inputCls} value={draft.status} onChange={e => set('status', e.target.value)}>
              <option value="active">在桌</option>
              <option value="removed">已出局</option>
            </select>
          </Field>
        </div>

        <Field label="备注">
          <textarea rows={2} className={inputCls} value={draft.notes} onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
