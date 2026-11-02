/* ============================================================
   VISI · 公司资料（方案 2.0 的品牌页、工期·保障页、团队页、封底用）
   ------------------------------------------------------------
   全部照抄 UKIR STUDIO 的 blueprint/src/engine/b/company.js —— 老板已经确认过的
   真实资料（奖项、供应链、订单周期、售后质保）。两边要一致：改这里，也改那边。
   这一份只放「事实」；怎么说（文案语气）在 data.js / copy.js。
   原则（稻盛和夫 · 不编）：这里没有的数字，方案里就不写。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var IMG = 'assets/img/brand/';

  MB.BRAND = {
    /* 页脚的品牌签名（HIPPO / Aman 版式右下角那一行） */
    tagline: { zh: '自然栖居 · 生活回归', en: 'LIVING NATURALLY' },
    signoff: { zh: '在溪岸，回归生活的美好', en: 'By the stream, back to the beauty of everyday life.' },

    logo: { ink: IMG + 'logo-ink.png', white: IMG + 'logo-white.png' },

    /* 品牌一段话（品牌页的开头） */
    story: {
      title: { zh: '朴素的美感，自然的治愈力', en: 'Simple beauty, the healing power of nature' },
      body: {
        zh: '2011 年，溪岸创立于成都，以自然为源，让设计回到宁静与美好。2025 年，Riccione Reka 成为溪岸东南亚总代理，把门、墙、柜一体的生活带到马来西亚。',
        en: 'Founded in Chengdu in 2011, SAIL looks to nature to bring design back to calm and beauty. In 2025 Riccione Reka became SAIL’s distributor for Southeast Asia, bringing doors, walls and cabinetry, made as one, to Malaysia.'
      }
    },

    awards: [
      { year: '2021', title: { zh: '美国 MUSE 缪斯设计奖 · 金奖', en: 'MUSE Design Awards, USA · Gold' },
        note: { zh: '溪岸 4.0 系列 · 从 100 多个国家和地区的 3.8 万件作品中选出', en: 'SAIL 4.0 Series · chosen from 38,000 entries in 100+ countries' } },
      { year: '2022', title: { zh: 'HCA 高定家居设计奖 · 年度产品设计奖', en: 'HCA Home Design Awards · Product of the Year' },
        note: { zh: '自然线系列 · 广州设计周', en: 'Natural Line Series · Guangzhou Design Week' } },
      { year: '2023', title: { zh: 'HCA 高定家居设计奖 · 年度产品设计至尊奖', en: 'HCA Home Design Awards · Supreme Award' },
        note: { zh: '骨骼线 · 闲庭 · 终评前三', en: 'Skeleton Line · Leisure Courtyard · top three finalist' } },
      { year: '2024', title: { zh: 'HCA 高定家居设计奖 · 年度产品设计奖', en: 'HCA Home Design Awards · Product of the Year' },
        note: { zh: '骨骼线 · 山居', en: 'Skeleton Line · Mountain Dwelling' } }
    ],

    supply: {
      lead: { zh: '与国际品牌直接合作，从源头保证正品品质。', en: 'We work directly with international brands, ensuring genuine quality from the source.' },
      rows: [
        { label: { zh: '板材', en: 'Boards' }, brands: 'Kastamonu · Egger · Skin' },
        { label: { zh: '五金', en: 'Hardware' }, brands: 'Blum · Italiana Ferramenta' },
        { label: { zh: '岩板与设备', en: 'Stone & Equipment' }, brands: 'Laminam · HOMAG · REHAU' }
      ]
    },

    /* 订单周期：天数中英共用 */
    lead: [
      { series: { zh: '免漆系列', en: 'Paint-Free Series' }, days: '60–75' },
      { series: { zh: '实木系列', en: 'Solid Wood Series' }, days: '75–90' }
    ],
    leadUnit: { zh: '天', en: 'days' },

    /* 售后维保（质保年数是老板定的默认值） */
    aftercare: {
      lead: { zh: '交付之后，照顾还在继续。', en: 'Care that continues after delivery.' },
      rows: [
        { label: { zh: '入住前', en: 'Before move-in' }, value: { zh: '上门调试一次', en: 'One on-site adjustment visit' } },
        { label: { zh: '每年', en: 'Every year' }, value: { zh: '一次集中维保调试', en: 'One scheduled maintenance visit' } },
        { label: { zh: '五金质保', en: 'Hardware warranty' }, value: { zh: '终身保家', en: 'Lifetime' } },
        { label: { zh: '板材质保', en: 'Panel warranty' }, value: { zh: '1 年', en: '1 year' } }
      ]
    },

    /* 服务流程：五步 */
    process: [
      { title: { zh: '设计与基装交底验收', en: 'Design and site handover' }, note: { zh: '与基装方交底，复核现场条件', en: 'Brief the main contractor and re-check site conditions' } },
      { title: { zh: '安装进场交底', en: 'Installation briefing' }, note: { zh: '分件，清理安装位置，复核尺寸', en: 'Sort the parts, clear the install areas and re-check dimensions' } },
      { title: { zh: '安装作业', en: 'Installation' }, note: { zh: '进群介绍，每日汇报，完工汇报', en: 'A group chat introduction, daily reports and a completion report' } },
      { title: { zh: '专人验收', en: 'Dedicated inspection' }, note: { zh: '逐项验收，签验收回执', en: 'Item-by-item checks with a signed inspection receipt' } },
      { title: { zh: '交付', en: 'Handover' }, note: { zh: '交付使用，进入维保周期', en: 'Ready to use, and into the maintenance period' } }
    ],

    /* 团队页的默认职称（本案团队：名字由销售填，没填的那一行不印） */
    roles: [
      { key: 'designer', zh: '室内设计师', en: 'Interior Designer' },
      { key: 'technical', zh: '技术设计师', en: 'Technical Designer' },
      { key: 'pm', zh: '项目经理', en: 'Project Manager' },
      { key: 'sales', zh: '销售顾问', en: 'Sales Consultant' },
      { key: 'manager', zh: '店长', en: 'Store Manager' }
    ],

    /* 品牌照片（UKIR STUDIO 同一批）：哪一页默认用哪一张 */
    photos: {
      cover:   { src: IMG + 'sail-cover-plank.jpg', w: 1920, h: 1280, note: '灰泥墙前的老木板（没有空间图时的封面）' },
      letter:  { src: IMG + 'sail-hills.jpg', w: 889, h: 1039, note: '草原上走路的人 —— 开场情绪页' },
      brand:   { src: IMG + 'story-lift.jpg', w: 1800, h: 1036, note: '成都溪岸门口 —— 品牌页' },
      craft:   { src: IMG + 'sail-craft.jpg', w: 1755, h: 1038, note: '木格柜细节 —— 工期·保障页' },
      detail:  { src: IMG + 'about-detail.jpg', w: 1079, h: 1348, note: '实木斗柜 —— 章节页' },
      team:    { src: IMG + 'showroom-still.jpg', w: 1333, h: 2000, note: '展厅一角 —— 团队页' },
      showroom:{ src: IMG + 'riccione-showroom.jpg', w: 2049, h: 961, note: '吉隆坡展厅' },
      welcome: { src: IMG + 'sail-closing.jpg', w: 1080, h: 1440, note: '客厅 —— 欢迎回家（封底）' }
    }
  };
})();
