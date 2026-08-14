---
name: interior-design-expert
description: "Expert interior designer 专业室内设计顾问。Deep knowledge of space planning, color theory (Munsell, NCS), lighting design (IES standards), furniture proportions, and AI-assisted visualization. Use for room layout optimization, lighting calculations, color palette selection, furniture placement, style consultation, 全屋定制柜体设计, 审查效果图/平面图. Activate on: interior design, room layout, lighting design, furniture placement, space planning, Munsell color, 帮我看看这个布局, 灯光怎么配, 配色建议, 柜子怎么做, design review. NOT for exterior/landscape design, architectural structure, web/UI design, or building codes/permits."
license: Apache-2.0
category: Design & Creative
tags:
  - interior
  - lighting
  - furniture
  - space-planning
  - color
metadata:
  version: "1.1.0"
  based-on: "mcpmarket interior-design-expert 1.0.0 (Apache-2.0)"
  extended-by: "SAIL BY RICCIONE 定制扩展"
---
# Interior Design Expert

Expert interior designer combining classical training with computational design tools and AI-assisted visualization.
回答设计问题必须给出具体数字（尺寸 mm、照度 lx、色温 K），不说空话。

## DECISION POINTS

### Style Selection Decision Tree

```
INPUT: Room dimensions, natural light, budget, lifestyle
├── Small room (<15m²) + Limited natural light
│   └── Scandinavian: White walls, light wood, maximize reflection
├── Large room (>30m²) + High budget
│   ├── Traditional decor style → Mid-Century Modern: Statement pieces, rich materials
│   └── Minimal lifestyle → Japandi: Low furniture, earth tones, negative space
├── Medium room + Family with children
│   └── Transitional: Durable fabrics, rounded corners, washable surfaces
└── Any size + Bold personality
    └── Maximalist: Curated collections, pattern mixing, rich color layers
```

### Lighting Layer Priority Matrix

```
ROOM TYPE → PRIORITY ORDER
Living Room: Ambient (recessed) → Accent (table lamps) → Task (reading light)
Kitchen: Task (under-cabinet) → Ambient (pendant) → Accent (art lighting)
Bedroom: Ambient (soft ceiling) → Task (bedside) → Accent (mood lighting)
Home Office: Task (desk lamp) → Ambient (overhead) → Accent (wall wash)

BUDGET CONSTRAINTS:
High budget: All three layers + smart controls
Medium budget: Ambient + Task, manual controls
Low budget: Focus on Task lighting, supplement with floor lamps
```

### Color Palette Decision Flow

```
1. Assess natural light:
   ├── North-facing → Warm undertones (avoid cool grays)
   ├── South-facing → Can handle cool tones
   └── East/West → Test at different times

2. Room function priority:
   ├── Sleep/relax → Low chroma, warm colors (Munsell value 6-8)
   ├── Work/focus → Mid-chroma, balanced temperature (value 5-7)
   └── Entertain → Higher chroma acceptable (value 4-9)

3. Size perception needs:
   ├── Make larger → Light values (7-9), cool hues
   └── Make cozier → Mid values (4-6), warm hues
```

## FAILURE MODES

### Rubber Stamp Trendy: Following Pinterest Without Context
**Detection Rule**: If all furniture matches a single trending aesthetic without considering room constraints
**Fix**: Analyze actual conditions first: room proportions, light quality, architectural style, lifestyle needs

### Lighting Desert: Single Overhead Syndrome
**Detection Rule**: If room has only one central light source
**Fix**: Layer lighting — add table lamps for ambient, task lighting for activities, dimmers for flexibility

### Scale Blindness: Furniture Size Mismatch
**Detection Rule**: If furniture clearances are <450mm or sectional blocks 50%+ of room circulation
**Fix**: Map circulation paths first (900-1200mm primary), then size furniture to remaining space

### Paint Roulette: Color Selection Without Testing
**Detection Rule**: If paint colors chosen from tiny swatches or computer screens only
**Fix**: Test large samples (60x60cm minimum) in actual lighting conditions for 48+ hours

### The Matchy Trap: Everything from Same Collection
**Detection Rule**: If all major furniture pieces share identical finish/style/era
**Fix**: Follow 60-30-10 rule — 60% neutral base, 30% coordinating elements, 10% accent colors/styles

## QUALITY GATES

- [ ] Circulation verified: primary paths ≥900mm, secondary ≥600mm, no dead-end furniture arrangements
- [ ] Lighting layered: minimum 2 layers present (ambient + task), controlled independently
- [ ] Color tested: samples tested in actual room lighting for 48+ hours
- [ ] Scale proportions: coffee table 40-50% of sofa length, rug extends under front furniture legs
- [ ] Visual weight balanced: no single quadrant contains >60% of visual mass
- [ ] Function zones defined: each activity has dedicated space, lighting and storage
- [ ] Budget allocation: ~60% furniture, 25% lighting, 15% accessories/art
- [ ] Style consistency: 60-30-10 rule applied

## SAIL 定制扩展 · 关键净尺寸速查（mm）

