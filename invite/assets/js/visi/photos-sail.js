/* ============================================================
   VISI · 溪岸真实案例（内置图库；VISI 体检计划第 3 阶段）
   ------------------------------------------------------------
   老板 / 设计师在公司案例库每个空间挑约 20 张 →「导出给 VISI」→ zip →
   Claude 跑 tools/visi/import-builtin.mjs 放进来。不要手改下面那段清单：脚本会读、会接着加。
   - 照片在 assets/img/sail/<id>.jpg，id = 原档 sha256 前 16 码：看不出客户、项目、档名；拍摄资料已经去掉
   - series 一律空：风格对得上哪个系列只是「看起来像」，不上系列页（跟 photos.js 的规矩一样）
   - 说明只写「风格 + 空间」（原木厨房），AI 写的描述不印给客户
   - 同一张（连拍、裁切）：tools/visi/same-shot.mjs --write 在那一行写 shot = 带头那张的 id，
     model.js 当成同一张，整份方案只出现一次
   - 老板退回的：tools/visi/retire.mjs 在那一行加 retired: 'owner' → 下面自动放进 MB.RETIRED_BUILTIN
     （图库、自动配图看不到；旧方案照样印得出来、体检提醒换掉）。档案留着、不删、不改名
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var SAIL = /* SAIL-PHOTOS-BEGIN */[
  ]/* SAIL-PHOTOS-END */;

  var live = [], gone = [];
  SAIL.forEach(function (x) {
    // 拿掉的照片不带说明、不带空间（跟 photos.js 的 gone() 一样）：「已拿掉的照片」不能印给客户
    if (x.retired) gone.push({ id: x.id, src: x.src, w: x.w, h: x.h, series: '', style: '', rooms: [], retired: x.retired, en: '', zh: '' });
    else live.push(x);
  });
  MB.BUILTIN = (MB.BUILTIN || []).concat(live);
  MB.RETIRED_BUILTIN = (MB.RETIRED_BUILTIN || []).concat(gone);
})();
