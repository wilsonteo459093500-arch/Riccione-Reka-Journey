/* ============================================================
   案例库 · 精选：一个项目里挑「最好的 N 张」（上传页的精选模式、审核页的「只留最好的 N 张」共用）
   ------------------------------------------------------------
   免费方案只有每月约 2,000 次写入、1 GB 空间，一个项目传几十张差不多的照片很浪费。规则照顺序：
   1. 同一个镜头只留一张：shot 一样（伺服器分好的组），或 dHash 距离 ≤ 8（连拍、微调角度）。
      伺服器分组用 6；这里放宽到 8：1200px 下「手动了一点再拍」的连拍差 7 左右，不同的画面差 17 以上。
      留分数最高的那张。
   2. 分数：横的（宽 ≥ 高 × 1.2）+2；解析度越高越好（到 1200×900 就算满分 2）。
   3. 先分散到不同子文件夹（空间）：照片多的子文件夹先挑，每个子文件夹先挑一张最高分的。
   4. 还不够 N 张：挑跟已经选的「最不像」的（dHash 距离最大），一样不像就挑分数高的。
   纯函数，不碰 DOM：浏览器是 MB.clPick，测试用 vm 载入。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var SAME_SHOT = 8;
  var FULL_PX = 1200 * 900;
  var HEX16 = /^[0-9a-f]{16}$/;

  function pop32(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  // dHash 拆成两个 32 bit 整数（算一次，比对上千张也快）；不是 16 hex 的 → null（跟谁都算最不像）
  function bits(dh) {
    if (!HEX16.test(dh || '')) return null;
    return [parseInt(dh.slice(0, 8), 16) | 0, parseInt(dh.slice(8), 16) | 0];
  }
  function distBits(a, b) {
    if (!a || !b) return 64;
    return pop32(a[0] ^ b[0]) + pop32(a[1] ^ b[1]);
  }
  function dist(a, b) { return distBits(bits(a), bits(b)); }

  // 子文件夹 = 路径去掉档名（'厨房/IMG_1.jpg' → '厨房'；直接放在项目里的 → ''）
  function groupOf(f) {
    var s = String(f || '').replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i > 0 ? s.slice(0, i) : '';
  }

  function score(it) {
    var w = +it.w || 0, h = +it.h || 0;
    var s = 0;
    if (w && h && w >= h * 1.2) s += 2;
    if (w && h) s += 2 * Math.min(1, (w * h) / FULL_PX);
    return s;
  }

  /* 同一个镜头分成一组，每组留一张（分数最高；同分留先来的） */
  function reps(items) {
    var byShot = {};
    var leaders = [];
    items.forEach(function (it) {
      var key = it.shot ? 's:' + it.shot : '';
      var lead = key && byShot[key];
      var b = BITS[it.id];
      if (!lead) {
        for (var i = 0; i < leaders.length; i++) {
          if (distBits(b, leaders[i].bits) <= SAME_SHOT) { lead = leaders[i]; break; }
        }
      }
      if (lead) {
        lead.members.push(it);
        if (score(it) > lead.score) { lead.best = it; lead.score = score(it); }
        if (key) byShot[key] = lead;
        return;
      }
      var g = { bits: b, best: it, score: score(it), members: [it] };
      leaders.push(g);
      if (key) byShot[key] = g;
    });
    return leaders.map(function (g) { return g.best; });
  }

  /**
   * best(items, n) → 挑出来的 id（照挑的顺序：越前面越好）
   * items: [{id, w, h, dh, shot?, f?}]  f = 项目里的路径（拿来分子文件夹）
   */
  var BITS = {};
  function best(items, n) {
    n = Math.max(0, n | 0);
    var list = (items || []).filter(function (it) { return it && it.id != null; });
    if (!n || !list.length) return [];
    BITS = {};
    list.forEach(function (it) { BITS[it.id] = bits(it.dh); });
    var cands = reps(list);
    cands.sort(function (a, b) { return score(b) - score(a); });
    var picked = [];
    var taken = {};
    function take(it) { picked.push(it); taken[it.id] = 1; }

    // 3. 每个子文件夹先一张（照片多的子文件夹先）
    var groups = {}, order = [];
    list.forEach(function (it) {
      var g = groupOf(it.f);
      if (!groups[g]) { groups[g] = { n: 0, cands: [] }; order.push(g); }
      groups[g].n++;
    });
    cands.forEach(function (it) { groups[groupOf(it.f)].cands.push(it); });
    order.sort(function (a, b) { return groups[b].n - groups[a].n; });
    for (var i = 0; i < order.length && picked.length < n; i++) {
      var c = groups[order[i]].cands[0];
      if (c) take(c);
    }
    // 4. 跟已经选的最不像的
    while (picked.length < n) {
      var bestIt = null, bestD = -1, bestS = -1;
      for (var j = 0; j < cands.length; j++) {
        var it = cands[j];
        if (taken[it.id]) continue;
        var d = 64;
        for (var k = 0; k < picked.length; k++) d = Math.min(d, distBits(BITS[it.id], BITS[picked[k].id]));
        var s = score(it);
        if (d > bestD || (d === bestD && s > bestS)) { bestIt = it; bestD = d; bestS = s; }
      }
      if (!bestIt) break;
      take(bestIt);
    }
    BITS = {};
    return picked.map(function (it) { return it.id; });
  }

  MB.clPick = { best: best, dist: dist, groupOf: groupOf, score: score, SAME_SHOT: SAME_SHOT, DEFAULT_N: 6 };
})();
