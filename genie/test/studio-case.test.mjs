// npm test —— 把参考案例「实现」在客人自己的家里（SPEC §8、§15.4，STUDIO）：
//   realise.js（锁住的表面一个都不动、只调软装、雷区只换没锁的、明暗建议从不自动套用、只做几个房间的案例）·
//   furnish 的家具风格 · readPlan（假的 AI + 录好的回答 = 业主的 TYPE B 照片；没有 key → 粗读）·
//   handoff（链接里的小平面图 ≤ 6,000 字、过期）· store（旧方案 / 旧链接原样读、方案带参考案例不带照片）。
// 纯 Node：不连 Gemini（AI 是假的），localStorage / IndexedDB 用假的。

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// store.js 要用 localStorage（假的；handoff.js 没有 indexedDB 时自己退回内存）
const LS = new Map();
globalThis.localStorage = { getItem: (k) => (LS.has(k) ? LS.get(k) : null), setItem: (k, v) => LS.set(k, String(v)), removeItem: (k) => LS.delete(k) };

const { SOFT_SLOTS, LOCKABLE, locksOf, realiseCase, harmonise, caseBase } = await import('../src/shared/realise.js');
const { MAT_BY_ID, SLOT_BY_ID, fits } = await import('../src/shared/materials.js');
const { tagsOf, MOOD_BY_ID } = await import('../src/shared/moods.js');
const { DREAMER_BY_CODE } = await import('../src/shared/dreamers.js');
const { avoidMaterials } = await import('../src/shared/profile.js');
const { CONFIG } = await import('../src/shared/config.js');
const { furnish } = await import('../src/studio/engine/furnish.js');
const { templatePlan, migratePlan, TEMPLATES } = await import('../src/studio/plan/model.js');
const H = await import('../src/shared/handoff.js');
const Store = await import('../src/studio/store.js');
const RP = await import('../src/studio/guest/readPlan.js');
const S = await import('../src/studio/plan/sheet.js');
const { decodePNG } = await import('./fixtures/walls/harness.mjs');
const { JpegImage } = await import('pdfjs-dist/image_decoders/pdf.image_decoders.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(ROOT, 'test/fixtures/ai');
const J = (n) => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/cases/manifest.json'), 'utf8'));
const CASES = MANIFEST.cases;
const caseById = (id) => CASES.find((c) => c.id === id);

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}
const t0 = Date.now();

// 客人家里留下来的几组（K 屏能选的色卡，slot 做 key —— home.js keepLocks 的形状）
const KEEPS = [
  {},
  { floor: 'cream-tile' },
  { floor: 'walnut', walls: 'latte' },
  { floor: 'cream-tile', walls: 'warm-white', upholstery: 'grey-wool' },
  { floor: 'light-oak', walls: 'sage', cabinetry: 'white-lacquer', upholstery: 'cognac-leather' },
  { floor: 'grey-tile', walls: 'gallery-white', cabinetry: 'walnut' },
  { floor: 'terrazzo', walls: 'dusty-blue', cabinetry: 'black-matte', upholstery: 'navy-velvet' },
  { floor: 'carrara', walls: 'oat', cabinetry: 'sage-lacquer', upholstery: 'boucle' },
];
// 客人：雷区 / 生活方式 / 牌
const GUESTS = [
  { id: 'g0', code: 'WMNH', avoid: [], life: {} },
  { id: 'g1', code: 'CMRD', avoid: ['marble', 'velvet'], life: { who: ['cat'], cook: 'heavy' } },
  { id: 'g2', code: 'WLND', avoid: ['grey', 'black'], life: { who: ['kids', 'dog'] } },
  { id: 'g3', code: 'CLRH', avoid: ['rattan', 'pink', 'gloss'], life: { cook: 'light' } },
];

console.log('实现参考案例（realise.js）');

await test('种子案例都在、材质 id 都放得上那个表面（realise 的输入是干净的）', () => {
  assert.ok(CASES.length >= 10);
  for (const c of CASES) for (const [slot, id] of Object.entries(c.materials || {})) assert.ok(MAT_BY_ID[id] && fits(id, slot), `${c.id}.${slot} = ${id}`);
});

await test('locksOf：只收放得上那个表面的真材质；"unsure" / null / 乱写 / 放不上（地板 = 亚麻）都不锁；K 屏 id（sofa）也认', () => {
  assert.deepEqual(locksOf({ floor: 'walnut', walls: 'unsure', cabinetry: null, upholstery: 'nope' }), { floor: 'walnut' });
  assert.deepEqual(locksOf({ floor: 'linen' }), {});
  assert.deepEqual(locksOf({ sofa: 'boucle' }), { upholstery: 'boucle' });
  assert.deepEqual(locksOf(null), {});
  assert.deepEqual(locksOf('walnut'), {});
  assert.deepEqual(Object.values(LOCKABLE).sort(), ['cabinetry', 'floor', 'upholstery', 'walls']);
});

await test('锁住的表面一个都不动：10 个案例 × 8 组留下来的颜色 × 4 位客人（雷区、宠物、爆炒、小孩）× 调和 / 原样', () => {
  let combos = 0;
  for (const c of [...CASES, null])
    for (const keep of KEEPS)
      for (const g of GUESTS)
        for (const raw of [false, true]) {
          const r = realiseCase({ caseObj: c, keep, profile: g, raw });
          assert.deepEqual(r.locked, locksOf(keep));
          for (const [slot, id] of Object.entries(locksOf(keep))) assert.equal(r.materials[slot], id, `${c?.id}/${slot}`);
          for (const sw of r.softened) assert.ok(!r.locked[sw.slot], `softened a locked slot ${sw.slot}`);
          // 每个表面都是放得上的真材质
          for (const [slot, id] of Object.entries(r.materials)) assert.ok(MAT_BY_ID[id] && fits(id, slot), `${c?.id} ${slot}=${id}`);
          combos++;
        }
  assert.ok(combos > 600);
});

await test('锁住的表面踩到雷区也不换（那是客人家的现实）；没锁的照样避开', () => {
  const g = { code: 'WMNH', avoid: ['marble'] };
  const c = caseById('seed-softluxe-semid');
  const r = realiseCase({ caseObj: c, keep: { floor: 'carrara' }, profile: g });
  assert.equal(r.materials.floor, 'carrara');
  assert.ok(tagsOf(MAT_BY_ID.carrara).has('marble'));
  for (const [slot, id] of Object.entries(r.materials)) if (slot !== 'floor') assert.ok(!tagsOf(MAT_BY_ID[id]).has('marble') || avoidMaterials({ [slot]: id }, ['marble']).materials[slot] === id, `${slot}=${id} still marble`);
});

