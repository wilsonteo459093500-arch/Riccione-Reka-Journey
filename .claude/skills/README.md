# 溪岸 · Claude 军火库 (Skills Arsenal)

> 问题：「假设你是世界级室内设计师 + 家具品牌故事人 + content creator，GitHub 上有什么 skill 能帮到我们？把自己武装成最强的软件。」
>
> 答案就是这个目录。2026-09 调研了 GitHub 上约 60 个相关仓库（含 anthropics/skills、coreyhaines31/marketingskills、
> 三个千级以上的聚合库、十几个中文自媒体与室内 / 建筑类仓库），**装了 27 个第三方 skill + 2 个自写的**，
> 其余的记在下面「没装但值得知道」和「看过但不推荐」。第三方来源与许可证见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。

## 先懂一件事：skill 是怎么工作的

- 每个子目录一个 `SKILL.md`。Claude 只看 frontmatter 里的 `description` 决定要不要用它，**所以你不用记名字，说人话就会触发**（例：「帮我写一段展厅介绍」→ `furniture-brand-storyteller`；「柜子要怎么开料」→ `woodworking`）。
- 这些是**项目级** skill：谁 clone 这个仓库、在这里开 Claude Code，谁就有。你个人账号里那批（`personal-ip-builder`、`canvas-design`、`docx` / `pptx` / `xlsx` / `pdf` …）是**用户级**，不在这里，但会一起生效。
- 所有营销 / 文案 / 内容 skill 开工前会先读 **[`.agents/product-marketing.md`](../../.agents/product-marketing.md)** —— 品牌底稿。品牌、时间线、奖项、语气、红线、客户原话都在那一份里，不用每次重复讲。**里面标 [待确认] 的空位请尽快补齐**，补齐前 Claude 不会把它们当事实写进文案。

## 一图看懂：三种身份，各自的链

```
                     .agents/product-marketing.md  ← 品牌底稿（一切的起点）
                                    │
     ┌──────────────────────────────┼──────────────────────────────┐
     ▼                              ▼                              ▼
 室内设计师                    品牌故事人                       内容创作者
 interior-design-expert       furniture-brand-storyteller       personal-ip-builder (用户级)
   ├ daylighting-design          ├ storybrand-messaging            ├ social
   ├ woodworking                 ├ brand-voice / manifesto /       ├ xiaohongshu-content-strategist
   ├ product-research            │   architecture                  ├ hook-writer
   └ banana (出图)               ├ copywriting / copy-editing      ├ short-form-video-script
                                 ├ offers / sales-enablement       ├ facebook-strategy
   UKIR STUDIO (/render)         ├ emails / referrals              ├ ai-video-prompt
                                 ├ customer-research               ├ ai-seo
                                 ├ marketing-psychology            └ banana / canvas-design
                                 └ humanizer-zh / content-humanizer
                                                                   CIPTA STUDIO (/studio)
```

## 装了什么（按身份）

### 0. 品牌底稿 · `.agents/product-marketing.md`

| skill | 干什么 |
|---|---|
| `product-marketing` | 建立 / 更新品牌底稿。对 Claude 说「更新品牌上下文」，它会读现有版本、问缺什么、写回并记 changelog。 |

### A. 室内设计师

| skill | 干什么 | 什么时候会触发 |
|---|---|---|
| `interior-design-expert`（原有） | 尺寸 / 照度 / 色温 / 木作四要点 / 审图。回答必须带数字。 | 帮我看看这个布局、灯光怎么配、配色建议、柜子怎么做、审效果图 |
| `daylighting-design` | 自然采光、太阳几何、眩光控制、人工光与日光的衔接，附经验数字。补上「木作四要点 ① 光线」里西晒 / 落地窗那部分的底层知识。 | 西晒房间、朝向、采光、遮阳、日光下木色 |
| `woodworking` | 从描述 / 照片 / 草图出**柜体制作包**：需求分析 → 三视图 → 可旋转的 3D 模型（含爆炸图）→ 开料清单 → 排版图 → 五金清单 → 组装步骤 → QC 公差 → 成本表。全部 mm，不编关键尺寸。 | 开料、cut list、五金清单、给我这个柜子的图、3D |
| `product-research` | 按设计简报在网上找 6–10 个 FF&E 候选（尺寸 / 价格 / 交期），**每条留来源链接**，可存进项目 `product-library.csv`。 | 帮我找灯具 / 五金 / 家具候选、比价、采购清单 |
| `banana`（原有） | Gemini Nano Banana 出图 / 改图，有品牌预设与成本记录。 | 生成图片、改这张图、封面、海报 |

