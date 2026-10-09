/* ============================================================
   Moodboard 生成器 · 资料库
   ------------------------------------------------------------
   空间 · 功能卖点 · 风格方向 · 需求卡对照 · 内置图库
   全部是纯资料：要改文案、加空间、换配色，只动这一份。

   文案写法（对齐《快思慢想》）：
   - 标题说「得到什么」，不是「这是什么」（System 1 只读结果）
   - why 用「避免损失」的说法（损失厌恶：少一个麻烦 > 多一个功能）
   - 不编数字。要放数字，就由销售填真实的尺寸与数量。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  /* ---------- 空间 ------------------------------------------
     key       内部代号（不可改）
     head      房间页上的一句话「这个空间会变成什么样」
     feats     可勾选的卖点，def:true 为默认勾选
     prep      到馆那天可以为这个空间准备的东西（销售要确认展厅真的有）；short 用在讲解稿里
     hint      「为你」那一句的填写示范                              */
  MB.ROOMS = [
    {
      key: 'foyer', en: 'Foyer', zh: '玄关',
      head: { en: 'First impression, zero clutter.', zh: '一进门，就是干净的。' },
      hint: '例：你们鞋子很多 —— 整面通顶鞋柜，门口不再堆鞋。',
      prep: { en: 'A ventilated shoe-cabinet sample to open and try', zh: '透气鞋柜样板，可以打开亲手试', short: { en: 'the ventilated shoe-cabinet sample', zh: '透气鞋柜样板' } },
      feats: [
        { id: 'fullheight', def: true, en: 'Full-height storage wall', zh: '通顶收纳墙',
          why: { en: 'No dusty gap on top — the whole wall works, floor to ceiling.', zh: '柜顶不留缝、不积灰，整面墙从地面用到天花。' } },
        { id: 'understair', def: true, en: 'Under-stair storage', zh: '楼梯底收纳',
          why: { en: 'The awkward triangle under the stairs stops being dead space.', zh: '楼梯下那块尴尬的三角位，不再是死角。' } },
        { id: 'ventilated', en: 'Ventilated shoe compartments', zh: '透气鞋柜',
          why: { en: 'Closed cabinets trap humidity and odour — vents keep the air moving.', zh: '密封鞋柜在潮湿天气容易闷出味道，透气设计让空气流动。' } },
        { id: 'floating', en: 'Floating base with night light', zh: '悬空柜 + 底部灯带',
          why: { en: 'Daily shoes slide underneath and the floor stays easy to mop.', zh: '常穿的鞋直接放底下，地面好拖，柜子也更轻盈。' } },
        { id: 'dropzone', en: 'Key & parcel niche', zh: '钥匙包裹置物格',
          why: { en: 'Keys, mail and parcels stop landing on the dining table.', zh: '钥匙、信件、快递不再堆到餐桌上。' } },
        { id: 'bench', en: 'Shoe-changing bench', zh: '换鞋凳',
          why: { en: 'Sit down to change — easier for kids and parents alike.', zh: '坐着换鞋，小孩和长辈都方便。' } }
      ]
    },
    {
      key: 'living', en: 'Living Room', zh: '客厅',
      head: { en: 'Storage that disappears into the wall.', zh: '收纳藏进墙里，客厅只留生活。' },
      hint: '例：你们书和收藏多 —— 留一段带灯的展示格，不用再放在箱子里。',
      prep: { en: 'Our full-wall TV cabinetry, at 1:1 scale', zh: '1:1 的整墙电视柜，现场看比例', short: { en: 'the 1:1 TV wall', zh: '1:1 整墙电视柜' } },
      feats: [
        { id: 'tvwall', def: true, en: 'Full-wall TV cabinetry', zh: '整墙电视柜',
          why: { en: 'Everything hides behind clean doors; the TV becomes part of the wall.', zh: '杂物全收进柜门后面，电视融进墙里，不再是客厅的主角。' } },
        { id: 'display', def: true, en: 'Lit display shelving', zh: '灯光展示格',
          why: { en: 'Books and the things you love finally leave the boxes.', zh: '书和收藏终于有位置，不再一直放在箱子里。' } },
        { id: 'floatingconsole', en: 'Floating TV console', zh: '悬空电视柜',
          why: { en: 'The robot vacuum passes underneath; the room reads wider.', zh: '扫地机器人钻得进去，空间看起来更宽。' } },
        { id: 'hidden', en: 'Hidden wiring & router bay', zh: '隐藏线路柜',
          why: { en: 'No more tangle of cables and set-top boxes on show.', zh: '路由器、机顶盒、电线全部藏起来，不再一团乱。' } },
        { id: 'fluted', en: 'Fluted timber accent', zh: '木格栅饰面',
          why: { en: 'Warmth and texture without adding a single object.', zh: '多一份温度与层次，却不多一件杂物。' } }
      ]
    },
    {
      key: 'dining', en: 'Dining', zh: '餐厅',
      head: { en: 'Everything for the table, within reach.', zh: '吃饭要用的，伸手就有。' },
      hint: '例：你们常请朋友来吃饭 —— 餐边柜放酒杯与餐具，开饭不用跑厨房。',
      prep: { en: 'A sideboard with a pull-out appliance shelf to try', zh: '带电器拉板的餐边柜，可以现场拉拉看', short: { en: 'the sideboard with its pull-out shelf', zh: '带拉板的餐边柜' } },
      feats: [
        { id: 'sideboard', def: true, en: 'Sideboard with appliance pull-out', zh: '餐边柜 + 电器拉板',
          why: { en: 'Kettle, coffee machine and rice cooker get a home; the counter stays clear.', zh: '热水壶、咖啡机、电饭锅都有位置，台面保持清爽。' } },
        { id: 'coffeebar', en: 'Coffee & tea corner', zh: '咖啡茶水角',
          why: { en: 'Morning coffee without crossing the whole kitchen.', zh: '早上的咖啡，不用穿过整个厨房。' } },
        { id: 'tall', en: 'Tall pantry', zh: '餐厅高柜',
          why: { en: 'Snacks, dry food and bulk buys stop spilling onto the counter.', zh: '零食、干货、囤货不再摊在台面上。' } }
      ]
    },
    {
      key: 'kitchen', en: 'Kitchen', zh: '厨房',
      head: { en: 'Easy on a busy weekday, beautiful on Sunday.', zh: '平日好用，周末好看。' },
      hint: '例：你们天天开火 —— 锅具放在腰部高度的拉篮，不用再跪在深柜前翻找。',
      prep: { en: 'Your kitchen boards and handles, laid out in daylight', zh: '你们厨房的板材与把手实物，在自然光下摆好', short: { en: 'your kitchen boards and handles', zh: '你们厨房的板材与把手' } },
      feats: [
        { id: 'topbase', def: true, en: 'Top + base cabinets', zh: '吊柜 + 地柜',
          why: { en: 'Maximum closed storage — what you don’t use daily goes up and out of sight.', zh: '收纳量最大：不常用的放上面，看不见就不乱。' } },
        { id: 'pantry', def: true, en: 'Tall pull-out pantry', zh: '高柜拉篮',
          why: { en: 'Every jar in one glance — nothing expires at the back of a deep cabinet.', zh: '瓶瓶罐罐一眼看完，不再有东西卡在深柜里过期。' } },
        { id: 'openshelf', en: 'Open shelving instead of top cabinets', zh: '开放层架代替吊柜',
          why: { en: 'Daily bowls within reach; the kitchen feels open, not boxed in.', zh: '每天用的碗杯伸手就拿，厨房通透不压迫。' } },
        { id: 'appliance', en: 'Built-in appliance tower', zh: '嵌入式电器高柜',
          why: { en: 'Oven and steamer at eye level — no bending, no visual clutter.', zh: '烤箱蒸炉在视线高度，不用弯腰，也不显乱。' } },
        { id: 'island', en: 'Island with storage', zh: '中岛（带收纳）',
          why: { en: 'Prep, breakfast and homework in one spot, storage on both sides.', zh: '备菜、早餐、写功课都在这里，两面都能收纳。' } },
        { id: 'wetkitchen', en: 'Moisture-resistant wet kitchen', zh: '湿厨房防潮柜体',
          why: { en: 'Steam and splashes every day — carcass and edges specified for wet use, so doors don’t swell.', zh: '天天蒸汽水渍，柜体与封边按湿区规格做，柜门不会泡胀。' } },
        { id: 'skeleton', en: 'Skeleton-line frame detail', zh: '骨骼线框细节',
          why: { en: 'A fine frame line gives the doors shadow and rhythm — detail without ornament.', zh: '细线框让柜门有光影节奏，有细节但不繁复。' } }
      ]
    },
    {
      key: 'laundry', en: 'Laundry', zh: '洗衣房',
      head: { en: 'Wash, dry, fold — in one quiet corner.', zh: '洗、晾、叠，一个角落安静完成。' },
      hint: '例：你们有帮佣 —— 高柜放吸尘器和清洁用品，一次拿齐。',
      prep: { en: 'Floating and base laundry units side by side, to compare', zh: '悬空柜与落地柜并排，现场比较', short: { en: 'the two laundry options side by side', zh: '两种洗衣房柜体' } },
      feats: [
        { id: 'floating', def: true, en: 'Floating cabinet', zh: '悬空柜',
          why: { en: 'Baskets and the mop live underneath; the floor dries faster.', zh: '洗衣篮和拖把放下面，地面干得更快。' } },
        { id: 'tallbroom', def: true, en: 'Tall utility cupboard', zh: '清洁高柜',
          why: { en: 'Vacuum, mop and ironing board stand inside, charging, out of sight.', zh: '吸尘器、拖把、烫衣板站在里面充电，看不见。' } },
        { id: 'base', en: 'Base cabinet with folding counter', zh: '地柜 + 折衣台面',
          why: { en: 'Laundry gets folded where it’s washed — not on the sofa.', zh: '在哪洗就在哪叠，不再堆在沙发上。' } },
        { id: 'dryingrack', en: 'Hidden drying rack', zh: '隐藏晾衣架',
          why: { en: 'Delicates dry indoors, and the rack folds away when not in use.', zh: '贵重衣物室内晾干，不用时收起来。' } }
      ]
    },
    {
      key: 'master', en: 'Master Bedroom', zh: '主卧',
      head: { en: 'A calm wall of wood that holds everything.', zh: '一面安静的木墙，装下所有衣物。' },
      hint: '例：你们衣服特别多 —— 衣柜做到天花，换季衣物和行李箱放最上层。',
      prep: { en: 'A 1:1 full-height wardrobe you can open and try', zh: '1:1 通顶衣柜样板，可以打开亲手试', short: { en: 'a 1:1 full-height wardrobe', zh: '1:1 通顶衣柜样板' } },
      feats: [
        { id: 'fullheight', def: true, en: 'Full-height wardrobe', zh: '通顶衣柜',
          why: { en: 'The top section that usually collects dust becomes luggage and seasonal storage.', zh: '平时积灰的柜顶，变成放行李箱与换季衣物的空间。' } },
        { id: 'handleless', def: true, en: 'Handleless grooves', zh: '无把手隐形拉槽',
          why: { en: 'Nothing to bump into, nothing to dust — just a quiet wall.', zh: '没有把手可撞、可积灰，只留一面安静的墙。' } },
        { id: 'lighting', en: 'Sensor lighting inside', zh: '柜内感应灯',
          why: { en: 'Open the door and the light comes on — no fumbling at 6 a.m.', zh: '开门就亮，早上六点不用摸黑找衣服。' } },
        { id: 'drawers', en: 'Inner drawers & accessory trays', zh: '内抽 + 饰品格',
          why: { en: 'Watches, belts and jewellery each get a place — nothing tangled.', zh: '手表、皮带、首饰各有位置，不再缠成一团。' } },
        { id: 'headboard', en: 'Built-in headboard & side tables', zh: '床头背板 + 床头柜',
          why: { en: 'Reading light, charger and books exactly where the hand goes.', zh: '阅读灯、充电线、书本就在手边。' } }
      ]
    },
    {
      key: 'walkin', en: 'Walk-in Wardrobe', zh: '衣帽间',
      head: { en: 'Every piece in sight.', zh: '每一件，都看得见。' },
      hint: '例：你们两个人的衣物分左右两边，早上不用互相等。',
      prep: { en: 'Our walk-in wardrobe set, with open hanging and island drawers', zh: '展厅的衣帽间样板：开放挂衣 + 中岛抽屉', short: { en: 'our walk-in wardrobe set', zh: '衣帽间样板' } },
      feats: [
        { id: 'open', def: true, en: 'Open hanging, lit', zh: '开放挂衣 + 灯光',
          why: { en: 'See everything you own — no forgotten clothes at the back.', zh: '拥有的衣服一眼看完，不再有被遗忘在后面的衣服。' } },
        { id: 'island', en: 'Island with drawers', zh: '中岛抽屉',
          why: { en: 'Folded knits and accessories, at a height you can read.', zh: '叠放的衣物和饰品，放在看得清的高度。' } },
        { id: 'his-hers', en: 'His & hers zones', zh: '两人分区',
          why: { en: 'Two routines, no queue in the morning.', zh: '两个人的作息，早上不用排队。' } }
      ]
    },
    {
      key: 'vanity', en: 'Vanity', zh: '梳妆台',
      head: { en: 'The morning routine, in one arm’s reach.', zh: '早上的一套流程，伸手就完成。' },
      hint: '例：太太早上护肤步骤多 —— 每一瓶都有固定位置，不用翻抽屉。',
      prep: { en: 'A vanity with divided drawers and a lit mirror to try', zh: '带分格抽屉与灯镜的梳妆台，现场试用', short: { en: 'the vanity with its lit mirror', zh: '带灯镜的梳妆台' } },
      feats: [
        { id: 'integrated', def: true, en: 'Vanity with open shelving', zh: '梳妆台 + 开放层架',
          why: { en: 'Everything for the morning in one place, nothing on the bed.', zh: '早上要用的都在一处，不再摊在床上。' } },
        { id: 'mirror', def: true, en: 'Lit mirror', zh: '带灯镜面',
          why: { en: 'Even, shadow-free light — what you see is what others see.', zh: '均匀无阴影的光，你看到的就是别人看到的。' } },
        { id: 'drawers', en: 'Divided drawers', zh: '分格抽屉',
          why: { en: 'Every lipstick and brush has its place.', zh: '每一支口红、每一把刷子都有位置。' } }
      ]
    },
    {
      key: 'bathroom', en: 'Bathroom', zh: '浴室',
      head: { en: 'Dry, light and easy to clean.', zh: '干爽、轻盈、好打理。' },
      hint: '例：家里小孩多 —— 悬空柜底不积水，地面一拖就干净。',
      prep: { en: 'Moisture-proof board samples, edges and all', zh: '防潮板与封边的实物样板', short: { en: 'the moisture-proof board samples', zh: '防潮板样板' } },
      feats: [
        { id: 'floating', def: true, en: 'Floating vanity', zh: '悬空浴室柜',
          why: { en: 'No water pooling at the base; the floor is wiped in one pass.', zh: '柜底不积水，地面一拖就干净。' } },
        { id: 'mirrorcab', def: true, en: 'Mirror cabinet', zh: '镜柜',
          why: { en: 'Toiletries disappear behind the mirror; the counter stays clear.', zh: '瓶瓶罐罐收进镜子后面，台面保持干净。' } },
        { id: 'moisture', en: 'Moisture-proof board, sealed edges', zh: '防潮板 + 全封边',
          why: { en: 'Built for steam — no swelling, no peeling.', zh: '为蒸汽而做，不胀、不脱皮。' } },
        { id: 'niche', en: 'Recessed shower niche', zh: '淋浴壁龛',
          why: { en: 'Bottles off the floor, nothing to knock over.', zh: '瓶子不再放地上，也不会被碰倒。' } }
      ]
    },
    {
      key: 'bedroom', en: 'Bedroom', zh: '卧室',
      head: { en: 'A room that grows with them.', zh: '一间会跟着孩子长大的房间。' },
      hint: '例：孩子 6 岁 —— 低位开放收纳，他自己就能收玩具。',
      prep: { en: 'Adjustable wardrobe interiors you can reconfigure by hand', zh: '可调式衣柜内部，现场亲手调整', short: { en: 'the adjustable wardrobe interiors', zh: '可调式衣柜' } },
      feats: [
        { id: 'wardrobe', def: true, en: 'Adjustable wardrobe', zh: '可调衣柜',
          why: { en: 'Rails and shelves move up as they grow — from baby clothes to school uniforms.', zh: '挂杆层板跟着长高，从婴儿衣到校服都放得下。' } },
        { id: 'toy', en: 'Low open toy storage', zh: '低位玩具收纳',
          why: { en: 'If kids can reach it, kids can tidy it.', zh: '孩子够得着，孩子就会自己收。' } },
        { id: 'desk', en: 'Study desk & shelving', zh: '书桌 + 书架',
          why: { en: 'Homework has a home that isn’t the dining table.', zh: '写功课有自己的位置，不再占餐桌。' } },
        { id: 'bedstorage', en: 'Bed with storage', zh: '收纳床',
          why: { en: 'Spare bedding and out-of-season things vanish under the bed.', zh: '备用被褥与换季物品收进床底。' } }
      ]
    },
    {
      key: 'study', en: 'Study', zh: '书房',
      head: { en: 'Focus, with everything at hand.', zh: '专注，而且什么都在手边。' },
      hint: '例：先生在家办公 —— 书桌线路全部藏好，视频会议背景就是书墙。',
      prep: { en: 'Our book-wall set, with cable management built in', zh: '展厅书墙样板，看线路怎么藏', short: { en: 'our book-wall set', zh: '书墙样板' } },
      feats: [
        { id: 'bookwall', def: true, en: 'Floor-to-ceiling book wall', zh: '通顶书墙',
          why: { en: 'Your books become the room’s architecture — and your video-call background.', zh: '书本身就是空间的一部分，也是视频会议最好的背景。' } },
        { id: 'desk', def: true, en: 'Built-in desk, cables hidden', zh: '书桌 + 线路管理',
          why: { en: 'Chargers, monitor cables and the printer disappear.', zh: '充电线、屏幕线、打印机全部隐藏。' } },
        { id: 'files', en: 'Closed file storage', zh: '文件收纳',
          why: { en: 'Paperwork out of sight, still within reach.', zh: '文件看不见，但伸手就拿得到。' } }
      ]
    },
    {
      key: 'altar', en: 'Altar Cabinet', zh: '神台',
      head: { en: 'A dignified place for family traditions.', zh: '为家里的传统，留一个端正的位置。' },
      hint: '例：家里每天上香 —— 台面耐热，下方抽屉放香烛与供品。',
      prep: { en: 'Heat-resistant top samples for daily incense', zh: '耐热台面样板（适合每日上香）', short: { en: 'the heat-resistant top samples', zh: '耐热台面样板' } },
      feats: [
        { id: 'altar', def: true, en: 'Built-in altar cabinet', zh: '嵌入式神台柜',
          why: { en: 'A respectful, dedicated place that fits the room’s design.', zh: '一个端正专属的位置，也和整体设计协调。' } },
        { id: 'storage', def: true, en: 'Closed storage below', zh: '下方收纳',
          why: { en: 'Joss sticks, candles and offerings stay tidy and out of sight.', zh: '香、烛、供品整齐收好，不外露。' } },
        { id: 'heat', en: 'Heat-resistant top', zh: '耐热台面',
          why: { en: 'Daily incense and candles without marks on the surface.', zh: '每天上香点烛，台面不留痕。' } }
      ]
    },
    {
      key: 'guest', en: 'Guest Room', zh: '客房',
      head: { en: 'Ready for guests, useful every other day.', zh: '客人来时是客房，平时一样好用。' },
      hint: '例：父母每月来住几天 —— 衣柜留一半给他们放常用衣物。',
      prep: { en: 'A compact wardrobe with luggage space', zh: '带行李位的紧凑衣柜样板', short: { en: 'a compact guest wardrobe', zh: '紧凑衣柜样板' } },
      feats: [
        { id: 'wardrobe', def: true, en: 'Compact wardrobe with luggage bay', zh: '衣柜 + 行李位',
          why: { en: 'Guests unpack properly instead of living out of a suitcase.', zh: '客人可以好好打开行李，不用整天开着行李箱。' } },
        { id: 'multi', en: 'Multi-use storage wall', zh: '多功能收纳墙',
          why: { en: 'Doubles as a study or storeroom on the days without guests.', zh: '没有客人的日子，就是书房或储物间。' } }
      ]
    }
  ];

  MB.ROOM = {};
  MB.ROOMS.forEach(function (r) { MB.ROOM[r.key] = r; });

  /* ---------- 风格方向 · 对应溪岸五个系列 ---------------------
     palette / materials 是起手建议 —— 销售可改成真实板材色号。   */
  MB.DIRECTIONS = [
    {
      key: 'misty', series: 'misty', en: 'Misty Mountain', zh: '雾山',
      mood: { en: 'Light oak, soft daylight, a quiet home.', zh: '浅橡木、柔和日光、一个安静的家。' },
      palette: [
        { hex: '#F2EDE4', en: 'Warm White', zh: '暖白' },
        { hex: '#D9C3A5', en: 'Light Oak', zh: '浅橡木' },
        { hex: '#E3D9C8', en: 'Linen', zh: '亚麻' },
        { hex: '#C7C2B8', en: 'Mist Grey', zh: '雾灰' },
        { hex: '#8D8478', en: 'Stone', zh: '石色' }
      ],
      materials: [
        { hex: '#D9C3A5', en: 'Light oak veneer', zh: '浅橡木饰面' },
        { hex: '#F2EDE4', en: 'Warm white matt', zh: '暖白哑光' },
        { hex: '#DCD6CC', en: 'Pale sintered stone top', zh: '浅色岩板台面' }
      ],
      promises: [
        { en: 'One calm palette, room to room.', zh: '从玄关到卧室，一套安静的颜色。' },
        { en: 'Storage everywhere, clutter nowhere.', zh: '收纳无处不在，杂乱无处可见。' },
        { en: 'Light that makes the wood glow.', zh: '让木纹在光里发亮。' }
      ]
    },
    {
      key: 'skeleton', series: 'skeleton', en: 'Skeleton Line', zh: '骨骼线',
      mood: { en: 'Natural oak drawn with fine dark lines — detail without ornament.', zh: '原木配细黑线框，有细节但不繁复。' },
      palette: [
        { hex: '#EBE5DA', en: 'Plaster', zh: '灰泥白' },
        { hex: '#B99B77', en: 'Natural Oak', zh: '原橡木' },
        { hex: '#A69E94', en: 'Warm Grey', zh: '暖灰' },
        { hex: '#2F2C29', en: 'Charcoal Line', zh: '炭黑线' },
        { hex: '#B08D57', en: 'Brushed Brass', zh: '拉丝黄铜' }
      ],
      materials: [
        { hex: '#B99B77', en: 'Oak veneer', zh: '橡木饰面' },
        { hex: '#2F2C29', en: 'Black frame line', zh: '黑色线框' },
        { hex: '#8F8A83', en: 'Dark sintered stone top', zh: '深色岩板台面' }
      ],
      promises: [
        { en: 'Lines that catch the light.', zh: '线条在光里有影子。' },
        { en: 'Storage that reads as architecture.', zh: '收纳本身就是建筑感。' },
        { en: 'Classic enough to last twenty years.', zh: '经典到二十年都不过时。' }
      ]
    },
    {
      key: 'mountain', series: 'mountain', en: 'Empty Mountain', zh: '空山',
      mood: { en: 'Walnut, plaster and pause — rooms that breathe.', zh: '胡桃木、灰泥与留白，让空间呼吸。' },
      palette: [
        { hex: '#F4EFE6', en: 'Ivory', zh: '象牙白' },
        { hex: '#E6DED2', en: 'Lime Plaster', zh: '石灰白' },
        { hex: '#9C948A', en: 'Stone', zh: '石色' },
        { hex: '#6B4F3A', en: 'Walnut', zh: '胡桃木' },
        { hex: '#3F3A36', en: 'Smoke', zh: '烟灰' }
      ],
      materials: [
        { hex: '#6B4F3A', en: 'Walnut veneer', zh: '胡桃木饰面' },
        { hex: '#E6DED2', en: 'Lime-plaster finish', zh: '石灰墙面' },
        { hex: '#A39B91', en: 'Honed stone', zh: '哑光石材' }
      ],
      promises: [
        { en: 'Plenty of storage that never looks full.', zh: '收纳很多，但看起来不满。' },
        { en: 'Niches that give objects room to breathe.', zh: '壁龛给物件留出呼吸。' },
        { en: 'Deep, warm wood you will want to touch.', zh: '深而温暖的木，会想伸手摸。' }
      ]
    },
    {
      key: 'weaving', series: 'weaving', en: 'Weaving', zh: '织',
      mood: { en: 'Oak and woven texture — warmth you can touch.', zh: '橡木配编织纹理，摸得到的温度。' },
      palette: [
        { hex: '#F1EBDF', en: 'Cream', zh: '奶油白' },
        { hex: '#C8AE8C', en: 'Sand Oak', zh: '沙橡木' },
        { hex: '#B98F5C', en: 'Rattan', zh: '藤色' },
        { hex: '#A9836A', en: 'Clay', zh: '陶土' },
        { hex: '#2E2A26', en: 'Ink', zh: '墨色' }
      ],
      materials: [
        { hex: '#C8AE8C', en: 'Oak veneer', zh: '橡木饰面' },
        { hex: '#B98F5C', en: 'Rattan-weave door panels', zh: '藤编柜门' },
        { hex: '#E4DACB', en: 'Cotton-linen upholstery', zh: '棉麻布艺' }
      ],
      promises: [
        { en: 'Doors you will want to touch.', zh: '会想伸手摸的柜门。' },
        { en: 'Warm, never cold or showroom-stiff.', zh: '温暖，不冰冷、不样板间。' },
        { en: 'Texture that hides daily fingerprints.', zh: '纹理让日常指纹不明显。' }
      ]
    },
    {
      key: 'wabi', series: 'wabi', en: 'Wabi-Sabi Eastern', zh: '宅仁 · 寂',
      mood: { en: 'Aged wood, lime plaster, travertine — a home that gets better with time.', zh: '老木、灰泥、洞石，一个越住越有味道的家。' },
      palette: [
        { hex: '#D9D1C4', en: 'Lime Plaster', zh: '石灰' },
        { hex: '#CBBFAE', en: 'Travertine', zh: '洞石' },
        { hex: '#7A6552', en: 'Aged Wood', zh: '老木' },
        { hex: '#6E6A55', en: 'Moss', zh: '苔绿' },
        { hex: '#3A3633', en: 'Charcoal', zh: '炭灰' }
      ],
      materials: [
        { hex: '#7A6552', en: 'Solid aged-wood fronts', zh: '实木老木纹柜门' },
        { hex: '#CBBFAE', en: 'Travertine top', zh: '洞石台面' },
        { hex: '#BDB4A6', en: 'Micro-cement', zh: '微水泥' }
      ],
      promises: [
        { en: 'Materials that age beautifully.', zh: '越用越好看的材质。' },
        { en: 'Quiet rooms, slow mornings.', zh: '安静的房间，慢下来的早晨。' },
        { en: 'Crafted, not mass-produced.', zh: '手作感，不是流水线。' }
      ]
    }
  ];

  MB.DIRECTION = {};
  MB.DIRECTIONS.forEach(function (d) { MB.DIRECTION[d.key] = d; });

  /* ---------- 需求卡 → 「你说的 · 我们做的」 -------------------
     match     对应需求卡里的哪个选项（brief.html 的 value 前缀）
     room/feats 对上之后，自动勾选哪个空间的哪些卖点
     note      房间页上「为你」那一句                                */
  MB.NEEDS = {
    cook_daily: {
      field: 'cook', match: '天天开火', room: 'kitchen', feats: ['pantry', 'wetkitchen'],
      quote: { en: 'We cook almost every day.', zh: '我们几乎天天开火。' },
      answer: { en: 'Tall pull-out pantry and a moisture-resistant wet kitchen — heavy cooking without the mess.', zh: '高柜拉篮 + 湿厨房防潮柜体，天天开火也不乱。' },
      note: { en: 'You cook almost every day, so pots and jars live in pull-outs at hip height — no kneeling in front of a deep corner cabinet.', zh: '你们几乎天天开火 —— 锅具瓶罐放在腰部高度的拉篮，不用再跪在深柜前翻找。' }
    },
    cook_rare: {
      field: 'cook', match: '几乎不开火', room: 'kitchen', feats: ['openshelf'],
      quote: { en: 'We rarely cook.', zh: '我们很少开火。' },
      answer: { en: 'Open shelving and a coffee corner instead of heavy-duty cabinets — a lighter kitchen.', zh: '用开放层架和咖啡角取代重型柜体，厨房更轻盈。' },
      note: { en: 'You rarely cook, so the kitchen can be lighter: open shelves for the cups you love, closed storage only where it counts.', zh: '你们很少开火，厨房可以轻一点：开放层架放喜欢的杯子，只在需要的地方做封闭收纳。' }
    },
    appliances: {
      field: 'storage', match: '厨房锅具', room: 'kitchen', feats: ['appliance'],
      quote: { en: 'We have lots of pots and appliances.', zh: '我们锅具和电器特别多。' },
      answer: { en: 'A built-in appliance tower and a sideboard with pull-out shelf — counters stay clear.', zh: '嵌入式电器高柜 + 餐边柜拉板，台面保持清爽。' },
      note: { en: 'Lots of appliances, so each one gets a fixed, powered place — the counter is for cooking, not storage.', zh: '电器多，所以每一台都有固定、有插座的位置 —— 台面用来做饭，不是用来堆东西。' }
    },
    clothes: {
      field: 'storage', match: '衣物特别多', room: 'master', feats: ['fullheight', 'drawers'],
      quote: { en: 'We have a lot of clothes.', zh: '我们衣服特别多。' },
      answer: { en: 'Full-height wardrobes with inner drawers — the top section takes luggage and seasonal clothes.', zh: '通顶衣柜 + 内抽，最上层放行李箱与换季衣物。' },
      note: { en: 'You have a lot of clothes, so the wardrobe runs to the ceiling — the top section is for luggage and the off-season.', zh: '你们衣服多，所以衣柜做到天花 —— 最上层留给行李箱与换季衣物。' }
    },
    kids: {
      field: 'storage', match: '孩子', room: 'bedroom', feats: ['toy'],
      quote: { en: 'The kids’ things are everywhere.', zh: '孩子的东西到处都是。' },
      answer: { en: 'Low open storage the kids can reach — so they can tidy up themselves.', zh: '孩子够得着的低位开放收纳，让他们自己收。' },
      note: { en: 'Low, open storage at the kids’ height — if they can reach it, they can put it back.', zh: '收纳做在孩子的高度 —— 够得着，就放得回去。' }
    },
    books: {
      field: 'storage', match: '书籍', room: 'living', feats: ['display'],
      quote: { en: 'We have books and collections to show.', zh: '我们有很多书和收藏想展示。' },
      answer: { en: 'Lit display shelving in the living room — a proper home for the things you love.', zh: '客厅灯光展示格，给喜欢的东西一个像样的位置。' },
      note: { en: 'Your books and collections get lit display shelves — they stop living in boxes.', zh: '你们的书和收藏有了带灯的展示格，不再一直放在箱子里。' }
    },
    luggage: {
      field: 'storage', match: '行李箱', room: 'foyer', feats: ['understair'],
      quote: { en: 'Luggage and bulky things have nowhere to go.', zh: '行李箱和大件杂物没地方放。' },
      answer: { en: 'The under-stair space and the top of every wardrobe become storage for bulky items.', zh: '楼梯底与每个衣柜顶部，都变成大件收纳。' },
      note: { en: 'The space under the stairs takes the luggage and bulky items, so they never reach the bedrooms.', zh: '楼梯底收下行李箱与大件杂物，不再挤进卧室。' }
    },
    shoes: {
      field: 'storage', match: '鞋子', room: 'foyer', feats: ['fullheight', 'ventilated'],
      quote: { en: 'We have a lot of shoes.', zh: '我们鞋子很多。' },
      answer: { en: 'A full-height, ventilated shoe wall at the entrance — no odour, no pile at the door.', zh: '玄关通顶透气鞋柜，没有异味，门口不再堆鞋。' },
      note: { en: 'Lots of shoes, so the whole foyer wall becomes a ventilated shoe cabinet — nothing left at the door.', zh: '鞋子多，所以整面玄关墙都是透气鞋柜 —— 门口什么都不留。' }
    },
    elderly: {
      field: 'household', match: '长辈', room: 'foyer', feats: ['bench'],
      quote: { en: 'Our parents live with us.', zh: '长辈和我们同住。' },
      answer: { en: 'A shoe-changing bench at the door and easy-reach storage — comfortable for every age.', zh: '门口换鞋凳与顺手的收纳高度，每个年龄都舒服。' },
      note: { en: 'Your parents live with you, so there is a bench to sit and change shoes, and the daily pairs sit at an easy height.', zh: '长辈同住，所以门口有换鞋凳，常穿的鞋放在不用弯腰的高度。' }
    },
    pets: {
      field: 'household', match: '宠物', room: 'living', feats: ['floatingconsole'],
      quote: { en: 'We have pets.', zh: '我们有宠物。' },
      answer: { en: 'Floating units with no dark gap to hide under, and low-level finishes that wipe clean.', zh: '悬空柜体没有藏毛的死角，低处饰面好擦。' },
      note: { en: 'With pets at home, the TV console floats — no dark gap for fur to collect, and the vacuum passes right under.', zh: '家里有宠物，所以电视柜悬空 —— 没有积毛的死角，吸尘器直接扫过去。' }
    },
    helper: {
      field: 'household', match: '帮佣', room: 'laundry', feats: ['tallbroom'],
      quote: { en: 'We have a helper at home.', zh: '家里有帮佣。' },
      answer: { en: 'A tall utility cupboard in the laundry — every cleaning tool in one place.', zh: '洗衣房清洁高柜，清洁工具一次拿齐。' },
      note: { en: 'With a helper at home, every cleaning tool has one tall cupboard — nothing borrowed from other rooms.', zh: '家里有帮佣，所以清洁工具集中在一个高柜里，不用到处借位置。' }
    },
    guests: {
      field: 'household', match: '客人', room: 'dining', feats: ['sideboard'],
      quote: { en: 'We often have guests over.', zh: '家里常有客人。' },
      answer: { en: 'A sideboard for glasses and serving ware — hosting without running to the kitchen.', zh: '餐边柜放酒杯与餐具，招待客人不用一直跑厨房。' },
      note: { en: 'You host often, so glasses and serving ware live in the sideboard — dinner is served without leaving the table.', zh: '你们常请客，酒杯与餐具都在餐边柜里 —— 上菜不用离开餐桌。' }
    }
  };

  /* 客户自己写的痛点 → 猜是哪个空间（对上了，「你说的」那一页才标得出页码） */
  MB.PAIN_ROOMS = [
    { re: /厨房|厨|锅|碗|油烟|kitchen|pantry|cook/i, room: 'kitchen' },
    { re: /玄关|鞋|进门|门口|foyer|entrance|shoe/i, room: 'foyer' },
    { re: /梳妆|化妆|护肤|vanity|make-?up/i, room: 'vanity' },
    { re: /衣帽间|walk-?in/i, room: 'walkin' },
    { re: /衣柜|衣服|衣物|挂衣|wardrobe|cloth/i, room: 'master' },
    { re: /浴室|厕所|洗手间|bath|toilet/i, room: 'bathroom' },
    { re: /洗衣|晾|laundry|utility/i, room: 'laundry' },
    { re: /客厅|电视|沙发|living|tv/i, room: 'living' },
    { re: /餐|dining/i, room: 'dining' },
    { re: /书房|书|办公|study|book|work from home/i, room: 'study' },
    { re: /玩具|孩子|小孩|kid|toy|child/i, room: 'bedroom' },
    { re: /神台|拜|altar/i, room: 'altar' }
  ];
  MB.guessPainRoom = function (text) {
    for (var i = 0; i < MB.PAIN_ROOMS.length; i++) if (MB.PAIN_ROOMS[i].re.test(text || '')) return MB.PAIN_ROOMS[i].room;
    return null;
  };

  /* 需求卡「定制范围」→ 空间 */
  MB.SCOPE_ROOMS = [
    { match: '全屋', rooms: ['foyer', 'living', 'kitchen', 'laundry', 'master', 'bathroom'] },
    { match: '厨房', rooms: ['kitchen'] },
    { match: '衣柜', rooms: ['master'] },
    { match: '鞋柜', rooms: ['foyer'] },
    { match: '电视柜', rooms: ['living'] },
    { match: '书房', rooms: ['study'] },
    { match: '浴室柜', rooms: ['bathroom'] },
    { match: '墙板', rooms: ['living'] }
  ];

  /* 需求卡「风格倾向」→ 方向（取第一个对上的） */
  MB.STYLE_DIRECTION = [
    { match: '侘寂', dir: 'wabi' },
    { match: '日式', dir: 'misty' },
    { match: '自然原木', dir: 'misty' },
    { match: '北欧', dir: 'misty' },
    { match: '现代简约', dir: 'skeleton' },
    { match: '轻奢', dir: 'mountain' },
    { match: '中古', dir: 'weaving' }
  ];

  /* ---------- 内置图库 ----------------------------------------
     溪岸自家的空间实拍（来自公司手册）。销售自己的参考图另存在浏览器里。
     rooms 决定「自动配图」时这张会被放到哪些空间。                 */
  var C = 'assets/img/cases/';
  MB.BUILTIN = [
    { id: 'b:living-wide', src: 'assets/img/scene-living-wide.jpg', w: 1600, h: 958, series: 'misty', rooms: ['living', 'dining'], en: 'Living room, wide', zh: '客厅全景' },
    { id: 'b:misty-2', src: C + 'misty-2.jpg', w: 821, h: 1280, series: 'misty', rooms: ['master', 'bedroom', 'guest'], en: 'Bedroom with timber screen', zh: '卧室木格屏风' },
    { id: 'b:misty-3', src: C + 'misty-3.jpg', w: 516, h: 693, series: 'misty', rooms: ['living', 'study'], en: 'Reading corner & shelving', zh: '阅读角与书架' },
    { id: 'b:mountain-1', src: C + 'mountain-1.jpg', w: 913, h: 686, series: 'mountain', rooms: ['walkin', 'master'], en: 'Walk-in wardrobe', zh: '衣帽间' },
    { id: 'b:mountain-2', src: C + 'mountain-2.jpg', w: 594, h: 800, series: 'mountain', rooms: ['living', 'study', 'dining'], en: 'Grid display shelving', zh: '格架展示' },
    { id: 'b:mountain-3', src: C + 'mountain-3.jpg', w: 600, h: 800, series: 'mountain', rooms: ['study', 'living'], en: 'Floor-to-ceiling book wall', zh: '通顶书墙' },
    { id: 'b:skeleton-1', src: C + 'skeleton-1.jpg', w: 942, h: 628, series: 'skeleton', rooms: ['living', 'master'], en: 'Living with panelled wall', zh: '客厅木饰墙' },
    { id: 'b:skeleton-2', src: C + 'skeleton-2.jpg', w: 729, h: 982, series: 'skeleton', rooms: ['kitchen'], en: 'Bar counter & storage wall', zh: '吧台与储物墙' },
    { id: 'b:skeleton-3', src: C + 'skeleton-3.jpg', w: 730, h: 982, series: 'skeleton', rooms: ['kitchen'], en: 'Tall units & built-in appliances', zh: '高柜与嵌入式电器' },
    { id: 'b:skeleton-4', src: C + 'skeleton-4.jpg', w: 1000, h: 477, series: 'skeleton', rooms: ['kitchen', 'dining'], en: 'Island & sideboard', zh: '中岛与餐边柜' },
    { id: 'b:skeleton-5', src: C + 'skeleton-5.jpg', w: 1000, h: 1872, series: 'skeleton', rooms: ['bedroom', 'master'], en: 'Drawer lines & handles', zh: '抽屉线条与把手' },
    { id: 'b:wabi-1', src: C + 'wabi-1.jpg', w: 775, h: 1033, series: 'wabi', rooms: ['kitchen'], en: 'Solid-wood kitchen', zh: '实木厨房' },
    { id: 'b:wabi-2', src: C + 'wabi-2.jpg', w: 862, h: 485, series: 'wabi', rooms: ['kitchen', 'dining'], en: 'Island & tall cabinetry', zh: '中岛与高柜' },
    { id: 'b:wabi-3', src: C + 'wabi-3.jpg', w: 775, h: 1034, series: 'wabi', rooms: ['kitchen', 'laundry'], en: 'Sink run & floating shelves', zh: '水槽区与层板' },
    { id: 'b:wabi-4', src: C + 'wabi-4.jpg', w: 466, h: 554, series: 'wabi', rooms: ['living', 'guest'], en: 'Lime-plaster corner', zh: '灰泥墙角' },
    { id: 'b:weaving-1', src: C + 'weaving-1.jpg', w: 1000, h: 1346, series: 'weaving', rooms: ['living', 'dining', 'study'], en: 'Storage wall & display', zh: '收纳墙与展示格' },
    { id: 'b:weaving-2', src: C + 'weaving-2.jpg', w: 1000, h: 1346, series: 'weaving', rooms: ['living', 'bedroom'], en: 'Woven cabinet front', zh: '藤织柜门' },
    { id: 'b:detail', src: 'assets/img/scene-detail.jpg', w: 1000, h: 1337, series: 'skeleton', rooms: ['bedroom', 'master', 'guest'], en: 'Chest of drawers detail', zh: '斗柜细节' },
    { id: 'b:wood', src: 'assets/img/scene-wood.jpg', w: 849, h: 1279, series: 'mountain', rooms: ['study', 'living'], en: 'Study wall & desk', zh: '书房墙与书桌' },
    { id: 'b:hero-sail', src: 'assets/img/hero-sail.jpg', w: 1800, h: 1036, series: '', rooms: ['showroom'], en: 'Sail façade', zh: '溪岸门面' }
  ];

  /* 页面标签（图库筛选 + PDF 导入时用） */
  MB.TAGS = MB.ROOMS.map(function (r) { return { key: r.key, en: r.en, zh: r.zh }; })
    .concat([
      { key: 'showroom', en: 'Showroom / brand', zh: '展厅 · 品牌' },
      { key: 'other', en: 'Other', zh: '其他' }
    ]);

  /* PDF 导入：页面文字 → 空间（文字先去空格转大写再比对，能吃下 "KITHCEN ARE A" 这种字距） */
  MB.PAGE_KEYWORDS = [
    { re: /FOYER|ENTRANCE|SHOE|玄关|鞋柜/, room: 'foyer' },
    { re: /VANITY|梳妆/, room: 'vanity' },
    { re: /BATHROOM|BATH|浴室/, room: 'bathroom' },
    { re: /LAUNDRY|UTILITY|洗衣/, room: 'laundry' },
    { re: /WALK-?IN|衣帽间/, room: 'walkin' },
    { re: /MASTER|WARDROBE|主卧|衣柜/, room: 'master' },
    { re: /KITCHEN|KITHCEN|KICHEN|PANTRY|厨房/, room: 'kitchen' },
    { re: /DINING|SIDEBOARD|餐厅|餐边/, room: 'dining' },
    { re: /LIVING|TVWALL|TVFEATURE|客厅|电视/, room: 'living' },
    { re: /STUDY|书房/, room: 'study' },
    { re: /KIDS|CHILD|BEDROOM\d|BEDROOM|儿童|卧室/, room: 'bedroom' },
    { re: /ALTAR|神台/, room: 'altar' },
    { re: /GUEST|STUDIO|客房/, room: 'guest' },
    { re: /SKELETON|EMPTYMOUNTAIN|WEAVING|MISTY|WABI|ABOUTTHEBRAND|SHOWROOM/, room: 'showroom' }
  ];
})();
