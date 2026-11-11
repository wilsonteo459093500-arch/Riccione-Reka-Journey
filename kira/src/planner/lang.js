// ============================================================
// 输出语言：报价单 / 长图 / Excel / WhatsApp 都按 lang 'en' | 'zh' | 'both' 出字。
// 文字一律存成结构化 { en, zh }（或不分语言的纯字串，例如尺寸），渲染时才按语言取 —— 不去拆「English 中文」字串。
// ============================================================

// v：'2.40 m'（不分语言，原样）或 { en, zh }；both = "English 中文"
export function pickL(v, lang = 'both') {
  if (v == null || v === false) return '';
  if (typeof v !== 'object') return String(v);
  if (lang === 'en') return v.en || v.zh || '';
  if (lang === 'zh') return v.zh || v.en || '';
  return [v.en, v.zh].filter(Boolean).join(' ');
}

// 几段用「 · 」接起来，每段各自按语言取（both 时每段都是 "English 中文"）
export const joinL = (segs, lang = 'both', sep = ' · ') => (segs || []).map((s) => pickL(s, lang)).filter(Boolean).join(sep);

// 柜体种类（地柜 / 吊柜 / 高柜）
export const FRAME_KIND_NAME = {
  base: { en: 'Base Cabinet', zh: '地柜' },
  wall: { en: 'Top Cabinet', zh: '吊柜' },
  tall: { en: 'Tall Cabinet', zh: '高柜' },
  backdrop: { en: 'Feature Wall', zh: '电视墙' }, // 追加 2：电视墙（一块墙板，不是柜子）
};

// 第 i 面墙（同立面图的墙名）
export const wallName = (i) => {
  const ch = String.fromCharCode(65 + (Math.max(0, i | 0) % 26));
  return { en: `Wall ${ch}`, zh: `墙${ch}` };
};

// 旧的双语 label 字串（存在柜体 frame.label 里；新旧记录都一样）
export const bi = (v) => [v.en, v.zh].filter(Boolean).join(' ');