await test('雷区 / 生活方式只换没锁的：换过的都记在 softened（avoid / pets / cooking / kids），而且不比只跑 avoidMaterials 差', () => {
  for (const c of CASES)
    for (const keep of KEEPS)
      for (const g of GUESTS.filter((x) => x.avoid.length)) {
        const r = realiseCase({ caseObj: c, keep, profile: g });
        const start = { ...caseBase(c, g), ...locksOf(keep) };
        const ref = avoidMaterials(start, g.avoid).materials;
        for (const [slot, id] of Object.entries(r.materials)) {
          if (r.locked[slot]) continue;
          const hits = [...tagsOf(MAT_BY_ID[id])].filter((x) => g.avoid.includes(x));
          // 还踩着雷区 = avoidMaterials 自己也找不到替代（或者是调和挑的软装 —— 调和只挑不踩雷的，所以不会）
          if (hits.length) assert.ok([...tagsOf(MAT_BY_ID[ref[slot]])].some((x) => g.avoid.includes(x)), `${c.id} ${slot}=${id} hits ${hits}`);
        }
        for (const sw of r.softened) assert.ok(['avoid', 'pets', 'cooking', 'kids', 'temp'].includes(sw.why));
      }
});

await test('调和只动软装（地毯、窗帘、点缀、床品），换上的不踩雷；有锁、色温差 ≥ 0.6 时真的会调', () => {
  let tempHits = 0;
  for (const c of CASES)
    for (const keep of KEEPS)
      for (const g of GUESTS) {
        const r = realiseCase({ caseObj: c, keep, profile: g });
        for (const sw of r.softened.filter((x) => x.why === 'temp')) {
          tempHits++;
          assert.ok(SOFT_SLOTS.includes(sw.slot), `temp on ${sw.slot}`);
          assert.ok(fits(sw.to, sw.slot));
          assert.ok(![...tagsOf(MAT_BY_ID[sw.to])].some((x) => g.avoid.includes(x)), `${sw.to} hits a no-go`);
          assert.equal(r.materials[sw.slot], sw.to);
        }
        if (!Object.keys(locksOf(keep)).length) assert.equal(r.softened.filter((x) => x.why === 'temp').length, 0, 'no locks → no harmonising');
      }
  assert.ok(tempHits > 0, 'some combination should need harmonising');
});

await test('「还原案例原样」（raw）：不调和、没有建议；锁照样在、雷区照样避开', () => {
  for (const c of CASES) {
    const keep = { floor: 'walnut', walls: 'latte', upholstery: 'cognac-leather' };
    const g = GUESTS[1];
    const r = realiseCase({ caseObj: c, keep, profile: g, raw: true });
    assert.equal(r.softened.filter((x) => x.why === 'temp').length, 0);
    assert.deepEqual(r.suggestions, []);
    assert.equal(r.materials.floor, 'walnut');
    assert.equal(r.materials.walls, 'latte');
  }
});

await test('明暗建议从不自动套用：深色地板 + 深色墙 → 建议墙亮一点（还是原来的墙）；深色墙留下来 → 建议浅一点的木地板', () => {
  // 留下胡桃木地板（很深），案例是午夜蓝的墙
  const jazz = caseById('seed-jazz-condo');
  const r = realiseCase({ caseObj: jazz, keep: { floor: 'walnut' }, profile: GUESTS[0] });
  const sg = r.suggestions.find((x) => x.slot === 'walls');
  assert.ok(sg, JSON.stringify(r.suggestions));
  assert.equal(sg.why, 'light');
  assert.equal(r.materials.walls, sg.from, 'suggestion must not be applied');
  assert.ok(MAT_BY_ID[sg.to].light > MAT_BY_ID[sg.from].light);
  // 留下深色墙 + 案例的地板也深
  const h = harmonise({ ...jazz.materials, floor: 'walnut', walls: 'navy-paint' }, { walls: 'navy-paint' }, {});
  const fs2 = h.suggestions.find((x) => x.slot === 'floor');
  assert.ok(fs2 && fs2.why === 'light' && MAT_BY_ID[fs2.to].light > MAT_BY_ID.walnut.light);
  assert.equal(h.materials.floor, 'walnut');
  // 所有组合：建议的那个表面都还是 from
  for (const c of CASES) for (const keep of KEEPS) for (const g of GUESTS) for (const s of realiseCase({ caseObj: c, keep, profile: g }).suggestions) assert.equal(realiseCase({ caseObj: c, keep, profile: g }).materials[s.slot], s.from);
});

await test('harmonise 没有锁 → 原样返回；纯函数（不改传进来的对象）', () => {
  const m = { ...MOOD_BY_ID.bright.materials };
  const copy = JSON.stringify(m);
  const h = harmonise(m, {}, { avoid: ['grey'] });
  assert.deepEqual(h.materials, m);
  assert.deepEqual(h.softened, []);
  assert.deepEqual(h.suggestions, []);
  const locked = { floor: 'walnut' };
  harmonise(m, locked, {});
  assert.equal(JSON.stringify(m), copy);
  assert.deepEqual(locked, { floor: 'walnut' });
});

await test('全屋案例：温暖预设 ⊕ 案例主牌 ⊕ 案例写的；情绪、时间、家具风格跟着案例；caseId / rev', () => {
  for (const c of CASES) {
    const r = realiseCase({ caseObj: c, keep: {}, profile: { code: 'CMRD', avoid: [], life: {} } });
    for (const [slot, id] of Object.entries(c.materials)) if (!['countertop'].includes(slot)) assert.equal(r.materials[slot], id, `${c.id} ${slot}`);
    assert.equal(r.mood, c.mood);
    assert.equal(r.time, c.time);
    assert.deepEqual(r.style, c.furniture || {});
    assert.equal(r.caseId, c.id);
    assert.equal(r.rev, c.rev ?? null);
  }
});

await test('只做几个房间的案例（scope rooms）：只有案例写的那几个表面变，其他是客人自己的牌', () => {
  const g = { code: 'WLND', avoid: [], life: {}, materials: DREAMER_BY_CODE.WLND.materials };
  const c = { id: 'p-kitchen', rev: 2, scope: 'rooms', rooms: ['kitchen'], materials: { cabinetry: 'sage-lacquer', countertop: 'calacatta', tile: 'zellige' }, mood: 'bright', furniture: {} };
  for (const k of Object.keys(c.materials)) if (!MAT_BY_ID[c.materials[k]] || !fits(c.materials[k], k)) delete c.materials[k];
  const r = realiseCase({ caseObj: c, keep: {}, profile: g });
  const mine = realiseCase({ caseObj: null, keep: {}, profile: g });
  for (const slot of Object.keys(SLOT_BY_ID)) {
    if (c.materials[slot]) assert.equal(r.materials[slot], c.materials[slot], slot);
    else assert.equal(r.materials[slot], mine.materials[slot], `${slot} should stay the guest's`);
  }
});