> `woodworking` 与 `interior-design-expert` 的分工：设计决策（人体工学、走道、灯光、材质搭配）先问 expert；确定了再让 woodworking 出制作包。
> woodworking 上游是欧美 DIY 语境，**用之前告诉它本地条件**：18mm 三聚氰胺板 / 多层板、4'×8' 板材、System 32 排孔、CNC 开料 —— 它会照着算。

### B. 家具品牌故事人

| skill | 干什么 | 什么时候会触发 |
|---|---|---|
| **`furniture-brand-storyteller`（自写，总控）** | 家具 / 木作 / 全屋定制品牌的叙事框架：五层结构（材料 → 手 → 方法 → 家 → 时间）、六种故事型（起源 / 案例 / 材料 / 幕后 / 人物 / 邀请）、中英双语规则、中文去 AI 味清单、事实红线、待确认清单。写完再路由到下面各 skill 执行。 | 品牌故事、案例故事、材料故事、展厅文案、邀请函措辞、WhatsApp 话术、这段像不像我们 |
| `storybrand-messaging` | StoryBrand SB7：客户是主角，我们是向导，三步计划，直接 CTA。附 BrandScript 工作表、网站线框文案、销售对话、邮件序列。全屋定制天然适合这个结构（咨询 → 量尺设计 → 安装）。 | 一句话介绍、elevator pitch、网站主信息、我们的信息不打动人 |
| `brand-voice` | 输出一份完整的语气指南：语气维度、5–6 条 voice 原则（做 / 不做）、用词表、渠道差异、改写前后对照、「我们从不说的话」。给新同事 / 外包写手用。 | 品牌语气、tone of voice、我们该怎么写、给文案的规范 |
| `brand-manifesto` | 300–500 字品牌宣言 + 100–150 字短版，四种语气（战吼 / 情书 / 安静的信念 / 挑衅）。溪岸适合「安静的信念」。 | manifesto、我们相信什么、给团队打气的品牌文件 |
| `brand-architecture` | 主品牌 / 子品牌关系与命名规则（Branded House / Endorsed / Hybrid）。溪岸 Sail × RICCIONE REKA × UKIR / CIPTA STUDIO 正是这个题。 | 再起一个 STUDIO 叫什么、子品牌怎么排、产品线命名 |
| `copywriting` | 网页 / 落地页 / about 页 / 产品页整页文案，转化导向。 | 写这页的文案、标题、CTA、价值主张 |
| `copy-editing` | 七遍审稿法（清晰 → 语气 → 具体 → 精简 → 说服 → 流畅 → 校对），改不重写。 | 帮我改一下、太啰嗦、润色 |
| `offers` | 设计「到底卖什么」：价值方程、保障设计、bonus 叠加、稀缺与紧迫（有禁用词表，不会写成割韭菜）。用来设计**到馆 offer**、定金保障、设计费抵扣。 | 为什么现在就该约、保障怎么写、offer 不转化 |
| `sales-enablement` | 销售一页纸、异议库、展厅讲解稿、案例简报、proposal 模板、人物卡。给 SD 用。 | 异议应对、给销售的材料、一页纸、讲解稿 |
| `emails` | 生命周期序列：欢迎 / 培育 / 再激活。**用于 WhatsApp 跟进时请说明**，它会把每封压成一条一件事。 | 跟进序列、需求卡填完之后发什么、到馆后发什么 |
| `referrals` | 转介绍 / 大使计划设计与衡量。对应 SAIL 的 H5「客户评价 + 转介绍动作」。 | 转介绍、老带新、口碑 |
| `customer-research` | 从需求卡、问卷、WhatsApp 记录、评论里挖客户原话与 JTBD；也能设计访谈。**这是文案最值钱的原料来源**。 | 客户到底怎么说、做人物画像、分析这些聊天记录 |
| `marketing-psychology` | 心理学与思维模型（锚定、社会认同、损失规避、JTBD…）及其伦理边界。 | 为什么客户不下定、怎么降低决策焦虑 |
| `humanizer-zh` | 中文去 AI 味（op7418 版，1.7 万星）：24 种 AI 写作特征的检测与重写，附评分。 | 去 AI 味、这段太像 AI、改成人话 |
| `content-humanizer` | 英文去 AI 味 + 注入品牌声音，附 AI 特征清单与评分脚本。 | sounds like AI、make it human |

### C. 内容创作者

