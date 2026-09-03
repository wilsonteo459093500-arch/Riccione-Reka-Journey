# UKUR · 户型图量尺 · 橱柜延尺预估

by RICCIONE REKA。**上传户型图 → 标定一个已知尺寸 → 其余长度全部按比例量出来**，
自动按地柜 / 吊柜 / 高柜 / 台面汇总延尺，顺手出预估报价。
销售、设计助理在客户发来户型图的当下就能报个数，不用等排图。

> 独立 app，与 Delivery OS / CRM / UKIR / CIPTA 共用 repo、各自部署。部署指南见 [`DEPLOY.md`](./DEPLOY.md)。

## 怎么用（三步）

1. **传图** —— JPG / PNG / PDF，手机截图也行；PDF 多页可切页。也支持拖拽和 Ctrl+V 粘贴。
2. **标定比例** —— 沿图纸上一个已知尺寸画一条线（例如总尺寸 10350），填进实际毫米数。
   基准线越长越准，拿整面墙的总尺寸，别拿 600 的小段。
3. **量柜体** —— 选分类（地柜 / 吊柜 / 高柜 / 台面），在图上点两下量一段；
   L 型 / U 型打开「折线」沿墙连续点，双击或回车结束，长度自动相加。

## 功能

- **比例标定**：任意已知尺寸做基准，改标定后所有测量自动重算（存的是像素坐标）
- **正交吸附**：接近横平竖直的线自动拉直（15° 内），斜墙照量
- **端点吸附**：靠近已有端点自动咬住，L 型转角不留缝
- **折线测量**：一条测量可含多段，Σ 总长直接给
- **校验线**：量一条图纸上标注过的尺寸并填入标注值，实时显示误差 %（2% 内基本可用）
- **改与删**：选择模式下点线选中、拖端点微调、改名改分类；眼睛图标 = 暂不计入汇总
- **单位**：mm / 米 / 尺随时切换，汇总同时给米和尺
- **预估报价**：按尺计价，四类单价（RM/ft）自己填，记在本机
- **导出**：文字摘要（发 WhatsApp）、CSV（Excel）、**带标注的户型图 PNG**（发客户 / 工厂）
- **自动存档**：项目存本机 IndexedDB，刷新不丢；最多保留 30 个

手机也能用：单指拖动平移、双指缩放、点一下放点。

## 准头

按图纸比例的**估算**：图纸本身误差、扫描变形、点击偏差都会带进来，一般 1–3%。
基准线越长误差越小。**报价、落单前请以现场复尺为准** —— app 里每个出口都写了这句。

## 数据

图纸和测量只存在这台设备的浏览器里（IndexedDB），不上传任何服务器，也不需要 API key。
清浏览器数据会一并清掉，重要的记得导出。

## 开发

```bash
cd measure
npm install
npm run dev      # 本地开发
npm run build    # 生产构建到 dist/
```

## 结构

```
measure/
  src/
    App.jsx                    # 状态编排：标定 → 测量 → 汇总 → 导出
    constants.js               # 柜体分类 / 默认单价 / 单位 / storage keys
    services/
      geometry.js              # 距离、折线长度、正交吸附、端点吸附、命中测试
      units.js                 # mm ↔ m ↔ ft 换算与解析（"3.6m"、"12ft" 都认）
      planLoader.js            # 图片 / PDF（pdf.js 按需加载）→ 位图
      summary.js               # 分类汇总 + 报价 + 校验误差
      exporters.js             # 摘要文字 / CSV / 带标注 PNG
      projects.js              # IndexedDB 项目存档
      prefs.js                 # 单价与偏好（localStorage）
    components/
      PlanCanvas.jsx           # 画布：缩放平移、吸附、绘制、端点拖动
      CalibrationCard.jsx      # 第一步标定卡
      Toolbar.jsx              # 模式 / 分类 / 正交 / 折线 / 单位
      ItemList.jsx             # 测量清单（改名、改分类、校验值）
      SummaryPanel.jsx         # 汇总 + 报价 + 导出
      ProjectsPanel.jsx HelpModal.jsx Uploader.jsx Header.jsx
```
