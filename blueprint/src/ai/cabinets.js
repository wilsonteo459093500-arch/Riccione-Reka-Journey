// 展厅播放 ·「柜子一件件出现」B：没有毛坯图时，让看图模型在效果图上先框一遍柜子（只要框，不画图）。
// 一次看图，每张不到 RM0.01；框出来标 by:'ai'，设计师核对过（打勾）才播。整理回复的规则在 showroom/cabinets.js（纯函数，有测试）。

import { analyzeImage } from './gemini.js';
import { toInlineImage } from '../store/assets.js';
import { BOX_PROMPT, parseCabinetBoxes } from '../showroom/cabinets.js';

const CABINET_MODEL_KEY = 'blueprint.cabinetModel';

/**
 * @param {{ settings:object, src:string }} opts  src = 效果图（slide.image）
 * @returns {Promise<{ boxes:object[], notes:string[] }>}
 */
export async function detectCabinetBoxes({ settings, src }) {
  if (!settings?.apiKey) throw new Error('还没有配置 API key，点右上角设置。也可以不用 AI，自己框。');
  const img = await toInlineImage(src, 1280);
  const reply = await analyzeImage(settings, BOX_PROMPT, { mimeType: img.mimeType, base64: img.base64 }, { json: true, cacheKey: CABINET_MODEL_KEY });
  return parseCabinetBoxes(reply);
}
