# 溪岸 Render · AI 效果图工作室

给室内设计师减负的出图工具：**上传照片或草图 → 选空间和风格 → 10–20 秒出照片级效果图**。
对标 MyArchitectAI 等 AI 渲染平台，但用自己的 API key 按量付费（约 US$0.04/张），
且针对本地市场风格库（奶油风、原木日式、新中式、侘寂…）做了专业级 prompt 调校。

> 独立 app，与 Delivery OS / CRM 共用 repo、各自部署。部署指南见 [`DEPLOY.md`](./DEPLOY.md)。

## 六种工作模式

| 模式 | 用途 |
| --- | --- |
| 实景焕新 | 上传现状照片，整体换风格（旧房改造提案神器） |
| 毛坯 / 空房出图 | 毛坯房照片一键变全屋布置完成的效果图 |
| 草图 / 线稿渲染 | 手绘、SU 白模、CAD 立面 → 真实渲染 |
| 虚拟软装 | 硬装不动，只做家具软装搭配 |
| 指令修改 | “把电视墙换成岩板” 式的局部修改 |
| 文字生成 | 无需图片，从描述生成概念图（可选画幅比例） |

## 核心功能

- **14 种空间类型** × **11 种风格**（每种风格按 材质+色彩+造型+标志元素 四层写好专业 prompt）
- **灯光氛围**（日光 / 黄昏 / 夜景 / 商业明亮）与**结构保真度**三档（严格保留结构 → 自由发挥）
- 一次生成 **1–4 张方案**，并行出图
- **Before / After 对比滑块** —— 给客户演示改造前后的利器
- **以图继续迭代**：任何一张结果一键设为底图，用一句指令继续改
- **历史记录**存本机 IndexedDB（最多 60 条，收藏不清理），可复用底图、二次修改、下载
- 支持 拖拽 / 粘贴 / 手机拍照 上传，自动压缩到 1600px 再上传，省流量提速

## 数据与费用

- **API key 只存本机浏览器 localStorage**，图片直连 Google 接口，不经过任何中间服务器
- 使用 Gemini 图像模型（默认 `gemini-2.5-flash-image`），约 **US$0.04/张**
- key 免费申请：[aistudio.google.com/apikey](https://aistudio.google.com/apikey)，app 内设置弹窗有一步步指引
- 高级设置里可换模型 ID、可配置中转代理地址

## 开发

```bash
cd render
npm install
npm run dev      # 本地开发
npm run build    # 生产构建到 dist/
```

## 结构

```
render/
  src/
    App.jsx                  # 状态编排：生成流程 / 历史 / 迭代
    constants.js             # 模式 / 空间 / 风格 / 灯光 / 保真度库（prompt 核心）
    prompt.js                # prompt 组装器
    services/
      gemini.js              # Gemini 图像接口客户端 + 设置存取
      images.js              # 压缩 / 缩略图 / 下载（全在浏览器）
      history.js             # IndexedDB 历史记录
    components/
      Controls.jsx           # 左侧参数面板（模式/上传/空间/风格/…）
      Results.jsx            # 结果网格 + 大图 Lightbox
      CompareSlider.jsx      # 前后对比滑块
      HistoryPanel.jsx       # 历史抽屉
      SettingsModal.jsx      # API key 设置 + 连接测试
```
