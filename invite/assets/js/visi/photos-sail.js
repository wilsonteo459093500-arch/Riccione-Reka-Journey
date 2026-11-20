/* ============================================================
   VISI · 溪岸真实案例（内置图库；VISI 体检计划第 3 阶段）
   ------------------------------------------------------------
   老板 / 设计师在公司案例库每个空间挑约 20 张 →「导出给 VISI」→ zip →
   Claude 跑 tools/visi/import-builtin.mjs 放进来。不要手改下面那段清单：脚本会读、会接着加。
   - 照片在 assets/img/sail/<id>.jpg，id = 原档 sha256 前 16 码：看不出客户、项目、档名；拍摄资料已经去掉
   - series 一律空：风格对得上哪个系列只是「看起来像」，不上系列页（跟 photos.js 的规矩一样）
   - 说明只写「风格 + 空间」（原木厨房），AI 写的描述不印给客户
   - 老板退回的：照 photos.js 的做法，移到 MB.RETIRED_BUILTIN（owner），档案留着、不改名
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var SAIL = /* SAIL-PHOTOS-BEGIN */[
  ]/* SAIL-PHOTOS-END */;

  MB.BUILTIN = (MB.BUILTIN || []).concat(SAIL);
})();
