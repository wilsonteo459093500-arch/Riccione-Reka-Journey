// 尺寸单位：设计师用 mm；马来西亚的柜子按「尺 / ft」报价，客人看得懂的是尺。
// 客人看的数字：≈ 2,100 mm（约 7 尺 / ft）。设计师版和 WhatsApp 摘要只用 mm。

import { t } from './i18n.js';

/** mm → 英尺，取到 0.5 */
export const ft = (mm) => Math.round((Number(mm) || 0) / 304.8 * 2) / 2;

/** 千分位：2100 → 2,100 */
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** 客人看的英尺注释：约 7 尺 / ft（英文：about 7 ft） */
export const ftNote = (mm) => (mm ? t('约 {0} 尺 / ft', [ft(mm)]) : '');

/** 「2,100 mm · 约 7 尺 / ft」 */
export const mmFt = (mm) => (mm ? `${fmt(mm)} mm · ${ftNote(mm)}` : '—');