await test('我的牌（caseObj null）= 温暖预设 ⊕ 梦想家 ⊕ 客人的材质；情绪 dreamer', () => {
  const g = { code: 'CLNH', avoid: [], life: {} };
  const r = realiseCase({ caseObj: null, keep: {}, profile: g });
  for (const [slot, id] of Object.entries(DREAMER_BY_CODE.CLNH.materials)) assert.equal(r.materials[slot], id);
  assert.equal(r.mood, 'dreamer');
  assert.equal(r.caseId, null);
});

console.log('家具风格（furnish style）');

const kinds = (items, kind) => items.filter((i) => i.kind === kind).map((i) => i.variant);

await test('没写风格 = 今天的摆法（一模一样）；认不得的值不理', () => {
  for (const tid of Object.keys(TEMPLATES)) {
    const p = templatePlan(tid);
    // 家具 id 每次都是新的（uid）：比较时拿掉
    const noId = (items) => JSON.stringify(items.map(({ id, ...rest }) => rest));
    const a = noId(furnish(p, undefined, null));
    assert.equal(noId(furnish(p, undefined, null, {})), a);
    assert.equal(noId(furnish(p, undefined, null, { style: {} })), a);
    assert.equal(noId(furnish(p, undefined, null, { style: { sofa: 'banana', plants: 7, displayPct: 'x', handle: 'gold' } })), a);
  }
});

await test('沙发：curvy / lshape（客厅放得下）；餐桌 round / rect；茶几 stone、地毯 round', () => {
  const condo = templatePlan('condo3');
  assert.equal(kinds(furnish(condo, undefined, null, { style: { sofa: 'curvy' } }), 'sofa')[0], 'curvy');
  assert.equal(kinds(furnish(condo, undefined, null, { style: { sofa: 'lshape' } }), 'sofa')[0], 'lshape');
  assert.ok(kinds(furnish(condo, undefined, null, { style: { diningTable: 'round' } }), 'diningTable').includes('round'));
  assert.ok(kinds(furnish(condo, undefined, null, { style: { diningTable: 'rect' } }), 'diningTable').every((v) => v === 'rect'));
  const terr = templatePlan('terrace2');
  assert.equal(kinds(furnish(terr, undefined, null, { style: { sofa: 'lshape' } }), 'sofa')[0], 'lshape');
  const st = furnish(terr, undefined, null, { style: { coffeeTable: 'stone', rug: 'round' } });
  assert.ok(kinds(st, 'coffeeTable').every((v) => v === 'stone'));
  assert.ok(kinds(st, 'rug').includes('round'));
});

await test('绿植 few < 默认 < many；展示柜 displayPct 50 → 有展示柜；每件家具都有 floor', () => {
  for (const tid of ['condo3', 'terrace2', 'semid2']) {
    const p = templatePlan(tid);
    const cnt = (style) => furnish(p, undefined, null, { style }).filter((i) => i.kind === 'plant').length;
    const base = cnt({});
    assert.ok(cnt({ plants: 'few' }) < base, `${tid} few`);
    assert.ok(cnt({ plants: 'many' }) > base, `${tid} many`);
    for (const it of furnish(p, undefined, null, { style: { plants: 'many', sofa: 'curvy' } })) assert.ok(it.floor, `${tid} ${it.kind} no floor`);
  }
  const disp = furnish(templatePlan('condo3'), undefined, null, { style: { displayPct: 50 } }).filter((i) => i.kind === 'displayCabinet').length;
  assert.ok(disp >= 1);
});

await test('尺寸规则优先：小公寓（studio）要 L 形也只放得下它放得下的；窄餐厅永远是圆桌', () => {
  const p = templatePlan('studio');
  const items = furnish(p, undefined, null, { style: { sofa: 'lshape', diningTable: 'rect' } });
  assert.ok(items.filter((i) => i.kind === 'sofa').length >= 1);
  // 每一件都在自己的房间里（没有因为风格被硬塞出房间）
  const rooms = new Map(migratePlan(p).floors.flatMap((f) => f.rooms.map((r) => [r.id, r])));
  for (const it of items) {
    const r = rooms.get(it.room);
    if (!r || it.kind === 'curtain') continue;
    assert.ok(it.x >= r.x - 0.05 && it.x <= r.x + r.w + 0.05 && it.z >= r.y - 0.05 && it.z <= r.y + r.d + 0.05, `${it.kind} outside ${r.type}`);
  }
});

await test('种子案例的家具风格放进 4 个模板都摆得出来（客厅有沙发）', () => {
  for (const c of CASES) {
    const items = furnish(templatePlan(c.template || 'condo3'), undefined, { code: c.style.dreamers[0] }, { style: c.furniture });
    assert.ok(items.some((i) => i.kind === 'sofa'), c.id);
  }
});

await test('业主 TYPE B（许愿模式拍照读出来的）：客厅一边是落地趟门、对面是卧室门、一边开向餐厅 → 照样有沙发；有电视墙就一定有坐的地方', () => {
  const plan = migratePlan(J('typeb-camera-plan.json'));
  const living = plan.floors[0].rooms.find((r) => r.type === 'living');
  for (const g of GUESTS)
    for (const c of [null, ...CASES]) {
      const items = furnish(plan, undefined, g, c ? { style: c.furniture } : {});
      const mine = items.filter((i) => i.room === living.id);
      assert.ok(mine.filter((i) => i.kind === 'sofa').length >= 1, `${g.code || g.id} × ${c?.id || '我的牌'}: ${mine.map((i) => i.kind)}`);
    }
  // 所有模板、所有读出来的平面：客厅有电视墙就有沙发
  for (const p of [plan, ...Object.keys(TEMPLATES).map((t) => migratePlan(templatePlan(t)))])
    for (const g of GUESTS) {
      const items = furnish(p, undefined, g);
      for (const r of p.floors.flatMap((f) => f.rooms).filter((x) => x.type === 'living')) {
        const kinds = items.filter((i) => i.room === r.id).map((i) => i.kind);
        if (kinds.includes('tvWall')) assert.ok(kinds.includes('sofa'), `${r.id}: ${kinds}`);
      }
    }
});

console.log('读客人的户型图（readPlan，假的 AI）');

