// STUB —— 由 import 模块实现。契约见 ARCHITECTURE.md
/**
 * @param {File} file  设计师方案 PDF
 * @param {{ onProgress?: (stage:string, done:number, total:number) => void }} [opts]
 * @returns {Promise<object>} Project（engine/model.js），图片已存入 IndexedDB，slides 已排好整套
 */
export async function importPdfFile(file, opts = {}) {
  throw new Error('importPdfFile 尚未实现');
}
