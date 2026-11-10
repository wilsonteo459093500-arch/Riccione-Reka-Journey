// 「怎么算的」：把每一行价钱写出来由（给业务看，不印在报价单上）
import { computeItem, fmtMYR, fmtNum } from '../constants/pricing.js';
import { cabinetItemsFor, mergeLines, localizeLines } from './bridge.js';

const PART = {
  closed: { en: 'Doors & carcass', zh: '封门格' },
  glass: { en: 'Glass doors', zh: '玻璃门' },
  open: { en: 'Open shelves', zh: '开放格' },
  panelL: { en: 'Left side panel', zh: '左见光板' },
  panelR: { en: 'Right side panel', zh: '右见光板' },
  panelIn: { en: 'Tall unit inner side panel', zh: '高柜内侧见光板' },
  shelf: { en: 'Floating shelves', zh: '飘板' },
};

export function explainCabinet(cab, defaults = {}) {
  const rows = [];
  cabinetItemsFor(cab, defaults).forEach((it) => {
    const lines = localizeLines(it, computeItem(it).lines);
    const part = PART[it.kira?.part] || { en: it.kira?.part, zh: it.kira?.part };
    const coef = Number(it.coef) > 0 && Number(it.coef) !== 1 ? ` ×${it.coef}` : '';
    lines.forEach((ln) => {
      rows.push({
        part, bucket: ln.bucket, frameId: it.kira?.frameId,
        text: { en: `${ln.descEn}${coef && ln.bucket === 'door' ? coef : ''}`, zh: `${ln.descZh}${coef && ln.bucket === 'door' ? coef : ''}` },
        calc: `${fmtNum(ln.qty, ln.piece ? 0 : 2)} ${ln.uomZh} × RM${fmtNum(ln.unitMyr, 0)}`,
        total: ln.total,
      });
    });
  });
  return rows;
}

export function cabinetLines(cab, defaults = {}) {
  return mergeLines(cabinetItemsFor(cab, defaults).flatMap((it) => localizeLines(it, computeItem(it).lines)));
}

export const fmtRM = fmtMYR;
