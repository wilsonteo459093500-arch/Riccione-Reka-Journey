/* ============================================================
   溪岸 Sail by Riccione Reka — 全局配置
   改这一份文件就能换号码 / 地址 / 团队成员，不用动其它代码。
   Edit this file only — no need to touch the other scripts.
   ============================================================ */
window.SAIL = {

  /* 展厅信息 · showroom ------------------------------------ */
  venue: {
    name:      'RICCIONE Malaysia · 溪岸自然主义生活体验馆',
    address:   '23-3, Jalan Setia Prima S U13/S, Seksyen U13, Setia Alam, 40170 Shah Alam, Selangor',
    hoursZh:   '周一至周五 9:00am–6:00pm ／ 周六周日 10:00am–6:00pm',
    hoursEn:   'Mon–Fri 9:00am–6:00pm / Sat–Sun 10:00am–6:00pm',
    phone:     '+60189661919',      // tel: 链接用
    phoneShow: '018-966 1919'
  },

  /* 默认邀请人 · fallback host（链接里没带 by 参数时用这个） */
  host: {
    name:  'Wilson Teo',
    role:  '溪岸 Sail by Riccione Reka',
    wa:    '60189661919'            // 纯数字，国际码开头，不要 + 和空格
  },

  /* 需求卡收件人 · where the client brief is sent ------------
     留空则用 host.wa。填公司总机比较稳妥。 */
  briefInbox: '60189661919',

  /* 选填：把需求卡同时 POST 到你的表单服务（Formspree / Supabase
     Edge Function / Google Apps Script 都可以）。留空则只走 WhatsApp。 */
  briefEndpoint: '',

  /* 团队 · 销售端下拉选单会读这里 ---------------------------- */
  team: [
    { name: 'Wilson Teo', role: '溪岸 Sail by Riccione Reka', wa: '60189661919' }
  ],

  /* 邀请函里是否显示「先填需求卡」的入口 */
  showBriefLink: true
};

/* 导航链接 · navigation links（不需要改） */
window.SAIL.maps = 'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent('RICCIONE Malaysia ' + window.SAIL.venue.address);
window.SAIL.waze = 'https://waze.com/ul?q=' +
  encodeURIComponent('RICCIONE Malaysia Setia Alam') + '&navigate=yes';