function decodeJpeg(file) {
  const jp = new JpegImage();
  jp.parse(new Uint8Array(fs.readFileSync(file)));
  return { width: jp.width, height: jp.height, data: jp.getData({ width: jp.width, height: jp.height, forceRGB: true, isSourcePDF: false }) };
}
// planImage.js 在 Node 里的替身（canvas / pdfjs 都换成纯 JS 的解码 + sheet.js 的像素函数）
const IMG = {
  async openPlanFile(file) {
    if (file.bad) throw new Error('decode');
    let img = file.png ? decodePNG(fs.readFileSync(file.path)) : decodeJpeg(file.path);
    let photo = false;
    if (file.photo) {
      const r = S.rectifyEstimate(img);
      if (r?.significant) {
        img = S.warpImage(img, r.Hinv, r.width, r.height);
        photo = true;
      }
    }
    return { kind: 'image', pages: 1, img, width: img.width, height: img.height, photo, screenshot: false };
  },
  async findPlanPagesText() {
    return { hasText: false, pages: [{ page: 1, score: 0 }] };
  },
  async renderPage(s) {
    return { src: 'data:image/jpeg;base64,x', width: s.width, height: s.height, page: 1, map: { scale: 1, ox: 0, oy: 0 }, _img: s.img };
  },
  async renderRegion(s, _n, rects) {
    const maxL = Math.max(...rects.map((u) => Math.max(u.x1 - u.x0, u.y1 - u.y0)));
    const f = maxL < 1400 ? 2 : 1;
    return rects.map((u) => {
      const CW = Math.round((u.x1 - u.x0) * f);
      const CH = Math.round((u.y1 - u.y0) * f);
      let im = S.warpImage(s.img, [1 / f, 0, u.x0, 0, 1 / f, u.y0, 0, 0, 1], CW, CH);
      if (s.photo) im = S.enhance(im);
      return { src: 'data:image/jpeg;base64,x', width: CW, height: CH, srcScale: f, _img: im };
    });
  },
  async cropPixels(crop, { aspect = 1 } = {}) {
    const im = crop._img;
    if (Math.abs(aspect - 1) < 1e-6) return im;
    const H2 = Math.round(im.height * aspect);
    return S.warpImage(im, [1, 0, 0, 0, im.height / H2, 0, 0, 0, 1], im.width, H2);
  },
  async cvWalls(img, pxPerM, W2) {
    let walls = null;
    try {
      walls = W2.extractWalls(img, { pxPerM });
    } catch {
      walls = null;
    }
    return { ink: S.inkMask(img), walls };
  },
  closePlanFile() {},
};
// 假的 AI：录好的业主 TYPE B 回答（第一遍找图、第二遍读房间）；记下被叫了几次
const calls = { find: 0, read: 0 };
const AIM = {
  async findPlans(set, image) {
    calls.find++;
    assert.equal(set.apiKey, 'test-key-not-real');
    return { found: S.normalizeFound(J('pass1-owner.json'), image.width, image.height) };
  },
  async readFloors(set, items, { onProgress } = {}) {
    calls.read++;
    return items.map((it) => {
      onProgress?.(it.key, 'done');
      return { key: it.key, ok: true, read: J('pass2-owner.json') };
    });
  },
};
const OWNER = { path: path.join(FX, 'owner-type-b-photo.jpg'), photo: true };
const HINT = { type: 'condo', sizeSqft: 1300, bedrooms: 3, bathrooms: 2, storeys: 1 };
const SAFE = (s) => !/AI|Gemini|key|API|模型|设置|密钥/i.test(s || '');

await test('有 key（假的 AI）：业主的 TYPE B 照片 → ok、source ai、≥ 3 房、≥ 2 卫；进度 open → find → read → walls → assemble → done', async () => {
  const st = [];
  const r = await RP.readPlan(OWNER, { ai: AIM, img: IMG, settings: { apiKey: 'test-key-not-real' }, hint: HINT, onProgress: (p) => st.push(p) });
  assert.equal(r.status, 'ok', JSON.stringify({ s: r.status, c: r.confidence, i: r.issues }));
  assert.equal(r.source, 'ai');
  assert.ok(r.summary.bedrooms >= 3, JSON.stringify(r.summary));
  assert.ok(r.summary.bathrooms >= 2);
  assert.ok(r.confidence >= RP.QUALITY_MIN);
  assert.equal(calls.find, 1);
  assert.equal(calls.read, 1);
  const stages = [...new Set(st.map((p) => p.stage))];
  for (const s of ['open', 'find', 'read', 'walls', 'assemble', 'done']) assert.ok(stages.includes(s), `stage ${s} in ${stages}`);
  assert.equal(st.at(-1).pct, 100);
  assert.ok(st.every((p) => p.pct >= 0 && p.pct <= 100 && Number.isFinite(p.etaSec)));
  // 读出来的是合法的 v2 平面图，摆得上家具
  const plan = migratePlan(r.plan);
  assert.ok(plan.floors[0].rooms.length >= 6);
  assert.ok(furnish(plan, undefined, null).length > 10);
  for (const i of r.issues) assert.ok(SAFE(i.zh), i.zh);
  // R 屏改名 / 删房间（L 形的几块算一间）
  const bed = plan.floors[0].rooms.find((x) => x.type === 'bedroom');
  const re = RP.relabelRoom(plan, bed.id, 'kids');
  assert.equal(re.floors[0].rooms.find((x) => x.id === bed.id).type, 'kids');
  const rm = RP.removeRoom(plan, bed.id);
  assert.ok(!rm.floors[0].rooms.some((x) => x.id === bed.id));
  assert.ok(RP.GUEST_ROOM_TYPES.includes('kids') && RP.GUEST_ROOM_TYPES.length === 14);
});

await test('没有 key（客人自己的手机）：只用图上的墙 → rough | unreadable，source cv；不提 AI / key', async () => {
  const r = await RP.readPlan({ path: path.join(ROOT, 'test/fixtures/walls/condo-hollow.png'), png: true }, { img: IMG, settings: { apiKey: '' }, hint: { type: 'condo', sizeSqft: 1200, bedrooms: 3, bathrooms: 2, storeys: 1 } });
  assert.ok(['rough', 'unreadable'].includes(r.status), r.status);
  if (r.status === 'rough') {
    assert.equal(r.source, 'cv');
    assert.ok(r.summary.rooms >= 3);
    assert.ok(r.confidence <= 0.6 + 1e-9);
    for (const rm of migratePlan(r.plan).floors[0].rooms) assert.ok(RP.GUEST_ROOM_TYPES.includes(rm.type) || rm.type === 'corridor' || rm.type === 'stair', rm.type);
  }
  for (const i of r.issues) assert.ok(SAFE(i.zh), i.zh);
  assert.equal(RP.canReadWithAI(), false, 'no key on this device');
});

await test('打不开的图 → error（客人看得懂的一句）；取消（AbortSignal）→ cancelled；没给文件 → error', async () => {
  const bad = await RP.readPlan({ bad: true }, { img: IMG, ai: false, hint: HINT });
  assert.equal(bad.status, 'error');
  assert.ok(bad.issues.length && SAFE(bad.issues[0].zh));
  const ac = new AbortController();
  ac.abort();
  const c = await RP.readPlan(OWNER, { img: IMG, ai: AIM, settings: { apiKey: 'test-key-not-real' }, signal: ac.signal, hint: HINT });
  assert.equal(c.status, 'cancelled');
  assert.equal((await RP.readPlan(null, { img: IMG })).status, 'error');
});

