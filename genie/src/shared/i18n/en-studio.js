// 英文词典 · 3D 梦想工作室、平面图编辑器（新加的句子放这里；key = 中文原文，规则见 src/shared/i18n.js）
// 英式英语（colour、metre），界面字短；「客人」在工作室里是设计师口中的 client。

export default {
  // ── 页面标题（品牌一律 BRAND.full 的写法） ──
  '3D 梦想工作室 · WISH by RICCIONE REKA': '3D Dream Studio · WISH by RICCIONE REKA',

  // ── 面板、工具条 ──
  定个情绪: 'Set the Mood',
  '情绪 · 材质 · 光': 'Mood · Material · Light',
  展开情绪面板: 'Open the mood panel',
  收起面板: 'Hide panel',
  情绪仪表: 'Mood meter',
  '材质板 · MOODBOARD': 'Moodboard',
  金色黄昏: 'Golden hour',
  入夜: 'After dark',
  日光: 'Daylight',
  拖太阳调时间: 'Drag the sun to set the time',
  材质类别: 'Material categories',
  正在换: 'Changing',
  更多: 'More',
  材质标签: 'Material labels',
  演示模式: 'Demo mode',
  '自动环绕 + 24 小时光影': 'Slow orbit through 24 hours of light',

  // ── 客人档案、雷区 ──
  这位客人: 'the client',
  '客人的材质、收纳、雷区会自动带进 3D': 'Their materials, storage and deal-breakers flow straight into the 3D',
  '已按 {0} 的雷区避开：{1}': 'Kept clear of {0}’s deal-breakers: {1}',
  '{0} 说过不要「{1}」—— 想试试也可以，按撤销就能还原': 'Heads-up: {0} ruled out “{1}” — try it if you like; Undo puts it back',
  '为 {0} 定制 · {1}': 'Tailored for {0} · {1}',

  // ── 收纳对账（设计师） ──
  收纳对账: 'Storage check',
  设计师: 'Designer',
  '{0} 项还差一点': '{0} still short',
  客人数的收纳都放进去了: 'Everything the client counted fits',
  '客人许愿时数的量 vs 3D 里自动摆进去的。点一行，选中那件家具。': 'What the client counted on their Wish Journey vs what the 3D fitted in. Tap a row to select that piece.',
  '客人数的：{0}': 'Client counted: {0}',
  '想要 {0} 座': 'Wants {0} seats',
  '还差 {0}。{1}': 'Short by {0}. {1}',
  餐位: 'Dining seats',
  // 一个词，和建议（No storeroom: …）、房间类型一致（en-base 里旧的 'Store room' 由这里盖过去）
  储物间: 'Storeroom',
  '{0}衣柜': '{0} wardrobe',
  '{0} / {1} 座': '{0} / {1} seats',
  '{0} 座': '{0} seats',
  '3D 里还没有这一件': 'Not in the 3D yet',
  客人没数: 'Not counted',

  // ── 示范户型、许愿模式、展厅 ──
  '这是示范户型 —— 点右上角「平面图」上传你的平面图': 'This is a demo layout — tap “Floor plan” at the top right to upload your own',
  '示范户型 · 概念示意': 'Demo layout · concept only',
  '示范户型 · 设计师会换成你家的平面图': 'Demo layout · your designer will swap in your own floor plan',
  长按退出演示: 'Press and hold to exit the demo',

  // ── 画布、画质、截图 ──
  '3D 需要重新载入': 'The 3D view needs to reload',
  '3D 画面恢复了。如果看起来不对，重新载入一下就好 —— 方案已经自动保存。': 'The 3D view is back. If anything looks off, just reload — your project is saved.',
  '这台设备暂时收回了图形内存（iPad 上偶尔会这样）。方案已经自动保存，重新载入就能接着做。': 'This device reclaimed its graphics memory (iPads do this now and then). Your project is saved — reload to carry on.',
  重新载入: 'Reload',
  '这台设备暂时存不了高清图，换「流畅」画质再试一次': 'This device couldn’t save a high-res image — switch quality to “Fast” and try again',
  自动: 'Auto',
  高清: 'High',
  流畅: 'Fast',
  '电脑、大屏用高清；iPad、手机用流畅（省电、不发烫）。': 'High on computers and big screens; Fast on iPads and phones (cooler and kinder to the battery).',
  '柔和阴影、环境光遮蔽、景深都打开。适合电脑和展厅大屏。': 'Soft shadows, ambient occlusion and depth of field, all on. Best for computers and the showroom screen.',
  '画面稍简单，但更顺、更省电。iPad 用久了发烫时选它。': 'A little simpler, but smoother and lighter on power. Choose it if an iPad starts to feel warm.',
  '切换后会重新载入这一页，方案已经自动保存。': 'Switching reloads this page — your project is already saved.',
  完成: 'Done',
  '识别模型、接口地址': 'Detection model and endpoint',
  '改动会自动保存在这台设备上。': 'Changes save automatically on this device.',

  // ── 加家具 ──
  '{0} 已贴到最近的那面墙上': '{0} added to the nearest wall',

  // ── 重新生成、分享 ──
  '重新生成 3D？': 'Rebuild the 3D?',
  '重新生成会按新平面图自动摆家具，你手动调整过的家具位置会被覆盖。之后可以按撤销找回。': 'Rebuilding furnishes the floor plan afresh and replaces the furniture you moved by hand. You can still bring it back with Undo.',
  重新生成: 'Rebuild',
  '3D 已生成。家具是按设计师的规则自动摆的，拖一拖就能改。': '3D ready. Furniture was placed by our designers’ rules — drag anything to change it.',
  分享: 'Share',
  '3D 概念：{0}': '3D concept: {0}',
  '打开就能转、能换材质：{0}': 'Open it to spin the model and swap materials: {0}',
  '{0}（分享）': '{0} (shared)',
  分享的方案: 'Shared project',
  分享来的: 'Shared with you',

  // ── 怎么用（帮助） ──
  '把底部的色块{0}（地板、墙、柜子、沙发…），那一组表面会发金光，放手就换上。也可以先在左边材质板点一个表面，再点色块。':
    'Drag a swatch from the bottom bar {0} (floor, walls, cabinets, sofa…). That group of surfaces glows gold — let go to apply it. Or tap a surface in the moodboard on the left first, then tap a swatch.',
  // 中文用面板上的中文名（温暖 / 明亮 / 沉浸）；英文的按钮本来就叫 Cosy / Bright / Moody
  '左上角「温暖 / 明亮 / 沉浸」一键换整套材质和时间；有许愿档案时，第一个按钮就是客人自己的梦想家配色。客人的雷区会自动避开。':
    'Cosy, Bright and Moody at the top left swap every material and the time of day in one tap. With a Wish Journey profile, the first button is the client’s own Dreamer palette — and their deal-breakers are always kept out.',
  // 不说「右边」：iPad 竖放、手机上时间滑杆在底部
  '拖太阳或时间滑杆，太阳从清晨走到深夜；窗上的树影、斜进来的光柱、夜里的灯都会跟着变。':
    'Drag the sun or the time slider to go from early morning to late night — tree shadows on the windows, slanting shafts of light and the evening lamps all follow.',
  '拖动家具换位置；点一下出现小工具条：旋转、换款、复制、移走。底部「家具」可以加家具（键盘：R 旋转、Delete 移走）。':
    'Drag furniture to move it; tap a piece for a small toolbar: rotate, change style, duplicate, remove. Add pieces from “Furniture” in the bottom bar (keyboard: R rotates, Delete removes).',
  '单指 / 左键拖：转；双指 / 滚轮：缩放；右键 / 三指：平移。视角按钮换角度，墙按钮切换墙的高低。':
    'One finger / left-drag: orbit. Two fingers / scroll: zoom. Right-drag / three fingers: pan. The view button changes the angle; the wall button raises or lowers the walls.',
  '按「平面图」上传图片或 PDF，AI 先认出房间和门窗，你拖一拖校正，按「生成 3D」—— 家具按设计师规则自动摆好，衣柜、鞋柜长度按客人许愿时数出来的量。':
    'Tap “Floor plan” to upload an image or PDF. AI finds the rooms, doors and windows; drag to correct them, then tap “Generate 3D” — furniture is placed by our designers’ rules, with wardrobes and shoe cabinets sized from what the client counted on their Wish Journey.',
  '「更多」里的演示模式：自动环绕 + 一天的光影循环。展厅大屏直接打开 studio.html?demo=1（只显示示范户型，不会出现客人名字；长按左下角 WISH 字标 1.5 秒或按 Esc 退出）。相机按钮下载带品牌的高清概念图。':
    'Demo mode (under “More”) orbits slowly through a full day of light. For the showroom screen, open studio.html?demo=1 — it only ever shows the demo layout, never a client’s name; press and hold the WISH wordmark (bottom left) for 1.5 s, or press Esc, to exit. The camera button saves a branded high-res concept image.',
  // 许愿模式（客人在展厅 iPad 上）：平面图只能画、没有相机按钮
  '按「平面图」拉方块画房间、点墙放门窗，再按「生成 3D」—— 家具按设计师规则自动摆好。你家真正的平面图，设计师之后会换上去。':
    'Tap “Floor plan”, drag out a box for each room and tap a wall to add doors and windows, then tap “Generate 3D” — furniture is placed by our designers’ rules. Your designer will swap in your home’s real floor plan afterwards.',
  '「更多」里的演示模式：自动环绕 + 一天的光影循环；点任意处退出。': 'Demo mode (under “More”) orbits slowly through a full day of light — tap anywhere to exit.',
  '平面图：画 / 修改': 'Floor plan: draw / edit',

  // ── 开始一个空间 ──
  '图片或 PDF。填了 AI key 会自动识别房间，校正 30 秒就能生成 3D。': 'An image or PDF. With an AI key, the rooms are found for you — check them for 30 seconds and you have 3D.',

  // ── 平面图编辑器 ──
  // 标题栏的短标签：只在英文、iPad 横放（1024–1279）和手机上用（「用模板…」= Use a template…）
  模板: 'Template',
  工具: 'Tools',
  放大: 'Zoom in',
  缩小: 'Zoom out',
  双指: 'Two fingers',
  '拖房间移动 · 拖角改尺寸 · 点门窗再拖': 'Drag a room to move it · drag a corner to resize · tap a door or window, then drag',
  '按住拖出一个方块 = 一个房间': 'Drag out a box — each box is a room',
  点一下墙放门: 'Tap a wall to add a door',
  点一下墙放窗: 'Tap a wall to add a window',
  点一下墙放落地趟门: 'Tap a wall to add a sliding door',
  '点一下两个空间之间的墙，把它打通': 'Tap the wall between two spaces to open it up',
  '点两下量一段已知长度，再输入真实尺寸': 'Tap twice along a known length, then enter its real size',
  拖动底图对齐房间: 'Drag the underlay to line it up with the rooms',
  '{0}：按住拖出方块；边会自动吸到旁边房间的边上。': '{0}: drag out a box; its edges snap to the neighbouring rooms.',
  '{0}：选工具后点一下墙（鼠标会先出现金色预览）。': '{0}: pick the tool, then tap a wall (with a mouse you’ll see a gold preview first).',
  '{0}：两个空间之间不要墙（开放式厨房）。客厅 / 餐厅 / 玄关 / 走廊之间默认已打通。': '{0}: no wall between two spaces (an open kitchen). Living, dining, foyer and corridor already open onto each other.',
  '{0}：决定阳光从哪边进来（西晒看得出来）。': '{0}: sets where the sun comes in (you’ll see the hot west sun in the afternoon).',
  '{0}：捏合缩放、拖动平移。': '{0}: pinch to zoom, drag to pan.',
  '底图已放好。用「画房间」沿着墙描一遍；先用量尺校准比例会更准。（设置里填 Gemini key 就能 AI 自动识别）':
    'Underlay in place. Trace the walls with “Draw room” — calibrating the scale with the ruler first makes it more accurate. (Add a Gemini key in Settings for automatic AI detection.)',
  '这台设备读不了 PDF：请更新 iPadOS，或把平面图截图成 JPG / PNG 再上传': 'This device can’t read PDFs — update iPadOS, or upload a JPG / PNG screenshot of the plan instead',
  '底图已放好。用「画房间」沿着墙描一遍；先用量尺校准比例会更准。': 'Underlay in place. Trace the walls with “Draw room” — calibrating the scale with the ruler first makes it more accurate.',
  // ── 3D 画不出来时的提示（着色器编译失败 / 后期链画出空画面 → 自动降画质；电脑、手机、iPad 都可能） ──
  '这台设备的显卡跑不动高画质，已自动降低画质。': 'This device’s graphics can’t handle the high-quality mode, so the studio lowered the quality automatically.',
  '这台设备的浏览器画不出 3D：请在浏览器设置里打开「硬件加速」，或更新浏览器、系统和显卡驱动后再试。': 'This device’s browser can’t draw the 3D view. Turn on hardware acceleration in the browser settings, or update the browser, the system and the graphics driver, then try again.',
  // ── 多层（3D 的楼层按钮、生成后的提示、模板卡的小章、怎么用） ──
  楼层: 'Floors',
  全部: 'All',
  看整栋: 'Whole house',
  '两层都生成好了 —— 点「一楼 / 二楼」看每一层': 'Both floors are ready — tap “Ground / First” to see each floor',
  '{0} 层都生成好了 —— 点楼层按钮看每一层': 'All {0} floors are ready — tap a floor button to see each one',
  双层: 'Two-storey',
  三层: 'Three-storey',
  四层: 'Four-storey',
  多层: 'Multi-storey',
  '两层以上的房子：用楼层按钮「全部 / 二楼 / 一楼」一层层看（看一楼时楼上收起来，影子还在；键盘 PageUp / PageDown）。':
    'Two storeys or more: use the floor buttons “All / First / Ground” to look floor by floor (upstairs folds away but its shadow stays; PageUp / PageDown on a keyboard).',
  '双层、三层的房子：编辑器上面有楼层标签，楼梯工具把上下层连起来。': 'Two- and three-storey houses: the editor has floor tabs, and the stairs tool links the floors.',
  // ── 诊断面板（studio.html?diag=1，按钮本来就中英并列） ──
  '收起 Hide': 'Hide',
  '诊断 Diag': 'Diag',
  '复制 Copy': 'Copy',
  '流畅画质 Fast': 'Fast quality',
  '兼容画质 Safe': 'Safe quality',
  '清除本机方案 Reset': 'Reset this device’s projects',
};