| skill | 干什么 | 什么时候会触发 |
|---|---|---|
| `personal-ip-builder`（用户级，原有） | 定位诊断 / 选题 + 脚本 / 趋势差异化 / 发布打包 / 视频化。 | 个人 IP、选题、脚本、小红书 / 抖音 / 视频号文案、对标 |
| `social` | IG / TikTok / FB / YouTube 的内容支柱、帖子模板、短视频钩子库、**轮播五种架构**、爆款逆向工程、平台字数上限、社交聆听。 | 发什么、轮播、Reels 脚本、内容日历、复用这条内容 |
| `xiaohongshu-content-strategist` | 小红书专用：收藏率优先、标题 18–22 字且关键词前 8 字、封面文字 <10 字、3–5 个 tag、评论区预埋。 | 小红书、种草、笔记标题 |
| `hook-writer` | 只写开头：字幕第一行、视频前 3 秒、轮播封面、标题、邮件主题。先从内容里找钩子再打分，**不许标题党**。 | 开头怎么写、前三秒、封面文字、没人点 |
| `short-form-video-script` | WATCH 框架（前 3 秒 / 开环 / 静音可看 / 兑现承诺 / 结尾成环），三轨脚本（画面 / 字幕 / 口播）。 | Reels / TikTok / Shorts 脚本、完播率低、留存 |
| `facebook-strategy` | 2026 版 Facebook 打法：Page 广播已死（约 1.65% 触达），改打 Reels（陌生发现）+ Feed（熟人深度）+ Groups（社区）。马来西亚客户仍大量在 FB。 | Facebook 怎么做、FB 触达低、FB group |
| `ai-video-prompt` | AI 视频提示词的导演级写法（Seedance 2.5 / Kling / Veo 各自语法、运镜与灯光词汇、分镜、连续性）。给 CIPTA STUDIO 的「补拍指令」和 Higgsfield / fal.ai 用；**只补空镜，不生成真实案例**。 | 补拍指令、空镜 prompt、让静图动起来、Seedance 提示词 |
| `ai-seo` | GEO：让 ChatGPT / Gemini / Perplexity 在「KL 全屋定制推荐」这类问题里引用我们 —— 40–60 字自含答案块、对比表、FAQ、可见更新日期、robots.txt 放行 AI 爬虫。 | 怎么让 AI 推荐我们、AI 搜索、llms.txt |
| `banana` / `canvas-design`（用户级） | 出图 / 版式海报。 | 封面、海报、图 |

### D. 网站与工具（给做 /render /studio /invite 的人）

| skill | 干什么 |
|---|---|
| `frontend-design`（Anthropic 官方） | 做 UI 时避免「模板脸」：先从主题世界里找方向，再定字体、色彩、构图。邀请函、展厅页、内部工具都适用。 |

## 三条典型工作流

**1. 一个真实案例 → 一个月的内容**
`customer-research`（从需求卡 + 验收记录挖原话）→ `furniture-brand-storyteller`（案例故事型 B，出中英文正文 + 待确认清单）→ `social`（轮播 + 3 条 Reels 角度）+ `xiaohongshu-content-strategist`（2 篇笔记）+ `hook-writer`（每条的开头）→ `short-form-video-script`（其中 1 条写成三轨脚本）→ CIPTA STUDIO 排剪辑 → 缺空镜时 `ai-video-prompt` 写补拍指令 → `humanizer-zh` 终审。

**2. 到馆 offer + 跟进序列**
`offers`（60 分钟到馆能带走什么、保障怎么写）→ `storybrand-messaging`（一句话 + 三步计划）→ `emails`（需求卡填完 → 到馆前 → 到馆后 → 未下定 7 天，四条 WhatsApp）→ `sales-enablement`（SD 的异议一页纸）→ `furniture-brand-storyteller` 审语气。

**3. 一张草图 → 报价前的柜体包**
`interior-design-expert`（尺寸、走道、木作四要点、灯光）→ `daylighting-design`（西晒 / 采光复核）→ `woodworking`（三视图 + 3D + 开料 + 五金，先声明本地板材与 System 32）→ `product-research`（拉手 / 铰链 / 灯带候选，带来源）→ UKIR STUDIO 出效果图（材质色板锁色）。

## 没装但值得知道（MCP 与重型工具）

这些不是复制一个 markdown 就能用的：要装桌面软件、要 API key、或许可证不适合放进仓库。按需要接。