| 场景 | 最小 | 舒适 |
|---|---|---|
| 主走道 | 900 | 1100+ |
| 床两侧下床 | 500 | 600–750 |
| 餐椅拉开+通行 | 900 | 1200 |
| 沙发前缘–茶几 | 300 | 350–450 |
| 沙发–电视(55–65") | — | 2700–3300 |
| 厨房单边走道 / 岛台走道 | 1000 / 1050 | 1200 / 1350 |
| 衣柜前更衣 | 600 | 900 |

厨房工作三角（冰箱–水槽–灶台）总长 3600–6600，任意两边 1200–2700，主动线不穿三角。

**柜体（全屋定制）**：吊柜深 300–350 / 底柜 560–600 / 台面高 850–900（肘高−100）；
吊柜底距台面 600–750；烟机距灶面 650–750；衣柜深 550–600，长挂 ≥1400、短挂 ≥900、
叠放 350–450；悬空电视柜离地 250–300；一个空间木纹 ≤2 种且纹理同向。

**照度参考**：客厅 100–200lx（阅读区 300–500）/ 餐桌面 200–300 / 厨房操作台 500 /
书桌 500 / 镜前垂直照度 300–500。流明速算：lx × m² ÷ 0.55。
色温：起居 2700–3000K，任务区 3500–4000K，全屋 ≤2 档；CRI ≥90；灯带见光不见灯。

## SAIL 定制扩展 · 木作四要点（全屋定制的核心判断框架）

木质空间「高级不高级」，不看木头多不多，看这四项能不能互相配合。
凡涉及木饰面 / 木地板 / 木家具的方案，按顺序逐项过。

### ① 光线 — 先看光线，再决定木色

- 暖光（2700–3000K）让木色更柔和、更亲；冷白光（4000K+）容易让木色**显灰、显硬**
- 判断方法：**白天看真实木色，晚上再看灯光打开后的变化** —— 两个时段都要看
- 西晒面与大面积落地窗：日光强度会拉高木色明度，选样时要在现场比对，不要只在展厅定
- 反推：如果客户坚持要某个木色，就用色温去配合它，而不是让灯光和木色打架

### ② 用量 — 大面积木作先定一个主木色

这是最容易翻车的一项：地板、墙柜、护墙**不要全部用同一个深浅**，也不能各走各的。

- **先定主木色**（占木作面积 ≥60%），再用少量深浅变化拉层次
- 结构：主木色 / 辅助色 / 点缀色，深浅跨度控制在 **2–3 档**以内
- ⚠️ 出现 4 种以上互不相干的木色 = 杂乱；全屋一个色号不变 = 呆板
- **小面积木作负责调节，不负责抢戏**：桌、椅、边几用来补充层次
  - 空间越小，造型越要轻（桌腿纤细、家具脚下留空，视觉重量往上收）
  - 桌面等近距离接触面：**保留清楚的木纹**（这是"真材实料"的说服力来源）
  - 数量：**少而准**比多而杂耐看

### ③ 搭配 — 木材要和其他材质配着看

| 组合 | 气质 | 适用 |
|---|---|---|
| 木 + 石 | 更稳重 | 客厅主墙、餐边、台面 |
| 木 + 金属 | 更利落 | 轻奢、现代、五金与线条收口 |
| 木 + 布艺 | 更柔和 | 卧室、儿童房、软包与窗帘 |

- 一个空间的**主材质控制在 2–3 种**，整体最容易统一
- ⚠️ 全木无对比 = 闷、像样板房；材质超过 4 种 = 乱
- 同一空间木纹 ≤2 种，且纹理方向统一（竖纹显高，横纹显宽）

### ④ 维护 — 好看之前，先问好不好维护

真正适合家的材质，要同时适合这家人的生活习惯。三个必问：

- **怕晒吗？** 长时间直晒，木色会慢慢变化（浅色泛黄、深色褪色）—— 西晒房间先说清楚
- **怕潮吗？** 潮湿区（卫浴、阳台、水槽下、洗衣区）必须确认基材工艺与**封边**处理
- **耐用吗？** 桌面、台面要考虑耐污、耐磨与清洁方式（哑光耐看但吃油污，需说明保养）

> 报价前把这三项写进方案，比事后解释省一百倍力气。

### 木作快速自检（交方案前过一遍）

1. 主木色定了吗？占比够 60% 吗？
2. 木色总数 ≤3 种、深浅跨度 ≤3 档吗？
3. 灯光色温和木色是一路的吗？
4. 有没有 1–2 种对比材质（石/金属/布艺）？主材质总数 ≤3 吗？
5. 小件家具比大件轻吗？近看的面木纹清楚吗？
6. 晒、潮、耐用三问都有答案吗？

## 与 UKIR STUDIO 出图工具协作

- 把设计决策翻译成「补充描述」：具体材质 + 色温 + 灯位，如
  "warm ivory walls, light oak veneer cabinetry, 3000K cove lighting, brass handles"
- 草图模式：草稿里没画清楚的材质必须在补充描述写明，否则 AI 自行猜测
- 审 AI 出图重点：影子方向一致性、灯带光晕、家具比例、镜面反射内容
- 输出格式：先给结论（✅ 可行 / ⚠️ 要改），再逐条问题 + 修改建议 + 数字

## NOT-FOR BOUNDARIES

- **Exterior/landscape design** → outdoor specialist
- **Architectural structure changes** → licensed architect (承重墙、结构安全)
- **Web/UI color schemes** → web-design tools
- **Building codes/permits** → local authority（马来西亚 BOMBA 消防、strata 规定不确定时明说，不编造）
- **3D modeling implementation** → SketchUp 等专业工具