// 几页的 PDF（一楼一页、二楼一页）在 Node 里的替身：每页一张图；裁图 = 那一页的一块（pxPerUnit = 放大倍数）
function pdfIMG(pages, { text = null } = {}) {
  const calls = { render: [] };
  return {
    calls,
    async openPlanFile() {
      return { kind: 'pdf', pages: pages.length, imgs: pages };
    },
    async findPlanPagesText() {
      return text || { hasText: false, pages: pages.map((_, i) => ({ page: i + 1, score: 0, levels: [] })) };
    },
    async renderPage(s, no) {
      calls.render.push(no);
      const im = s.imgs[no - 1];
      return { src: 'data:image/png;base64,x', width: im.width, height: im.height, page: no, map: { scale: 1, ox: 0, oy: 0 }, _img: im };
    },
    async renderRegion(s, no, rects) {
      const img = s.imgs[no - 1];
      const maxL = Math.max(...rects.map((u) => Math.max(u.x1 - u.x0, u.y1 - u.y0)));
      const f = Math.min(2, 3072 / maxL);
      return rects.map((u) => {
        const CW = Math.round((u.x1 - u.x0) * f);
        const CH = Math.round((u.y1 - u.y0) * f);
        return { src: 'data:image/png;base64,x', width: CW, height: CH, srcScale: f, pxPerUnit: f, _img: S.warpImage(img, [1 / f, 0, u.x0, 0, 1 / f, u.y0, 0, 0, 1], CW, CH) };
      });
    },
    cropPixels: IMG.cropPixels,
    cvWalls: IMG.cvWalls,
    closePlanFile() {},
  };
}
const WFX = (n) => decodePNG(fs.readFileSync(path.join(ROOT, 'test/fixtures/walls', n)));
const TERRACE2 = { type: 'terrace', sizeSqft: 1880, bedrooms: 4, bathrooms: 3, storeys: 2 };

