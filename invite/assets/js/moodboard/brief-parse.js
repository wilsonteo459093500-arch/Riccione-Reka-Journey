/* ============================================================
   Moodboard 生成器 · 读需求卡
   ------------------------------------------------------------
   客户在 brief.html 填完，WhatsApp 上收到的是一段
   「【溪岸 · 客户需求卡】…」文字。整段贴进来，这里把它拆回字段，
   再换算成方案的起手设定：客户名 · 楼盘 · 空间 · 风格 · 需求。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  var LABELS = {
    '姓名': 'name', 'WhatsApp': 'wa', '楼盘 / 单位': 'project', '面积': 'size', '房型': 'ptype',
    '状态': 'status', '拿钥匙 / 入伙': 'keys', '硬装进度': 'reno', '定制范围': 'scope', '风格倾向': 'style',
    '参考图': 'ref', '家庭构成': 'family', '还有谁': 'household', '做饭频率': 'cook', '收纳压力': 'storage',
    '最想解决': 'pain', '预算带': 'budget', '决策人': 'decider', '平面图': 'plan', '期望时间': 'timeline',
    '方便到馆': 'visitPref', '补充': 'note', '接待': 'host'
  };
  var LISTS = { scope: 1, style: 1, household: 1, storage: 1, visitPref: 1 };
  /* 巴生谷常见的镇区名 —— 用来分辨「楼盘」和「区域」 */
  var TOWNS = /^(Setia Alam|Shah Alam|Klang|Bukit Jelutong|Kota Kemuning|Bukit Rimau|Puchong|Subang( Jaya)?|USJ|Petaling Jaya|PJ|Damansara.*|Mont Kiara|Bangsar.*|Cheras|Kajang|Cyberjaya|Putrajaya|Seri Kembangan|Rawang|Sungai Buloh|Kuala Lumpur|KL|Ampang|Setapak|Seremban|Semenyih|Bandar.*|Kota Damansara|Ara Damansara|Glenmarie)$/i;

  /** 需求卡文字 → { name, project, scope:[], … }；认不出来返回 null */
  MB.parseBrief = function (text) {
    if (!text || !/[:：]/.test(text)) return null;
    var out = {}, hit = 0, last = null;
    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      var m = line.match(/^([^:：]{1,14})[:：]\s*(.*)$/);
      var key = m && LABELS[m[1].trim()];
      if (!key) {
        // 「最想解决」「补充」是客户自己打的多行字：没有标签的下一行接在后面
        var structural = !line || /^〔.*〕$/.test(line) || /^[—\-]{3,}/.test(line) || /^【.*】$/.test(line) || /^（由.*生成）$/.test(line);
        if (structural || m) { last = null; return; }
        if (last === 'pain' || last === 'note') out[last] += '\n' + line;
        return;
      }
      last = key;
      var v = m[2].trim();
      if (!v) return;
      hit++;
      out[key] = LISTS[key] ? v.split(/[、,，]\s*/).filter(Boolean) : v;
    });
    if (out.size) out.size = out.size.replace(/\s*sq\s*ft\s*$/i, '');
    return hit >= 2 ? out : null;
  };

  function has(list, word) {
    list = [].concat(list || []);
    for (var i = 0; i < list.length; i++) if (String(list[i]).indexOf(word) > -1) return true;
    return false;
  }

  /** 拆好的需求卡 → 方案起手设定（不碰销售已经改过的东西，交给 app 合并） */
  MB.briefToSetup = function (b) {
    var setup = { client: {}, property: {}, rooms: [], needs: [], direction: null };
    if (b.name) setup.client.names = b.name;
    if (b.wa) setup.client.wa = MB.msisdn(b.wa);

    if (b.project) {
      // 「楼盘, Setia Alam」/「Setia Alam · 楼盘 B-12-3」→ 楼盘 + 区域（顺序两种都认）
      var parts = b.project.split(/\s*[,，·|/]\s*/).filter(Boolean);
      var townAt = -1;
      parts.forEach(function (s, i) { if (townAt < 0 && TOWNS.test(s)) townAt = i; });
      if (townAt > -1 && parts.length > 1) {
        setup.property.area = parts[townAt];
        setup.property.name = parts.filter(function (s, i) { return i !== townAt; }).join(', ');
      } else {
        setup.property.name = parts[0];
        if (parts.length > 1) setup.property.area = parts.slice(1).join(', ');
      }
    }
    if (b.size) setup.property.size = b.size;
    if (b.ptype) setup.property.type = b.ptype.replace(/^[^A-Za-z]*\s*/, '') || b.ptype;

    // 空间：定制范围 → 房间（去重，保持 MB.ROOMS 的顺序）
    var want = {};
    (b.scope || []).forEach(function (s) {
      MB.SCOPE_ROOMS.forEach(function (rule) {
        if (s.indexOf(rule.match) > -1) rule.rooms.forEach(function (k) { want[k] = 1; });
      });
    });

    // 需求：做饭 / 收纳 / 同住 → 「你说的 · 我们做的」
    Object.keys(MB.NEEDS).forEach(function (k) {
      var n = MB.NEEDS[k];
      var v = b[n.field];
      if (v && has(v, n.match)) {
        setup.needs.push({ key: k });
        want[n.room] = want[n.room] || 2; // 需求点到的空间也带上
      }
    });
    if (b.pain) {
      // 客户自己写的痛点放最前面 —— 原话比我们归纳的选项更有分量
      var own = String(b.pain).split(/[；;。\n]+/).map(function (s) { return s.trim(); }).filter(Boolean)
        .slice(0, 3).map(function (s) {
          var room = MB.guessPainRoom(s);
          if (room) want[room] = want[room] || 2;
          return { quote: s, answer: '', room: room };
        });
      setup.needs = own.concat(setup.needs);
    }

    setup.rooms = MB.ROOMS.map(function (r) { return r.key; }).filter(function (k) { return want[k]; });

    // 风格：取第一个对得上的
    (b.style || []).some(function (s) {
      for (var i = 0; i < MB.STYLE_DIRECTION.length; i++) {
        if (s.indexOf(MB.STYLE_DIRECTION[i].match) > -1) { setup.direction = MB.STYLE_DIRECTION[i].dir; return true; }
      }
      return false;
    });

    setup.visitPref = b.visitPref || [];
    setup.raw = b;
    return setup;
  };
})();
