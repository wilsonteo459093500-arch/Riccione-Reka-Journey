// 拍照被系统打断的识别：打开前记一笔，正常回来清掉，重新加载时还在 → 提示
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window ??= { addEventListener() {} };

const { markPicker, clearPicker, takeInterrupted, anchorOf } = await import('../src/lib/pickerGuard.js');

export const tests = [
  ['页面重新加载时取出记录，只取一次', () => {
    markPicker(null, { reportId: 'r1', anchor: 'item-qc1', kind: 'camera' });
    const info = takeInterrupted();
    assert.equal(info.reportId, 'r1');
    assert.equal(info.anchor, 'item-qc1');
    assert.equal(info.kind, 'camera');
    assert.equal(takeInterrupted(), null);
  }],
  ['正常回来（选好 / 取消）后不提示', () => {
    markPicker(null, { reportId: 'r1', kind: 'library' });
    clearPicker();
    assert.equal(takeInterrupted(), null);
  }],
  ['超过 10 分钟的旧记录不提示', () => {
    localStorage.setItem('tora.picker', JSON.stringify({ reportId: 'r1', at: Date.now() - 11 * 60 * 1000 }));
    assert.equal(takeInterrupted(), null);
    localStorage.setItem('tora.picker', '{坏数据');
    assert.equal(takeInterrupted(), null);
  }],
  ['取按钮所在检查项 / 字段的 id', () => {
    const el = { closest: (sel) => (sel.includes('item-') ? { id: 'item-pi4_05' } : null) };
    assert.equal(anchorOf(el), 'item-pi4_05');
    assert.equal(anchorOf({ closest: () => null }), '');
    assert.equal(anchorOf(null), '');
  }],
];
