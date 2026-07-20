import { AlertTriangle, Wrench, PackageCheck, CheckCircle2 } from 'lucide-react';

// Four-step aftercare workflow:
//   open → ordered → arrived → closed
// (arrived = factory has shipped the replacement, awaiting site re-install)
export const DEFECT_STATUSES = [
  { code: 'open',    label: '待处理', en: 'Open',     color: '#C4543A', Icon: AlertTriangle },
  { code: 'ordered', label: '已下单', en: 'Ordered',  color: '#B8945E', Icon: Wrench },
  { code: 'arrived', label: '已到货', en: 'Arrived',  color: '#8B6F4E', Icon: PackageCheck },
  { code: 'closed',  label: '已关闭', en: 'Closed',   color: '#5C7A4A', Icon: CheckCircle2 },
];

export const defectStatusInfo = (code) =>
  DEFECT_STATUSES.find((s) => s.code === code) || DEFECT_STATUSES[0];
