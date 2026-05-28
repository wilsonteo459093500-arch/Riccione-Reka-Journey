import { Wrench, ShieldCheck, Settings, Sparkles, HelpCircle } from 'lucide-react';

// After-sales categories. Distinct from install-time defects: these are
// post-handover tickets (warranty, repair requests, maintenance, etc.)
// raised by the client after the project is complete.
export const AFTER_SALES_CATEGORIES = [
  { code: 'warranty',    label: '保修 Warranty',          color: '#5C7A4A', Icon: ShieldCheck },
  { code: 'repair',      label: '维修 Repair',            color: '#C4543A', Icon: Wrench },
  { code: 'adjustment',  label: '调试 Adjustment',        color: '#B8945E', Icon: Settings },
  { code: 'maintenance', label: '保养 Maintenance',       color: '#8B6F4E', Icon: Sparkles },
  { code: 'other',       label: '其他 Other',             color: '#6B5D4F', Icon: HelpCircle },
];

export const getAfterSalesCategory = (code) =>
  AFTER_SALES_CATEGORIES.find((c) => c.code === code) || AFTER_SALES_CATEGORIES[4];
