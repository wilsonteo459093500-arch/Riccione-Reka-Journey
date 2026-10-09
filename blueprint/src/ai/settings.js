// AI 设置（Gemini API key 等）—— 只存本机 localStorage。与 UKIR STUDIO 同一套 Google AI Studio key 即可。

export const SETTINGS_KEY = 'blueprint.settings.v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  // 出图模型（Material Board 实拍排版 / 3D 全屋立体图）：Nano Banana 2；不可用时可在设置换回 gemini-2.5-flash-image
  model: 'gemini-3.1-flash-image-preview',
  // 3D 全屋立体图优先用 Pro 图像模型（空间推理更强），失败自动回退到 model
  model3d: 'gemini-3-pro-image-preview',
  baseUrl: 'https://generativelanguage.googleapis.com',
  watermark: 'SAIL BY RICCIONE', // 下载 Material Board 图时右下角 logo 水印，留空 = 关闭
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
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