await test('两页的 PDF（一楼一页、二楼一页，没有 key）→ 两层、楼梯连上、楼上没有厨房；客人说只有一层 → 只读一页（和以前一样）', async () => {
  const pages = [WFX('terrace-gf-pdf.png'), WFX('terrace-ff-pdf.png')];
  const st = [];
  const r = await RP.readPlan({ name: 'plan.pdf' }, { img: pdfIMG(pages), ai: false, hint: TERRACE2, onProgress: (p) => st.push(p) });
  assert.equal(r.status, 'rough', JSON.stringify({ s: r.status, i: r.issues }));
  assert.equal(r.source, 'cv');
  assert.equal(r.summary.floors, 2, JSON.stringify(r.summary));
  const plan = migratePlan(r.plan);
  assert.equal(plan.floors.length, 2);
  assert.ok(plan.stairs.length >= 1, 'a stair joins the two floors');
  assert.ok(plan.floors.every((f) => f.rooms.filter((x) => !x.stairId).length >= 4), 'rooms on both floors');
  assert.ok(!plan.floors[1].rooms.some((x) => ['kitchen', 'dining', 'living'].includes(x.type)), 'no kitchen upstairs');
  assert.ok(plan.floors[0].rooms.some((x) => x.type === 'living'), 'living downstairs');
  assert.ok(r.summary.bedrooms >= 3, JSON.stringify(r.summary));
  // 房间 id 不重复（R 屏改名只改那一间）；两层的底图都在
  const ids = plan.floors.flatMap((f) => f.rooms.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(Object.keys(r.underlays).sort(), plan.floors.map((f) => f.id).sort());
  assert.ok(!r.issues.some((i) => i.code === 'floors'));
  assert.deepEqual(RP.floorsRead(r.plan).map((f) => f.zh), ['一楼', '二楼']);
  assert.ok(st.every((p) => p.pct >= 0 && p.pct <= 100) && st.at(-1).pct === 100);
  // 摆得上家具（两层都有）
  const items = furnish(plan, undefined, null);
  assert.equal(new Set(items.map((i) => i.floor)).size, 2);
  // 客人说只有一层（公寓）：只读一页
  const one = pdfIMG(pages);
  const r1 = await RP.readPlan({ name: 'plan.pdf' }, { img: one, ai: false, hint: { ...TERRACE2, storeys: 1 } });
  assert.equal(r1.summary.floors, 1);
  assert.deepEqual(one.calls.render, [1]);
});

await test('一页一层、只读到一层 → issues「你说有 2 层，我只读到 1 层」；再拍下一层（appendFloor）→ 两层', async () => {
  const gf = await RP.readPlan({ name: 'gf.pdf' }, { img: pdfIMG([WFX('terrace-gf-pdf.png')]), ai: false, hint: TERRACE2 });
  assert.equal(gf.summary.floors, 1);
  const fl = gf.issues.find((i) => i.code === 'floors');
  assert.ok(fl && fl.want === 2 && fl.got === 1 && SAFE(fl.zh), JSON.stringify(gf.issues));
  // 楼上那一张：hint.floor = 1（楼上的房间按卧室 / 起居厅猜）
  const ff = await RP.readPlan({ name: 'ff.pdf' }, { img: pdfIMG([WFX('terrace-ff-pdf.png')]), ai: false, hint: { ...TERRACE2, floor: 1 } });
  assert.ok(!migratePlan(ff.plan).floors[0].rooms.some((x) => x.type === 'kitchen'), 'upper floor guessed without a kitchen');
  const both = await RP.appendFloor(gf, ff, { hint: TERRACE2 });
  assert.equal(both.summary.floors, 2);
  assert.ok(!both.issues.some((i) => i.code === 'floors'));
  assert.equal(migratePlan(both.plan).floors.length, 2);
  // 读不出来的下一层 → 原样
  assert.equal(await RP.appendFloor(gf, { status: 'unreadable', plan: null }, { hint: TERRACE2 }), gf);
});

await test('两页的 PDF、有 key（假的 AI）：每页找图、读图 → 按图名的楼层叠成两层（页码反过来也一样）；同一层两页 → 留一页', async () => {
  const gfImg = decodeJpeg(path.join(FX, 'crop-app-gf.jpg'));
  const ffImg = decodeJpeg(path.join(FX, 'crop-app-ff.jpg'));
  const mk = (levels) => {
    const c = { find: 0, read: 0 };
    return {
      c,
      async findPlans(set, image) {
        c.find++;
        const lv = levels[image.page - 1];
        return { found: S.normalizeFound({ plans: [{ title: lv === 'ground' ? 'GROUND FLOOR PLAN' : 'FIRST FLOOR PLAN', level: lv, box_2d: [4, 4, 996, 996] }] }, image.width, image.height) };
      },
      async readFloors(set, items, { onProgress } = {}) {
        c.read++;
        return items.map((it) => {
          onProgress?.(it.key, 'done');
          return { key: it.key, ok: true, read: J(it.ctx.level === 'ground' ? 'pass2-app-gf.json' : 'pass2-app-ff.json') };
        });
      },
    };
  };
  for (const [pages, levels] of [
    [[gfImg, ffImg], ['ground', 'first']],
    [[ffImg, gfImg], ['first', 'ground']],
  ]) {
    const A = mk(levels);
    const r = await RP.readPlan({ name: 'plan.pdf' }, { img: pdfIMG(pages), ai: A, settings: { apiKey: 'test-key-not-real' }, hint: TERRACE2 });
    assert.equal(r.status, 'ok', JSON.stringify({ s: r.status, c: r.confidence, i: r.issues }));
    assert.equal(r.source, 'ai');
    assert.equal(A.c.find, 2);
    assert.equal(A.c.read, 2);
    const plan = migratePlan(r.plan);
    assert.equal(plan.floors.length, 2, levels.join());
    // 一楼在下：有厨房的那一层是第一层
    assert.ok(plan.floors[0].rooms.some((x) => x.type === 'kitchen'), `ground first (${levels})`);
    assert.equal(plan.stairs.length, 1, JSON.stringify(plan.stairs));
    for (const i of r.issues) assert.ok(SAFE(i.zh), i.zh);
  }
  const dup = mk(['ground', 'ground']);
  const rd = await RP.readPlan({ name: 'plan.pdf' }, { img: pdfIMG([gfImg, gfImg]), ai: dup, settings: { apiKey: 'test-key-not-real' }, hint: { ...TERRACE2, storeys: 0 } });
  assert.equal(migratePlan(rd.plan).floors.length, 1, 'the same floor twice is one floor');
});

console.log('户型图交接（handoff.js）');

await test('compactPlan：4 个模板都 ≤ 6,000 字、坐标 0.01 m；expandPlan 回来房间 / 门窗 / 楼梯一样', () => {
  for (const tid of Object.keys(TEMPLATES)) {
    const p = migratePlan(templatePlan(tid));
    const c = H.compactPlan(p);
    assert.ok(c, tid);
    const len = JSON.stringify(c).length;
    assert.ok(len <= H.INLINE_MAX, `${tid} ${len}`);
    const back = migratePlan(H.expandPlan(c));
    assert.equal(back.floors.length, p.floors.length);
    p.floors.forEach((f, i) => {
      assert.equal(back.floors[i].rooms.length, f.rooms.length);
      assert.equal(back.floors[i].openings.length, f.openings.length);
      f.rooms.forEach((r, j) => {
        const b = back.floors[i].rooms[j];
        assert.equal(b.type, r.type);
        for (const k of ['x', 'y', 'w', 'd']) assert.ok(Math.abs(b[k] - r[k]) <= 0.005 + 1e-9, `${tid} ${k}`);
      });
    });
    assert.equal((back.stairs || []).length, (p.stairs || []).length);
  }
});

await test('compactPlan：太大（> 6,000 字）→ null；坏输入 → null', () => {
  const p = migratePlan(templatePlan('semid2'));
  const big = { ...p, floors: p.floors.map((f) => ({ ...f, rooms: Array.from({ length: 12 }, (_, k) => f.rooms.map((r) => ({ ...r, id: `${r.id}-${k}` }))).flat() })) };
  assert.equal(H.compactPlan(big), null);
  assert.equal(H.compactPlan(null), null);
  assert.equal(H.compactPlan({ floors: [] }), null);
  assert.equal(H.expandPlan(null), null);
});

await test('putHomePlan / getHomePlan / dropHomePlan（这台设备）；超过 keepDays 天 → null 并删掉', async () => {
  H._resetHandoff();
  const plan = migratePlan(templatePlan('condo3'));
  assert.equal(await H.getHomePlan('px'), null);
  assert.ok(await H.putHomePlan('px', { plan, underlays: { f0: { src: 'data:x' } }, source: 'ai', confidence: 0.82 }));
  const rec = await H.getHomePlan('px');
  assert.equal(rec.v, 1);
  assert.equal(rec.source, 'ai');
  assert.equal(rec.confidence, 0.82);
  assert.equal(rec.plan.floors[0].rooms.length, plan.floors[0].rooms.length);
  const blob = new Blob(['plan'], { type: 'image/jpeg' });
  assert.ok(await H.putPlanFile('px', blob));
  assert.equal(await (await H.getPlanFile('px')).text(), 'plan');
  // 过期
  const real = Date.now;
  Date.now = () => real() + (CONFIG.keepDays + 1) * 86400000;
  try {
    assert.equal(await H.getHomePlan('px'), null);
    assert.equal(await H.getPlanFile('px'), null);
  } finally {
    Date.now = real;
  }
  assert.equal(await H.getHomePlan('px'), null, 'expired record was deleted');
  await H.putHomePlan('py', { plan });
  await H.dropHomePlan('py');
  assert.equal(await H.getHomePlan('py'), null);
  assert.equal(await H.putHomePlan('', { plan }), false);
  assert.equal(await H.putHomePlan('pz', { plan: null }), false);
});

console.log('存档 / 链接（store.js）');

// adccd6a（线上版）存下来的方案：一层（plan v1：rooms / openings / wallH）、家具没有 floor、没有任何参考案例的字段
const OLD = {
  id: 'p_old1',
  name: 'Peggy 的梦想家',
  createdAt: '2026-09-01T02:00:00.000Z',
  updatedAt: '2026-09-02T03:00:00.000Z',
  plan: {
    v: 1,
    name: '三房公寓',
    wallH: 2.8,
    north: 0,
    rooms: [
      { id: 'r1', type: 'living', name: '客厅', x: 0, y: 0, w: 5, d: 4 },
      { id: 'r2', type: 'master', name: '主卧', x: 5, y: 0, w: 3.6, d: 4 },
    ],
    openings: [{ id: 'o1', kind: 'door', x1: 1, y1: 4, x2: 1.9, y2: 4 }],
  },
  furniture: [{ id: 'f1', kind: 'sofa', room: 'r1', x: 2.5, z: 3.2, rot: 180, variant: 'classic', w: 2.2, d: 0.92 }],
  materials: { ...MOOD_BY_ID.cozy.materials },
  mood: 'cozy',
  time: 17.5,
  profile: { id: 'q_1', name: 'Peggy', code: 'WMNH', avoid: [] },
};
const CASE_KEYS = ['caseId', 'caseRef', 'cases', 'keep', 'locked', 'caseStyle', 'sample', 'homeAt', 'softened', 'suggestions'];

await test('旧方案（线上版存的 v1）原样读：材质 / 情绪 / 时间 / 家具不变，不会多出参考案例的字段', async () => {
  const p = Store.fromStoredProject(structuredClone(OLD));
  assert.equal(p.plan.floors.length, 1);
  assert.deepEqual(p.materials, OLD.materials);
  assert.equal(p.mood, 'cozy');
  assert.equal(p.time, 17.5);
  assert.equal(p.furniture.length, 1);
  assert.equal(p.furniture[0].floor, p.plan.floors[0].id);
  for (const k of CASE_KEYS) assert.ok(!(k in p), `unexpected ${k}`);
  assert.deepEqual(Store.caseFields(p), {});
  // 存回去、读出来还是一样；分享链接来回也没有参考案例的字段
  LS.clear();
  Store.saveProject(p);
  const again = Store.loadProjects()[0];
  for (const k of CASE_KEYS) assert.ok(!(k in again), `unexpected ${k} after save`);
  assert.deepEqual(again.materials, OLD.materials);
  const link = await Store.packProject(p);
  const u = await Store.unpackProject(link);
  for (const k of CASE_KEYS) assert.ok(!(k in u), `unexpected ${k} in link`);
  assert.equal(u.mood, 'cozy');
});

await test('旧的 #p= 档案（没有 home / cases）→ profileForStudio 和以前一样的几样，不多不少', () => {
  const prof = { id: 'q_1', name: 'Peggy', code: 'WMNH', axes: { temp: 70 }, hidden: {}, life: {}, storage: {}, avoid: [], materials: {}, wishes: [], createdAt: 'x', answers: { pairs: {} }, insights: ['designer only'] };
  const out = Store.profileForStudio(prof);
  assert.deepEqual(Object.keys(out).sort(), ['avoid', 'axes', 'code', 'createdAt', 'hidden', 'id', 'life', 'materials', 'name', 'storage', 'wishes']);
});

await test('「带它回家」的档案：home（不带链接里的小平面图）、cases（≤ 3 个 { id, rev, title }）、caseId 都带进工作室', () => {
  const prof = {
    id: 'q_2',
    code: 'CMRD',
    home: { v: 1, at: '2026-10-18T10:00:00Z', type: 'condo', keep: { floor: 'cream-tile' }, plan: { state: 'read', floors: 1, inline: { v: 2, f: [] } } },
    cases: [
      { id: 'seed-urban-condo', rev: 1, title: { zh: '都会里的白色盒子', en: 'A white box in the city' }, images: ['x'] },
      { id: 'seed-architect-bungalow', title: '线条利落的独立洋房' },
      { id: 'a' },
      { id: 'b' },
      null,
    ],
    caseId: 'seed-urban-condo',
  };
  const out = Store.profileForStudio(prof);
  assert.equal(out.home.type, 'condo');
  assert.ok(!('inline' in out.home.plan), 'inline plan stays out of the project');
  assert.equal(out.cases.length, 3);
  assert.deepEqual(Object.keys(out.cases[0]).sort(), ['id', 'rev', 'title']);
  assert.deepEqual(out.cases[1].title, { zh: '线条利落的独立洋房', en: '' });
  assert.equal(out.caseId, 'seed-urban-condo');
});

await test('方案带参考案例：存档 / 分享链接里有 caseRef + keep + cases（id / 标题），没有照片', async () => {
  const c = caseById('seed-zen-condo');
  const r = realiseCase({ caseObj: c, keep: { floor: 'cream-tile', walls: 'unsure' }, profile: { code: 'WMNH', avoid: [] } });
  const p = {
    ...Store.fromStoredProject(structuredClone(OLD)),
    materials: r.materials,
    mood: `case:${c.id}`,
    caseId: c.id,
    caseRef: { id: c.id, rev: c.rev || 1, title: c.title },
    cases: [{ id: c.id, rev: c.rev || 1, title: c.title }],
    keep: { floor: 'cream-tile', walls: 'unsure' },
    locked: r.locked,
    caseStyle: r.style,
    homeAt: '2026-10-18T10:00:00Z',
    sample: true,
  };
  const link = await Store.packProject(p);
  const u = await Store.unpackProject(link);
  assert.equal(u.caseId, c.id);
  assert.equal(u.caseRef.title.zh, c.title.zh);
  assert.deepEqual(u.keep, { floor: 'cream-tile', walls: 'unsure' });
  assert.deepEqual(u.locked, { floor: 'cream-tile' });
  assert.equal(u.sample, true);
  assert.equal(u.materials.floor, 'cream-tile');
  const raw = JSON.stringify(u);
  assert.ok(!/images|thumb|webp|\.jpg|1600|data:image/.test(raw), 'no photos in the link');
  // 本机存档也带着
  LS.clear();
  Store.saveProject(p);
  const back = Store.loadProjects()[0];
  assert.equal(back.caseId, c.id);
  assert.deepEqual(back.locked, { floor: 'cream-tile' });
});

await test('给设计师的存档是完整的（平面图、家具、案例、保留、颜色、房子资料、预算 / 时间表）；分享链接里没有预算、时间表', async () => {
  const c = caseById('seed-zen-condo');
  const home = { v: 1, at: '2026-10-19T02:00:00Z', type: 'terrace', status: 'handover', sizeSqft: 1650, bedrooms: 4, bathrooms: 3, storeys: 2, scope: ['whole'], timeline: '3m', budget: '100-150', keep: { floor: 'cream-tile' }, keepMode: 'keep', plan: { state: 'read', floors: 2 } };
  const prof = Store.profileForStudio({ id: 'q_d', code: 'WMNH', avoid: [], home, cases: [{ id: c.id, rev: 1, title: c.title }], caseId: c.id });
  const r = realiseCase({ caseObj: c, keep: { floor: 'cream-tile' }, profile: prof });
  const plan = templatePlan('terrace2');
  const { buildAllWalls } = await import('../src/studio/plan/model.js');
  const furniture = furnish(plan, buildAllWalls(plan), prof, { style: r.style });
  const p = { ...Store.createProject({ plan, profile: prof }), furniture, materials: r.materials, mood: `case:${c.id}`, caseId: c.id, caseRef: { id: c.id, rev: 1, title: c.title }, cases: prof.cases, keep: home.keep, locked: r.locked, caseStyle: r.style, homeAt: home.at, sample: false };
  LS.clear();
  Store.saveProject(p);
  const back = Store.loadProjects()[0];
  assert.equal(back.plan.floors.length, 2, 'both floors');
  assert.ok(back.furniture.length > 10, 'layout');
  assert.equal(back.caseId, c.id);
  assert.deepEqual(back.keep, { floor: 'cream-tile' });
  assert.deepEqual(back.locked, { floor: 'cream-tile' });
  assert.equal(back.materials.floor, 'cream-tile');
  assert.equal(back.profile.home.type, 'terrace');
  assert.equal(back.profile.home.bedrooms, 4);
  assert.equal(back.profile.home.budget, '100-150', 'budget stays on this device for the designer');
  assert.equal(back.profile.home.timeline, '3m');
  const u = await Store.unpackProject(await Store.packProject(back));
  assert.equal(u.profile.home.type, 'terrace');
  assert.ok(!('budget' in u.profile.home) && !('timeline' in u.profile.home), 'no budget / timeline in the share link');
  assert.ok(!/100-150/.test(JSON.stringify(u)));
  assert.equal(u.caseId, c.id);
  assert.equal(u.furniture.length, back.furniture.length, 'the whole layout travels with the link');
  // 设计师接手的一份（下一步的简报 / 导出）：预算从员工笔记来（home.js staffNoteOf），只在 staff 里
  const d = Store.designerFacts(back, { staffNote: { budget: '60-100' } });
  assert.equal(d.plan.floors.length, 2);
  assert.equal(d.furniture.length, back.furniture.length);
  assert.equal(d.caseId, c.id);
  assert.deepEqual(d.locked, { floor: 'cream-tile' });
  assert.equal(d.home.bedrooms, 4);
  assert.deepEqual(d.staff, { budget: '60-100', timeline: '3m' });
  assert.ok(!('budget' in d.home) && !('timeline' in d.home), 'staff-only facts live only in d.staff');
  assert.equal(Store.designerFacts(back).staff.budget, '100-150', 'falls back to an old home.budget');
  assert.equal(Store.designerFacts(null), null);
});

await test('我们做（业主 + LEAD NOTE 6 / 8）：只标定制柜、台面、木 / 石墙板；活动家具是「家具示意」；地板、墙漆、窗帘、灯、地毯、瓷砖从不标', async () => {
  const O = await import('../src/studio/offer.js');
  const { CATALOG } = await import('../src/studio/engine/furniture.js');
  assert.ok(O.isOfferSlot('cabinetry', 'walnut'));
  // LEAD NOTE 8：公司配台面（从别家配来的）→ 台面是「我们做」；客人家里留下来的（锁住的）照样不算
  for (const m of Object.keys(MAT_BY_ID).filter((id) => fits(id, 'countertop'))) assert.ok(O.isOfferSlot('countertop', m), `countertop ${m}`);
  assert.deepEqual(O.offerSlots({ cabinetry: 'walnut', countertop: 'quartz-travertine', floor: 'smoked-oak' }, { cabinetry: 'walnut' }), { countertop: true });
  for (const s of ['floor', 'walls', 'curtains', 'metal', 'rugs', 'tile', 'accents', 'bedding', 'upholstery', 'woodwork']) {
    for (const m of Object.keys(MAT_BY_ID)) assert.ok(!O.isOfferSlot(s, m), `${s} is not the offer`);
  }
  const paint = Object.values(MAT_BY_ID).find((m) => m.cat === 'paint' && fits(m.id, 'feature'));
  const wood = Object.values(MAT_BY_ID).find((m) => m.cat === 'wood' && fits(m.id, 'feature'));
  assert.equal(O.isOfferSlot('feature', paint.id), false, 'a painted feature wall is paint');
  assert.equal(O.isOfferSlot('feature', wood.id), true, 'a wood feature wall is a wall panel');
  // 墙板 = 木 / 石纹的板（大理石、洞石、水磨石）；微水泥、岩板、石灰墙是背景（业主：不是我们做的）
  for (const id of ['travertine', 'carrara', 'terrazzo']) assert.equal(O.isOfferSlot('feature', id), true, `${id} board = wall panel`);
  for (const id of ['microcement', 'sintered', 'sand-limewash', 'latte']) assert.equal(O.isOfferSlot('feature', id), false, `${id} is the backdrop`);
  assert.deepEqual(O.offerSlots({ feature: 'microcement', cabinetry: 'walnut' }), { cabinetry: true });
  for (const k of ['wardrobe', 'kitchenRun', 'tvWall', 'shoeCabinet', 'bookshelf', 'featureWall', 'displayCabinet']) assert.ok(O.isOfferItem(k), k);
  for (const k of ['sofa', 'armchair', 'diningTable', 'chair', 'bed', 'coffeeTable', 'desk']) {
    assert.ok(!O.isOfferItem(k), `${k} is generic`);
    assert.ok(O.isIllustrationItem(k), `${k} = 家具示意`);
  }
  for (const k of ['plant', 'floorLamp', 'pendant', 'rug', 'curtains', 'art', 'fridge', 'washer', 'toilet', 'shower', 'petBed']) assert.ok(!O.isOfferItem(k) && !O.isIllustrationItem(k), `${k} is context`);
  // 每件家具最多一个身份；名单里的都是真的 CATALOG
  for (const k of [...O.OFFER_ITEMS, ...O.ILLUSTRATION_ITEMS]) assert.ok(CATALOG[k], k);
  for (const k of O.OFFER_ITEMS) assert.ok(!O.ILLUSTRATION_ITEMS.includes(k), k);
  // 客人家里留下来的柜子不是我们要做的
  assert.deepEqual(O.offerSlots({ cabinetry: 'walnut', upholstery: 'linen', feature: wood.id, woodwork: 'walnut', floor: 'walnut' }, { cabinetry: 'walnut' }), { feature: true });
  // 案例 supplies.firm → 我们做：沙发、餐桌椅、床、书桌去掉；都是 SUPPLY.firm 的 id
  assert.deepEqual(O.offerSupply(['kitchen', 'sofa', 'wardrobe', 'diningSet', 'bed', 'tvWall', 'desk']), ['kitchen', 'wardrobe', 'tvWall']);
  const { SUPPLY } = await import('../src/shared/cases.js');
  const firm = new Set(SUPPLY.firm.map((x) => x.id));
  for (const cc of CASES) for (const id of cc.supplies?.firm || []) assert.ok(firm.has(id), `${cc.id}: ${id}`);
  for (const id of O.offerSupply(SUPPLY.firm.map((x) => x.id))) assert.ok(!['sofa', 'diningSet', 'bed', 'desk'].includes(id), id);
  // LEAD NOTE 8：榻榻米 / 栖云 / 翻床（收纳床）是公司做的；普通的床还是家具示意
  assert.deepEqual(O.offerSupply(['bed', 'bedStorage']), ['bedStorage']);
  // SUPPLY.firm 的每一样不是「我们做」就是「家具示意」（wallPanel / featureWall / doors 先留在名单里，等 DATA 加上这些 id）
  for (const id of firm) assert.ok(O.OFFER_SUPPLY.includes(id) || ['sofa', 'diningSet', 'bed', 'desk'].includes(id), `SUPPLY.firm ${id} unclassified`);
});

console.log(`\n${n - failed}/${n} 通过（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
if (failed) process.exit(1);