| 类别 | 工具 | 一句话 | 怎么接 |
|---|---|---|---|
| **3D / 出图基座** | [ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)（2.8 万星，MIT）+ [arjun988/blender-skills](https://github.com/arjun988/blender-skills) 的 `archviz` skill | 让 Claude 在 Blender 里按毫米建柜体 / 厨房，固定机位出多角度底图，再交给 `banana` 换材质出照片级效果图。解决「AI 图比例不对」的根。 | `claude mcp add blender uvx blender-mcp` + 装 Blender 插件；需要一台装了 Blender 的电脑 |
| **SketchUp** | [zinin/sketchup-mcp2](https://github.com/zinin/sketchup-mcp2)（毫米制，含榫卯 / 布尔 / 导出）· [mhyrr/sketchup-mcp](https://github.com/mhyrr/sketchup-mcp) | 团队若在 SketchUp 里工作，这是直接让 Claude 操作模型的路；OpenCutList 属性可直连开料。 | `uvx sketchup-mcp`，需 SketchUp Pro |
| **平面图（免费）** | [grimashevich/sweethome3d-mcp-server](https://github.com/grimashevich/sweethome3d-mcp-server)（GPL） | 42 个工具画墙 / 门窗 / 家具 / 多层，渲染基础图。 | Sweet Home 3D 插件 + `.mcp.json` 指向 localhost:9877 |
| **照片改造（付费）** | [MeltFlexDevs/skills](https://github.com/MeltFlexDevs/skills) · [eachlabs/skills](https://github.com/eachlabs/skills) | 把客户**自家厨房照片**换成我们的柜子、把真实 SKU 放进客户房间、简报 → 平面图。销售场景很硬，但闭源按张收费。 | `npx skills add …` + API key |
| **小红书图文卡片** | [op7418/guizang-social-card-skill](https://github.com/op7418/guizang-social-card-skill)（6.9 千星，**AGPL**） | 3:4 编辑杂志风轮播，HTML → Playwright 出 PNG，28 种版式、10 套主题，强制用真实照片。AGPL 所以不放进仓库，各人自装。 | `npx skills add https://github.com/op7418/guizang-social-card-skill` |
| **小红书 / 封面出图** | [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills)（2.6 万星，MIT） | `baoyu-xhs-images`（1–10 张风格一致的卡片，先出封面再以它为 ref）、`baoyu-cover-image`。与 banana 重叠在出图层，多的是「系列一致性」逻辑。 | `npx skills add jimliu/baoyu-skills` 只选那两个 |
| **对标与账号体检** | [JuneYaooo/social-account-doctor](https://github.com/JuneYaooo/social-account-doctor) | 小红书 / 抖音 / 视频号真实数据拆爆款、诊断自己账号、出仿写稿。 | 需 tikhub.io 付费 API + ffmpeg |
| **原片 → 中文解说视频** | [zenstory-ai/video-recap-skills](https://github.com/zenstory-ai/video-recap-skills) | 展厅 / 工地原片 → 解说脚本 → TTS → 字幕 → 可导出**剪映草稿**继续改。 | Python + ffmpeg + MiMo / Fish Audio key |
| **Remotion 视频** | [remotion-dev/skills](https://github.com/remotion-dev/skills)（官方）· [iart-ai/ecommerce-video-skills](https://github.com/iart-ai/ecommerce-video-skills) 的 `photo-slideshow` | 代码写视频；`photo-slideshow` 把一个案例的照片文件夹直接变成 Reel。我们目前主线是 video-use / HyperFrames / 剪映（见 [studio/RESEARCH.md](../../studio/RESEARCH.md)），Remotion 备用。 | `npx skills add remotion-dev/skills` |
| **AI 视频生成** | Higgsfield 官方远程 MCP（`.mcp.json` 已配置，**需在交互式会话里授权一次**） | 30+ 模型（Kling 3 / Veo 3 / Seedance / Sora 2…），配合 `ai-video-prompt` 写指令。 | `/mcp` 里完成 OAuth |
| **Canva** | [canva-sdks/canva-skills](https://github.com/canva-sdks/canva-skills)（官方，Apache-2.0） | 品牌模板批量出图、社媒尺寸重排、brand-check。本会话已挂 Canva connector。 | `/plugin marketplace add canva-sdks/canva-skills` |
| **网站 GEO 审计** | [zubair-trabzada/geo-seo-claude](https://github.com/zubair-trabzada/geo-seo-claude) · [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | 跑真实网址出 GEO 评分、生成 llms.txt、schema、本地 SEO（Google Business Profile）。`ai-seo` 是写法，这两个是体检。 | 两者都是较重的 Python 安装 |
| **照片批处理** | [danielrosehill/Claude-Image-Production-Plugin](https://github.com/danielrosehill/Claude-Image-Production-Plugin) | 自动白平衡 / 色调 / 拉直 / 放大 / 去 EXIF 转 web。目前 GitHub 上最接近「室内摄影后期」的东西。 | `/plugin install` |
| **品牌命名** | [glacierphonk/naming](https://github.com/glacierphonk/naming) | 隐喻驱动的命名流程 + 14 份参考（音义学、文化、反模式）。起系列名 / 饰面名时用；英文为主。 | clone 进 `.claude/skills/` |
| **英文去 AI 味（另一版）** | [blader/humanizer](https://github.com/blader/humanizer)（4.6 万星） | 25 种特征的权威版。已装 `content-humanizer`，二选一即可，避免触发打架。 | `npx skills add blader/humanizer` |

## 看过但不推荐

- **小红书 / 抖音自动发布类**（xpzouying/xiaohongshu-mcp、white0dew/XiaohongshuSkills、jfikrat/higgsfield-mcp 等）：靠读浏览器 cookie 模拟登录，封号风险 + 违反平台条款。要接就接官方远程 MCP。
- **`anthropics/skills` 的 `brand-guidelines`**：那是 Anthropic 自己的配色字体，不是通用品牌工具；它的价值是作为「品牌专属 skill」的范式 —— 我们已按这个范式写了 `furniture-brand-storyteller`。
- **通用 UI 设计包**（ui-ux-pro-max、design-spatial、taste-skill 等）：做网页的，不是做房子的。只留了 `frontend-design`。
- **建筑尺度包**（Skills-Architects 的 spatial-planning / material-selection、BIM / IFC 类）：讲的是办公楼走廊与混凝土，不是住宅柜体。只取了 `daylighting-design`。
- **antigravity-awesome-skills**（6,600+ skill 的聚合库）：搜索用可以，但很多条目来源与许可证不明、描述是占位符。凡从它看到的，我们都回到原始仓库去取。
- **室内设计「效果图一键」类付费包装**（SamurAIGPT、MUAPI、Atlas Cloud 等）：三行 prompt 套一个收费 API，`banana` + UKIR STUDIO 已覆盖。

## GitHub 上没有、我们得自己写的（空白）

调研三条线都确认了同一件事：**没有任何 skill 懂木头、五金、全屋定制的客户旅程，也没有中英双语的品牌文案 skill。** 所以：

- ✅ 已写：`furniture-brand-storyteller`（叙事 + 双语 + 中文去 AI 味 + 红线）、`.agents/product-marketing.md`（品牌底稿 v1）。
- ✅ 已有：`interior-design-expert` 的 SAIL 定制扩展（净尺寸、柜体、照度、木作四要点）。
- ⬜ 下一步候选（按价值排）：
  1. **五金与板材速查**加进 `interior-design-expert`：System 32（32mm 排孔、Ø5、距前沿 37mm）、35mm 杯状铰链与门高 / 铰链数、Minifix Ø15 偏心件、Confirmat 7×50、全拉出滑轨承重、18mm 板封边 —— 这是 GitHub 上只有零星无许可证片段的东西。
  2. **拆单本地化**：把 `woodworking` 的参考文件改成本地板材规格、4'×8' 排版、CNC 开料与封边清单。
  3. **视频号 / 马来西亚三语（中 / EN / BM）字幕规则**：目前所有中文 skill 默认大陆平台，所有英文 skill 默认美国受众。
  4. **展厅动线与讲解稿**、**到馆 → 报价 → 复尺 → 定金的 WhatsApp 节奏**：B2C 高客单价的咨询式跟进，现有 `emails` / `sales-enablement` 需要每次说明场景。

## 维护

- **加一个 skill**：新建目录 + `SKILL.md`，frontmatter 的 `name` 必须与目录名一致，`description` 写清楚触发词（中英都写）；营销类的开头加一句「先读 `.agents/product-marketing.md`」。写完可用 `skill-creator` 跑评测。
- **更新第三方 skill**：[THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md) 记了每个的来源仓库与 commit。重新 `git clone --depth 1` 上游，把对应目录覆盖回来，再把「本地改动」那几处重新打上（上下文路径、name）。或者用 `npx skills add <owner/repo> --skill <name> --copy`。
- **觉得 skill 太多、触发打架**：删目录即可，没有别的注册表。优先删重叠的（例如 `content-humanizer` vs `humanizer-zh` 各留一种语言）。
- **不要放进来的**：任何要读浏览器 cookie 的自动化、任何 AGPL 代码（各人自装）、任何没有许可证的仓库（只能参考着自己写）。
