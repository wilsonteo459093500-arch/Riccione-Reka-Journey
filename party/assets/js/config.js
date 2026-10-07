/* ============================================================
   张丞鹤 DUDU 一岁生日 · 干爹干妈召集会 — 设定
   要改日期、地址、WhatsApp 号码，只改这一份。
   ============================================================ */
window.PARTY = {

  baby: {
    zh: '张丞鹤',
    nick: 'DUDU'
  },

  /* 主人 · 收 RSVP 后备 WhatsApp 的号码（纯数字，60 开头，不要 + 和空格） */
  host: {
    name: 'Wilson',
    wa: '60189661919'
  },

  event: {
    start: '2026-11-14T12:00:00+08:00',   // 星期六 中午 12 点（马来西亚时间）
    end:   '2026-11-14T15:00:00+08:00',   // 只用在「加入日历」，大概写 3 小时
    dateZh: '2026年11月14日（星期六）',
    dateEn: 'Saturday, 14 November 2026',
    dateShort: '14/11/2026',
    timeZh: '中午 12:00',
    timeEn: '12:00 PM',
    venueZh: 'Wilson麻坡家',
    venueEn: "Wilson's home, Muar",
    address: '29-18, Jalan Haji Jaib, 84000 Muar, Johor'
  },

  /* 请大家在这天之前回复，方便订餐。留空就不显示。 */
  rsvpBy: '2026-11-07',
  rsvpByZh: '11月7日',
  rsvpByEn: '7 Nov',

  /* 部署后的正式网址（WhatsApp 链接预览图要用绝对网址）。 */
  siteUrl: 'https://dudu-party.vercel.app'
};

(function (P) {
  var q = encodeURIComponent(P.event.address);
  P.maps = 'https://www.google.com/maps/search/?api=1&query=' + q;
  P.waze = 'https://waze.com/ul?q=' + q + '&navigate=yes';
})(window.PARTY);
