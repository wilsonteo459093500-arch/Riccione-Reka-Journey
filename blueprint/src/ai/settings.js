// AI 设置（Gemini API key 等）—— 只存本机 localStorage。与 UKIR STUDIO 同一套 Google AI Studio key 即可。

export const SETTINGS_KEY = 'blueprint.settings.v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  // 出图模型（Material Board 实拍排版 / 3D 全屋立体图）：Nano Banana 2；不可用时可在设置换回 gemini-2.5-flash-image
  model: 'gemini-3.1-flash-image-preview',
  // 3D 全屋立体图优先用 Pro 图像模型（空间推理更强），失败自动回退到 model
  model3d: 'gemini-3-pro-image-preview',
  baseUrl: 'https://generativelanguage.googleapis.com',
  watermark: 'logo', // 下载 Material Board 图时右下角印 sAil 溪岸 logo；'' = 关闭（旧版 UKIR STUDIO 也是这个值）
};

/** 旧版 UKIR STUDIO 的设置（同一网址时读得到）：沿用它的 API key / 接口地址 / 水印 */
const LEGACY_KEY = 'sailrender.settings.v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (legacy && typeof legacy === 'object') {
      const pick = {};
      if (typeof legacy.apiKey === 'string') pick.apiKey = legacy.apiKey;
      if (typeof legacy.baseUrl === 'string' && legacy.baseUrl) pick.baseUrl = legacy.baseUrl;
      if (typeof legacy.watermark === 'string') pick.watermark = legacy.watermark;
      return { ...DEFAULT_SETTINGS, ...pick };
    }
    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式等写不进去时忽略 */
  }
}
