// 「极致真实」二次精炼 —— fal.ai Clarity 引擎（扩散精炼 + 2x 放大 + 微观纹理重铺）。
// 通过同域 /api/fal serverless 代理访问，key 存本机 localStorage、随请求携带。

const FAL_MODEL = 'fal-ai/clarity-upscaler';

const REFINE_PROMPT =
  'professional interior architectural photography, ultra realistic material micro-textures, ' +
  'wood grain, fabric weave, plaster texture, natural soft lighting with accurate shadows, ' +
  'high dynamic range, subtle film grain, photorealistic magazine quality';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function proxyCall(key, url, method = 'GET', body = null) {
  let res;
  try {
    res = await fetch('/api/fal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, url, method, body }),
    });
  } catch {
    throw new Error('网络错误，稍后重试。');
  }
  if (res.status === 404 || res.status === 405) {
    throw new Error('「极致真实」需要在正式部署的网址上使用（本地开发模式没有代理接口）。');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let msg = data?.error?.message || data?.error || data?.detail || data?.raw || `HTTP ${res.status}`;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`fal.ai 拒绝了这把 key（HTTP ${res.status}）。到设置里点「测试 fal 连接」检查 —— 注意别贴成 Google 的 key。`);
    }
    if (res.status === 402 || /balance|credit|quota/i.test(msg)) {
      throw new Error('fal.ai 额度用完了，到 fal.ai/dashboard/billing 充值（按量计费）。');
    }
    throw new Error(`fal 返回错误（HTTP ${res.status}）：${msg.slice(0, 200)}`);
  }
  return data;
}

/**
 * 免费验证 key：提交一个空 input，
 * 401/403 = key 无效；422 参数校验错误 = key 有效（请求没被执行，不扣费）。
 */
export async function testFalKey(falKey) {
  let res;
  try {
    res = await fetch('/api/fal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: falKey, url: `https://queue.fal.run/${FAL_MODEL}`, method: 'POST', body: { input: {} } }),
    });
  } catch {
    throw new Error('网络错误，稍后重试。');
  }
  if (res.status === 404 || res.status === 405) {
    throw new Error('测试需要在正式部署的网址上进行（本地开发模式没有代理接口）。');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`key 无效（HTTP ${res.status}）—— 确认是从 fal.ai/dashboard/keys 创建并完整复制的。`);
  }
  if (res.ok || res.status === 422 || res.status === 400) return true; // 校验错 = 认证已通过
  const data = await res.json().catch(() => null);
  throw new Error(`测试失败（HTTP ${res.status}）：${JSON.stringify(data?.detail || data?.error || data || '').slice(0, 160)}`);
}

/**
 * 把一张图精炼成照片级：2x 放大 + 微观纹理重铺。
 * @param {string} falKey
 * @param {string} dataUrl 输入图（dataURL）
 * @param {(text: string) => void} [onStatus]
 * @returns {Promise<string>} 精炼后的 dataURL
 */
export async function refineImage(falKey, dataUrl, onStatus) {
  if (!falKey) throw new Error('还没有配置 fal.ai key，点右上角设置。');

  onStatus?.('提交精炼任务…');
  const submit = await proxyCall(falKey, `https://queue.fal.run/${FAL_MODEL}`, 'POST', {
    input: {
      image_url: dataUrl,
      prompt: REFINE_PROMPT,
      upscale_factor: 2,
      creativity: 0.35, // 允许重铺纹理的幅度；再高会开始改画面内容
      resemblance: 0.8, // 对原图的忠实度
      num_inference_steps: 18,
    },
  });

  const statusUrl = submit.status_url;
  const responseUrl = submit.response_url;
  if (!statusUrl || !responseUrl) {
    throw new Error(`提交失败：${JSON.stringify(submit).slice(0, 160)}`);
  }

  let done = false;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const s = await proxyCall(falKey, statusUrl);
    if (s.status === 'COMPLETED') {
      done = true;
      break;
    }
    if (s.status === 'FAILED' || s.error) {
      throw new Error('精炼任务失败，重试一次；连续失败就换一张图试。');
    }
    onStatus?.(s.status === 'IN_PROGRESS' ? '精炼渲染中（约 30–60 秒）…' : '排队中…');
  }
  if (!done) throw new Error('精炼超时（3 分钟），稍后重试。');

  const out = await proxyCall(falKey, responseUrl);
  const imgUrl = out?.image?.url || out?.images?.[0]?.url;
  if (!imgUrl) throw new Error('精炼结果里没有图片，稍后重试。');

  onStatus?.('下载精炼结果…');
  const img = await proxyCall(falKey, imgUrl);
  if (!img?.base64) throw new Error('结果图下载失败，稍后重试。');
  return `data:${img.contentType || 'image/jpeg'};base64,${img.base64}`;
}
