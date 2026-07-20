// ============================================================
// APPOINTMENT TYPES — calendar event categories
// Colors picked from the project theme so calendar dots match
// the rest of the app's earthy palette.
// ============================================================

export const APPOINTMENT_TYPES = [
  { value: 'showroom',     label: '展厅接待 Showroom Visit',  short: '展厅',   color: '#8B6F4E' },
  { value: 'site_visit',   label: '现场拜访 Site Visit',       short: '现场',   color: '#5C7A4A' },
  { value: 'measurement',  label: '现场量尺 Site Measurement', short: '量尺',   color: '#B8945E' },
  { value: 'installation', label: '安装 Installation',         short: '安装',   color: '#2D3E36' },
  { value: 'handover',     label: '交付 Handover',             short: '交付',   color: '#3D5A4A' },
  { value: 'other',        label: '其他 / 会议 Other',         short: '其他',   color: '#6B5D4F' },
];

export const getApptTypeMeta = (t) =>
  APPOINTMENT_TYPES.find((x) => x.value === t) || APPOINTMENT_TYPES[5];
