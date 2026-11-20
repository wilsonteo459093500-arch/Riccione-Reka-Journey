// 马来西亚电话 → WhatsApp 国际格式（只留数字）
//   012-345 6789 → 60123456789；+60 12-345 6789 → 60123456789；60123456789 不变
export function waNumber(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('60')) return d;
  if (d.startsWith('0')) return '6' + d;
  if (d.startsWith('1') && d.length >= 9 && d.length <= 10) return '60' + d; // 12-3456789 少打了 0
  return d; // 其他国家号码：照原样
}

// wa.me 链接：有号码直接打开该客户对话；没有就让业务自己选联系人
export function waLink(phone, text = '') {
  const n = waNumber(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${n}${q}`;
}
