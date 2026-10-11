# GENIE · by RICCIONE REKA

> 熊猫精灵「盼吉 Pangie」的**梦想家占卜**（客人玩）＋ **3D 梦想工作室**（设计师 / 销售用）。
> 先读懂一个家，再把它变出来。设计思路（快思慢想 × The Sims）见 [`DESIGN.md`](./DESIGN.md)，上线见 [`DEPLOY.md`](./DEPLOY.md)。

| 网址 | 是什么 |
|---|---|
| `/` | 入口：两个功能 + 这台设备上存的梦想家蓝图 |
| `/quiz` | 梦想家占卜（约 5 分钟）→ 专属梦想家概念蓝图 |
| `/quiz?from=wilson&for=Peggy` | 预填陪同人和称呼（`from` 取自 `src/shared/config.js` 的 `team[].code`） |
| `/quiz#bp=…` | 打开一份分享出去的蓝图 |
| `/studio` | 3D 梦想工作室（第一次打开直接看到示范户型） |
| `/studio#p=…` | 带着客人的占卜档案进入（蓝图页的「在 3D 里看见它」） |
| `/studio#s=…` | 打开别人分享的 3D 方案 |

---

## 一、梦想家占卜（客人）

五张牌，约 5 分钟：

1. **召唤** —— 擦亮神灯（手指来回擦 / 按住），盼吉出场；
2. **I 直觉之牌** —— 12 组图片二选一，3 秒内凭感觉（记录反应时间）；
3. **II 生活之牌** —— 星期六早上、回家第一件事、厨房像什么、门铃响了最想藏什么、家里还有谁（含神台、宠物、在家办公）；
4. **III 宝藏之牌** —— 慢下来数：鞋（→ 鞋柜宽）、衣柜（→ 目标宽、长挂 / 短挂 / 叠放）、书（→ 书墙）、小家电（→ 台面 / 电器高柜）、大件、藏 vs 展；
5. **IV 愿望之牌** —— 12 个愿望只能选 3 个 + 最舍得花钱的地方；
6. **V 禁忌之牌** —— 绝对不要的颜色 / 质感 + 一句话愿望；
7. **揭晓** —— 洗牌、翻牌：16 张「梦想家牌」之一（四条轴：暖/清、简/丰、朴/雅、藏/展）。

**梦想家蓝图**（可打印 / 存 PDF）：牌面 + 轴、情绪色板、材质板、生活、三个愿望、雷区、收纳蓝图、一句话愿望；
切到**设计师版**多出：设计语言、英文出图关键词、谈话提示（矛盾 / 风险 / 沟通建议）、秒选清单。

按钮：在 3D 里看见它 · 发给设计师（WhatsApp，内容已排好）· 分享海报（1080×1350 PNG，可直接分享）· 打印 · 复制链接 · 下一位。

## 二、3D 梦想工作室（设计师 / 销售）

- **开始一个空间**：上传平面图（图片 / PDF）/ 自己画 / 户型模板（公寓 3 房、排屋一楼、小公寓）/ 最近的方案；
- **平面图编辑器**：拉方块画房间、点墙放门 / 窗 / 落地趟门 / 打通；边自动吸附；量尺校准底图比例；设北方（日照）；
  有 Gemini key 时「✨ AI 识别」自动认出房间与门窗，再拖一拖校正 →「生成 3D」；
- **自动摆家具**：按设计师规则 + 客人档案（鞋柜、衣柜长度、神台、宠物窝、书墙、展示柜、L 形沙发 / 弧形沙发、餐桌座位数）；
- **SET THE MOOD**：Cozy / Bright / Moody（有档案时多一个客人自己的牌）、情绪仪表、一句话描述、MOODBOARD；
- **换材质**：底部材质栏拖到任何表面（金光提示 + 「放手 → 地板换成烟熏橡」）；拖错会俏皮提示；
- **家具**：拖动移动；点一下 → 旋转 / 换款 / 复制 / 移走；底部 Furniture 加家具；
- **DAYLIGHT**：四个时段（真实渲染的小图）、24 小时滑杆、可直接拖的太阳弧；窗上的树影、斜进来的光柱、夜里的灯；
- 工具条：撤销 / 重做、下载带品牌概念图、分享链接（整份方案在链接里）、标签开关、视角、墙的高低、▶ 演示模式（自动环绕 + 一天光影，适合展厅大屏 / 录屏）。

## 三、配置

只改 `src/shared/config.js`：

```js
BRAND  // 品牌文字（底座上的字也在这里）
GUIDE  // 熊猫名字：盼吉 Pangie（备选：Jinbao 金宝 · Pandini 潘迪尼 · Genda 精达）
CONFIG.inbox     // 蓝图送到哪个 WhatsApp
CONFIG.endpoint  // 选填：同时 POST 一份 JSON 到你的表单服务
CONFIG.team      // 团队（code 用在 ?from=）
```

材质库在 `src/shared/materials.js`，16 张牌在 `src/shared/dreamers.js`，占卜题目在 `src/quiz/flow.js`，户型模板在 `src/studio/plan/model.js`。

## 四、数据与隐私

- 全部在浏览器本机完成：蓝图存在这台设备（localStorage），方案存在这台设备（localStorage + IndexedDB 存平面图底图）；
- 分享链接里就是数据本身（压缩编码），不经过任何服务器；
- AI 识别平面图用 Google Gemini，**key 只存在这台设备的浏览器里**（设置 ⚙️），没有 key 也能手动画；
- 所有材质贴图都是代码画的（没有任何图片素材），所以没有版权问题。

## 五、开发

```bash
cd genie
npm install
npm run dev      # http://localhost:5173/  /quiz.html  /studio.html
npm test         # 纯函数测试：计分、收纳换算、雷区替换、墙体、自动摆家具、AI 识别换算、链接编码
npm run build    # 生产构建到 dist/（三个入口）
```

```
src/
  shared/      config · materials（材质库）· textures（程序化贴图）· dreamers（16 张牌）· moods（情绪）·
               profile（计分 / 收纳 / 谈话提示 / 编码 / 存档）· summary（WhatsApp 文字）· Pangie.jsx · Emblem.jsx · sound
  quiz/        flow（题目）· steps.jsx（每一关）· Vignette.jsx（插画）· Reveal.jsx · Blueprint.jsx · poster.js
  studio/
    engine/    Engine（渲染 / 光 / 拾取 / 拖动）· house（墙门窗底座）· furniture（程序化家具）· furnish（自动摆放规则）·
               matlib（表面材质）· daylight（24h）· beams（体积光）· geom
    plan/      model（平面图 → 墙 + 模板）· PlanEditor.jsx · ai（Gemini 识别）· planImage（图片 / PDF）
    ui/        MoodPanel · DaylightPanel · SunArc · MaterialDock · Callouts · Toolbar · ItemUI · 各弹窗
  launcher/    入口页
```
