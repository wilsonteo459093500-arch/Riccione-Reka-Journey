import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import {
  PIC_OPTIONS, CLIENT_TYPES, LEAD_SOURCES, CONTACT_METHODS,
  PRIORITIES, SALES_STAGES,
} from '../../constants.js';
import { FormField, Section, inputCls } from '../Shared.jsx';

export default function LeadFormModal({ lead, currentUser, onClose, onSave }) {
  const isEdit = !!lead;
  const [form, setForm] = useState(() => ({
    pic: lead?.pic || currentUser || PIC_OPTIONS[0],
    clientType: lead?.clientType || 'Retail Customer',
    leadSource: lead?.leadSource || 'Walk-in',
    firstContactedDate: lead?.firstContactedDate || new Date().toISOString().split('T')[0],
    clientName: lead?.clientName || '',
    contactMethod: lead?.contactMethod || 'Whatsapp',
    contactNo: lead?.contactNo || '',
    region: lead?.region || '',
    homeAddress: lead?.homeAddress || '',
    soNumber: lead?.soNumber || '',
    priority: lead?.priority || '3. Medium',
    salesStage: lead?.salesStage || 'Stage 1: New Contact',
    quotationAmount: lead?.quotationAmount || 0,
    paymentInfo: lead?.paymentInfo || '',
    clientNeeds: lead?.clientNeeds || '',
    expectedDeliveryDate: lead?.expectedDeliveryDate || '',
    isDecisionMaker: lead?.isDecisionMaker || '',
    nextAction: lead?.nextAction || '',
    statusRemarks: lead?.statusRemarks || '',
  }));

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.clientName.trim()) {
      alert('Client name is required');
      return;
    }
    onSave({ ...form, quotationAmount: Number(form.quotationAmount) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sail-line flex items-center justify-between flex-shrink-0">
          <h2 className="font-display text-xl text-sail-ink font-semibold">{isEdit ? 'Edit Lead' : 'New Lead'}</h2>
          <button type="button" onClick={onClose} className="text-sail-faint hover:text-sail-ink" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <Section title="Basic Info">
            <FormField label="Client Name *">
              <input type="text" value={form.clientName} onChange={(e) => update('clientName', e.target.value)}
                className={inputCls} placeholder="e.g. Mr Lim, ZXL - Melawati" required />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="PIC">
                <select value={form.pic} onChange={(e) => update('pic', e.target.value)} className={inputCls}>
                  {PIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="Client Type">
                <select value={form.clientType} onChange={(e) => update('clientType', e.target.value)} className={inputCls}>
                  {CLIENT_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Lead Source">
                <select value={form.leadSource} onChange={(e) => update('leadSource', e.target.value)} className={inputCls}>
                  {LEAD_SOURCES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="1st Contacted Date">
                <input type="date" value={form.firstContactedDate}
                  onChange={(e) => update('firstContactedDate', e.target.value)} className={inputCls} />
              </FormField>
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Contact Method">
                <select value={form.contactMethod} onChange={(e) => update('contactMethod', e.target.value)} className={inputCls}>
                  {CONTACT_METHODS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
              <FormField label="Contact No. / ID">
                <input type="tel" value={form.contactNo} onChange={(e) => update('contactNo', e.target.value)}
                  className={inputCls} placeholder="012-345 6789" />
              </FormField>
            </div>
            <FormField label="Region / Area">
              <input type="text" value={form.region} onChange={(e) => update('region', e.target.value)}
                className={inputCls} placeholder="e.g. Setia Alam, KL, Cyberjaya" />
            </FormField>
            <FormField label="Full Home / Site Address">
              <textarea rows={2} value={form.homeAddress} onChange={(e) => update('homeAddress', e.target.value)}
                className={inputCls + ' resize-none'} placeholder="Full delivery / installation address — unit, street, postcode, city" />
            </FormField>
          </Section>

          <Section title="Status">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Priority">
                <select value={form.priority} onChange={(e) => update('priority', e.target.value)} className={inputCls}>
                  {PRIORITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </FormField>
              <FormField label="Sales Stage">
                <select value={form.salesStage} onChange={(e) => update('salesStage', e.target.value)} className={inputCls}>
                  {SALES_STAGES.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="SO Number">
                <input type="text" value={form.soNumber} onChange={(e) => update('soNumber', e.target.value)}
                  className={inputCls} placeholder="SO-B00000" />
              </FormField>
              <FormField label="Decision Maker?">
                <select value={form.isDecisionMaker} onChange={(e) => update('isDecisionMaker', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </FormField>
            </div>
          </Section>

          <Section title="Deal">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quotation Amount (RM)">
                <input type="number" inputMode="decimal" min="0" value={form.quotationAmount}
                  onChange={(e) => update('quotationAmount', e.target.value)} className={inputCls} placeholder="0" />
              </FormField>
              <FormField label="Payment Info">
                <input type="text" value={form.paymentInfo} onChange={(e) => update('paymentInfo', e.target.value)}
                  className={inputCls} placeholder="e.g. 50% 14/1/2026" />
              </FormField>
            </div>
            <FormField label="Client Needs">
              <input type="text" value={form.clientNeeds} onChange={(e) => update('clientNeeds', e.target.value)}
                className={inputCls} placeholder="e.g. Whole House Customization, Kitchen + Master" />
            </FormField>
            <FormField label="Expected Delivery">
              <input type="text" value={form.expectedDeliveryDate}
                onChange={(e) => update('expectedDeliveryDate', e.target.value)}
                className={inputCls} placeholder="e.g. End of March 2026, Before CNY 2026" />
            </FormField>
          </Section>

          <Section title="Follow-up">
            <FormField label="Next Action">
              <input type="text" value={form.nextAction} onChange={(e) => update('nextAction', e.target.value)}
                className={inputCls} placeholder="e.g. Active Action: Follow up design" />
            </FormField>
            <FormField label="Status / Remarks">
              <textarea rows={3} value={form.statusRemarks} onChange={(e) => update('statusRemarks', e.target.value)}
                className={inputCls + ' resize-none'} placeholder="Any notes, context, or status updates…" />
            </FormField>
          </Section>
        </div>

        <div className="px-5 py-3 border-t border-sail-line flex items-center justify-end gap-2 flex-shrink-0 bg-sail-tint">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-sail-muted hover:text-sail-ink">Cancel</button>
          <button type="button" onClick={handleSubmit}
            className="px-4 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {isEdit ? 'Save Changes' : 'Create Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
