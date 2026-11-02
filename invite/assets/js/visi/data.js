/* ============================================================
   VISI · 资料库
   ------------------------------------------------------------
   空间 · 功能卖点 · 风格方向 · 需求卡对照 · 常见顾虑 · 内置图库
   全部是纯资料：要改文案、加空间、换配色，只动这一份。

   这是 moodboard：以图为主、字要少。页面只印短的那一句，细节放讲稿（copy.js 的 MB.pageNotes）。
   字数上限（华文字 / 英文单词）：
   - head ≤ 18 / 10 · 卖点名称 ≤ 8 / 4（why 进讲稿，可以多一点）
   - 需求原话 ≤ 20 / 12 · 我们的做法 ≤ 30 / 18 · 「为 X」那一句 ≤ 40 / 25
   - 到馆准备 ≤ 16 / 9 · 风格 mood ≤ 24 / 14
   文案写法（README「文案怎么写」）：
   - 标题说「得到什么」，不是「这是什么」；why 用「少一个麻烦」的说法
   - 具体的画面（抽屉的分量、柜门关上的那一声）胜过形容词；不写温馨、高端、奢华、完美
   - 不批评他们现在的家；不编数字。要放数字，就由销售填真实的尺寸与数量
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  /* ---------- 空间 ------------------------------------------
     key       内部代号（不可改）
     head      房间页上的一句话「这个空间会变成什么样」
     feats     可勾选的卖点，def:true 为默认勾选；页面只印名称，why 在讲稿里说
     prep      到馆那天可以为这个空间准备的东西（销售要确认展厅真的有）；short 用在讲解稿里
     hint      「为你」那一句的填写示范                              */
  MB.ROOMS = [
    {
      key: 'foyer', en: 'Foyer', zh: '玄关',
      head: { en: 'Walk in to a clear floor, every shoe put away.', zh: '一进门，地上不见一双鞋。' },
      hint: '例：你们鞋子很多 —— 整面通顶鞋柜，门口不再堆鞋。',
      prep: { en: 'A ventilated shoe-cabinet sample to open and try', zh: '透气鞋柜样板，可以打开亲手试', short: { en: 'the ventilated shoe-cabinet sample', zh: '透气鞋柜样板' } },
      feats: [
        { id: 'fullheight', def: true, en: 'Full-height storage wall', zh: '通顶收纳墙',
          why: { en: 'No dusty gap on top — the whole wall works, floor to ceiling.', zh: '柜顶不留缝、不积灰，整面墙从地面用到天花。' } },
        { id: 'understair', en: 'Under-stair storage', zh: '楼梯底收纳',
          why: { en: 'The awkward triangle under the stairs stops being dead space.', zh: '楼梯下那块尴尬的三角位，不再是死角。' } },
        { id: 'ventilated', en: 'Ventilated shoe compartments', zh: '透气鞋柜',
          why: { en: 'Closed cabinets trap humidity and odour — vents keep the air moving.', zh: '密封鞋柜在潮湿天气容易闷出味道，透气设计让空气流动。' } },
        { id: 'floating', en: 'Floating base, night light', zh: '悬空柜 + 底部灯带',
          why: { en: 'Daily shoes slide underneath, and a strip of light shows the floor when you come home late.', zh: '常穿的鞋直接放底下；晚归时，底部灯带照亮地面。' } },
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
          why: { en: 'Everything hides behind flush doors; the TV becomes part of the wall.', zh: '杂物全收进柜门后面，电视融进墙里，不再是客厅的主角。' } },
        { id: 'display', def: true, en: 'Lit display shelving', zh: '灯光展示格',
          why: { en: 'Books and the things you collect get a lit shelf of their own.', zh: '书和收藏有自己的一格，灯一开就看得见。' } },
        { id: 'floatingconsole', en: 'Floating TV console', zh: '悬空电视柜',
          why: { en: 'The robot vacuum passes underneath; the room reads wider.', zh: '扫地机器人钻得进去，空间看起来更宽。' } },
        { id: 'hidden', en: 'Hidden cables & router', zh: '隐藏线路柜',
          why: { en: 'The router, set-top box and their cables disappear behind one door.', zh: '路由器、机顶盒和电线，收在同一扇柜门后面。' } },
        { id: 'fluted', en: 'Fluted timber accent', zh: '木格栅饰面',
          why: { en: 'Light and shadow across the timber, without adding a single object.', zh: '木格栅上有光有影，却不多一件杂物。' } }
      ]
    },
    {
      key: 'dining', en: 'Dining', zh: '餐厅',
      head: { en: 'Everything for the table, within reach.', zh: '吃饭要用的，伸手就有。' },
      hint: '例：你们常请朋友来吃饭 —— 餐边柜放酒杯与餐具，开饭少跑几趟厨房。',
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
      head: { en: 'Every pot within reach, the counter left clear.', zh: '每个锅伸手就拿，台面空出来。' },
      hint: '例：你们天天开火 —— 锅具放在腰部高度的拉篮，不用再跪在深柜前翻找。',
      prep: { en: 'Your kitchen boards and handles, laid out together', zh: '你们厨房的板材与把手，摆在一起看', short: { en: 'your kitchen boards and handles', zh: '你们厨房的板材与把手' } },
      feats: [
        { id: 'topbase', def: true, en: 'Top + base cabinets', zh: '吊柜 + 地柜',
          why: { en: 'Everything behind doors, top to bottom — what you don’t use daily goes up, out of sight.', zh: '从上到下都收进柜门里，不常用的放上面，看不见就不乱。' } },
        { id: 'pantry', def: true, en: 'Tall pull-out pantry', zh: '高柜拉篮',
          why: { en: 'Every jar in one glance — nothing expires at the back of a deep cabinet.', zh: '瓶瓶罐罐一眼看完，不再有东西卡在深柜里过期。' } },
        { id: 'openshelf', en: 'Open upper shelving', zh: '开放层架代替吊柜',
          why: { en: 'The bowls and cups you use every day, one reach away; the kitchen feels open, not boxed in.', zh: '每天用的碗杯伸手就拿，厨房通透不压迫。' } },
        { id: 'appliance', en: 'Built-in appliance tower', zh: '嵌入式电器高柜',
          why: { en: 'Oven and steamer at eye level — no bending, no visual clutter.', zh: '烤箱蒸炉在视线高度，不用弯腰，也不显乱。' } },
        { id: 'island', en: 'Island with storage', zh: '收纳中岛',
          why: { en: 'Prep, breakfast and homework in one spot, storage on both sides.', zh: '备菜、早餐、写功课都在这里，两面都能收纳。' } },
        { id: 'wetkitchen', en: 'Moisture-resistant wet kitchen', zh: '湿厨房防潮柜体',
          why: { en: 'Steam and splashes every day, so the carcass is moisture-resistant board with sealed edges.', zh: '天天有蒸汽水渍，所以柜体用防潮板，封边封好。' } },
        { id: 'skeleton', en: 'Skeleton-line frame detail', zh: '骨骼线框细节',
          why: { en: 'A fine frame line gives each door its own shadow — detail without ornament.', zh: '细线框让每扇柜门都有一道影子，有细节但不繁复。' } }
      ]
    },
    {
      key: 'laundry', en: 'Laundry', zh: '洗衣房',
      head: { en: 'Wash, dry, fold — in one quiet corner.', zh: '洗、晾、叠，一个角落安静完成。' },
      hint: '例：你们有帮佣 —— 高柜放吸尘器和清洁用品，一次拿齐。',
      prep: { en: 'Floating and floor-standing laundry units, side by side', zh: '悬空柜与落地柜并排，现场比较', short: { en: 'the two laundry options side by side', zh: '两种洗衣房柜体' } },
      feats: [
        { id: 'floating', def: true, en: 'Floating cabinet', zh: '悬空柜',
          why: { en: 'Baskets and the mop live underneath; the floor dries faster.', zh: '洗衣篮和拖把放下面，地面干得更快。' } },
        { id: 'tallbroom', def: true, en: 'Tall utility cupboard', zh: '清洁高柜',
          // 充电的只有吸尘器：烫衣板、扫把只是收在里面（拖把在悬空柜底下，不要一个房间说两个地方）
          why: { en: 'The vacuum charges inside; the ironing board and broom stand beside it, out of sight.', zh: '吸尘器在里面充电，烫衣板、扫把也收在里面，看不见。' } },
        { id: 'base', en: 'Folding counter', zh: '地柜 + 折衣台',
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
        { id: 'drawers', en: 'Inner drawers & trays', zh: '内抽 + 饰品格',
          why: { en: 'Watches, belts and jewellery each get a place — nothing tangled.', zh: '手表、皮带、首饰各有位置，不再缠成一团。' } },
        { id: 'headboard', en: 'Headboard & side tables', zh: '床头背板 + 床头柜',
          why: { en: 'Reading light, charger and books exactly where the hand goes.', zh: '阅读灯、充电线、书本就在手边。' } }
      ]
    },
    {
      key: 'walkin', en: 'Walk-in Wardrobe', zh: '衣帽间',
      head: { en: 'Every piece in sight.', zh: '每一件，都看得见。' },
      hint: '例：你们两个人的衣物分左右两边，早上不用互相等。',
      prep: { en: 'Our walk-in wardrobe set: open hanging, island drawers', zh: '展厅的衣帽间样板：开放挂衣 + 中岛抽屉', short: { en: 'our walk-in wardrobe set', zh: '衣帽间样板' } },
      feats: [
        { id: 'open', def: true, en: 'Open hanging, lit', zh: '开放挂衣 + 灯光',
          why: { en: 'See everything you own — nothing forgotten at the back.', zh: '拥有的衣服一眼看完，没有一件被遗忘在后面。' } },
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
      prep: { en: 'A vanity with a lit mirror and divided drawers', zh: '带分格抽屉与灯镜的梳妆台，现场试用', short: { en: 'the vanity with its lit mirror', zh: '带灯镜的梳妆台' } },
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
      head: { en: 'A floor that dries fast, bottles off the counter.', zh: '地面干得快，台面不放瓶罐。' },
      hint: '例：家里小孩多 —— 悬空柜底不积水，地面一拖就干净。',
      prep: { en: 'Moisture-resistant board samples, edges and all', zh: '防潮板与封边的实物样板', short: { en: 'the moisture-resistant board samples', zh: '防潮板样板' } },
      feats: [
        { id: 'floating', def: true, en: 'Floating vanity', zh: '悬空浴室柜',
          why: { en: 'No water pooling at the base; the floor is wiped in one pass.', zh: '柜底不积水，地面一拖就干净。' } },
        { id: 'mirrorcab', def: true, en: 'Mirror cabinet', zh: '镜柜',
          why: { en: 'Toiletries disappear behind the mirror; the counter stays clear.', zh: '瓶瓶罐罐收进镜子后面，台面保持干净。' } },
        { id: 'moisture', en: 'Moisture-resistant board, sealed edges', zh: '防潮板 + 全封边',
          why: { en: 'Moisture-resistant board with every edge sealed, for the daily steam and splashes.', zh: '用防潮板，每一边都封好，应付每天的蒸汽水汽。' } },
        { id: 'niche', en: 'Recessed shower niche', zh: '淋浴壁龛',
          why: { en: 'Bottles off the floor, nothing to knock over.', zh: '瓶子不再放地上，也不会被碰倒。' } }
      ]
    },
    {
      key: 'bedroom', en: 'Kids’ Room', zh: '儿童房',
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
          why: { en: 'Your books become part of the room — and your video-call background.', zh: '书本身就是空间的一部分，也是视频会议的背景。' } },
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
          why: { en: 'A respectful, dedicated place that sits with the rest of the room.', zh: '一个端正专属的位置，也和整体设计协调。' } },
        { id: 'storage', def: true, en: 'Closed storage below', zh: '下方收纳',
          why: { en: 'Joss sticks, candles and offerings stay tidy and out of sight.', zh: '香、烛、供品整齐收好，不外露。' } },
        { id: 'heat', en: 'Heat-resistant top', zh: '耐热台面',
          why: { en: 'A top chosen for daily incense and candles.', zh: '台面选用适合每日上香点烛的材质。' } }
      ]
    },
    {
      key: 'guest', en: 'Guest Room', zh: '客房',
      head: { en: 'Ready for guests, useful the rest of the time.', zh: '客人来时是客房，平时一样好用。' },
      hint: '例：父母每月来住几天 —— 衣柜留一半给他们放常用衣物。',
      prep: { en: 'A compact wardrobe with luggage space', zh: '带行李位的紧凑衣柜样板', short: { en: 'a compact guest wardrobe', zh: '紧凑衣柜样板' } },
      feats: [
        { id: 'wardrobe', def: true, en: 'Wardrobe with luggage bay', zh: '衣柜 + 行李位',
          why: { en: 'Guests unpack properly instead of living out of a suitcase.', zh: '客人可以好好打开行李，不用整天开着行李箱。' } },
        { id: 'multi', en: 'Multi-use storage wall', zh: '多功能收纳墙',
          why: { en: 'Doubles as a study or storeroom on the days without guests.', zh: '没有客人的日子，就是书房或储物间。' } }
      ]
    }
  ];

  MB.ROOM = {};
  MB.ROOMS.forEach(function (r) { MB.ROOM[r.key] = r; });

  /* ---------- 风格方向 · 对应溪岸五个系列 ---------------------
     palette / materials 是起手建议 —— 销售可改成真实板材色号。
     mood 的写法固定成「材质，感觉」（英文用 — 隔开）：开场短话只取前半句的材质，
     具体的木色比一句形容词更像真的。
     promises 不印在「一页看懂」上了（moodboard 少字），讲稿里会说            */
  MB.DIRECTIONS = [
    {
      key: 'misty', series: 'misty', en: 'Misty Mountain', zh: '雾山',
      mood: { en: 'Light oak and warm white — soft daylight, a quiet home.', zh: '浅橡木与暖白，柔和的日光，一个安静的家。' },
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
        { en: 'One palette, from the front door to the bedroom.', zh: '从玄关到卧室，一套颜色。' },
        { en: 'Everything you use daily, behind a door.', zh: '每天用的东西，都收在柜门后面。' },
        { en: 'Afternoon sun across pale oak.', zh: '午后的光，落在浅橡木上。' }
      ]
    },
    {
      key: 'skeleton', series: 'skeleton', en: 'Skeleton Line', zh: '骨骼线',
      mood: { en: 'Natural oak and fine charcoal lines — detail without ornament.', zh: '原木与细黑线框，有细节，不繁复。' },
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
        { en: 'Lines that cast a shadow.', zh: '线条在光里有影子。' },
        { en: 'Storage that reads as architecture.', zh: '收纳本身就是建筑感。' },
        { en: 'Straight lines that won’t date quickly.', zh: '直线条，不容易过时。' }
      ]
    },
    {
      key: 'mountain', series: 'mountain', en: 'Empty Mountain', zh: '空山',
      mood: { en: 'Walnut and lime plaster — open space that lets each room breathe.', zh: '胡桃木与灰泥，留白让空间呼吸。' },
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
        { en: 'Niches with room around each object.', zh: '壁龛给每件物品留出空间。' },
        { en: 'Dark walnut you will want to touch.', zh: '深色胡桃木，会想伸手摸。' }
      ]
    },
    {
      key: 'weaving', series: 'weaving', en: 'Weaving', zh: '织',
      mood: { en: 'Oak and woven rattan — warmth you can touch.', zh: '橡木与藤编，摸得到的温度。' },
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
        { en: 'Warm to the hand, never showroom-stiff.', zh: '摸起来是暖的，不像样板间。' },
        { en: 'Texture that hides daily fingerprints.', zh: '纹理让日常指纹不明显。' }
      ]
    },
    {
      key: 'wabi', series: 'wabi', en: 'Wabi-Sabi Eastern', zh: '宅仁 · 寂',
      mood: { en: 'Aged wood, lime plaster and travertine — a home that gets better with time.', zh: '老木、灰泥与洞石，一个越住越有味道的家。' },
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
        { en: 'Materials that wear in, not out.', zh: '越用越好看的材质。' },
        { en: 'Quiet rooms, slow mornings.', zh: '安静的房间，慢下来的早晨。' },
        { en: 'Wood grain you can feel under your hand.', zh: '摸得到木纹的柜门。' }
      ]
    }
  ];

  MB.DIRECTION = {};
  MB.DIRECTIONS.forEach(function (d) { MB.DIRECTION[d.key] = d; });

  /* ---------- 需求卡 → 「你说的 · 我们做的」 -------------------
     match     对应需求卡里的哪个选项（正则；华文、英文、中英文的需求卡都要认得）
     room/feats 对上之后，自动勾选哪个空间的哪些卖点
     quote     他们选的那一项，用他们的口吻说（客户自己写的原话，另存在方案里）
     told      转述（「你们提到 ___」/「You mentioned ___」）：勾选的选项不是他们亲口说的话，
               开场短话、讯息、讲稿不能加引号当原话引用 —— 引号只给客户自己打的字
               zh 不带主语（前面接「你们提到」或「你们」）；en 是带主语的子句
     answer    我们的做法，一句话
     note      房间页上「为你」那一句                                */
  MB.NEEDS = {
    cook_daily: {
      field: 'cook', match: /天天开火|daily|every ?day/i, room: 'kitchen', feats: ['pantry', 'wetkitchen'],
      quote: { en: 'We cook almost every day.', zh: '我们几乎天天开火。' },
      told: { en: 'you cook almost every day', zh: '几乎天天开火' },
      answer: { en: 'A tall pull-out pantry with every jar in view, and moisture-resistant cabinets for the steam.', zh: '高柜拉篮，瓶罐一眼看完；湿厨房柜体用防潮板。' },
      note: { en: 'You cook almost every day, so pots and jars live in pull-outs at hip height — no kneeling in front of a deep corner cabinet.', zh: '你们几乎天天开火 —— 锅具瓶罐放在腰部高度的拉篮，不用再跪在深柜前翻找。' }
    },
    cook_rare: {
      field: 'cook', match: /几乎不开火|rarely|hardly/i, room: 'kitchen', feats: ['openshelf'],
      quote: { en: 'We rarely cook.', zh: '我们很少开火。' },
      told: { en: 'you rarely cook', zh: '很少开火' },
      answer: { en: 'Open shelves instead of top cabinets, and closed storage only where it counts.', zh: '开放层架代替吊柜，只在需要的地方做封闭收纳。' },
      note: { en: 'You rarely cook, so the kitchen can be lighter: open shelves for the cups you love, closed storage only where it counts.', zh: '你们很少开火，厨房可以轻一点：开放层架放喜欢的杯子，只在需要的地方做封闭收纳。' }
    },
    appliances: {
      field: 'storage', match: /厨房锅具|cookware|pots|appliance/i, room: 'kitchen', feats: ['appliance'],
      quote: { en: 'We have lots of pots and appliances.', zh: '我们锅具和电器特别多。' },
      told: { en: 'you have lots of pots and appliances', zh: '锅具和电器特别多' },
      answer: { en: 'A built-in appliance tower, each machine with its own place and socket — the counter stays clear.', zh: '嵌入式电器高柜，每台都有固定位置和插座，台面空出来。' },
      note: { en: 'Lots of appliances, so each one gets a fixed, powered place — the counter is for cooking, not storage.', zh: '电器多，所以每一台都有固定、有插座的位置 —— 台面用来做饭，不是用来堆东西。' }
    },
    clothes: {
      field: 'storage', match: /衣物|clothes|clothing/i, room: 'master', feats: ['fullheight', 'drawers'],
      quote: { en: 'We have a lot of clothes.', zh: '我们衣服特别多。' },
      told: { en: 'you have a lot of clothes', zh: '衣服特别多' },
      answer: { en: 'Ceiling-high wardrobes with inner drawers; luggage and off-season clothes go on top.', zh: '衣柜做到天花，配内抽；行李箱和换季衣物放最上层。' },
      note: { en: 'You have a lot of clothes, so the wardrobe runs to the ceiling — the top section takes luggage and off-season clothes.', zh: '你们衣服多，所以衣柜做到天花 —— 最上层留给行李箱与换季衣物。' }
    },
    kids: {
      field: 'storage', match: /孩子|kid|child|toy/i, room: 'bedroom', feats: ['toy'],
      quote: { en: 'The kids’ things are everywhere.', zh: '孩子的东西到处都是。' },
      told: { en: 'the kids’ things end up everywhere', zh: '孩子的东西到处都是' },
      answer: { en: 'Low, open storage at the kids’ height, so they can put things back themselves.', zh: '收纳做在孩子够得着的高度，让他们自己收。' },
      note: { en: 'Low, open storage at the kids’ height — if they can reach it, they can put it back.', zh: '收纳做在孩子的高度 —— 够得着，就放得回去。' }
    },
    books: {
      field: 'storage', match: /书籍|book|collection/i, room: 'living', feats: ['display'],
      quote: { en: 'We have books and collections to show.', zh: '我们有很多书和收藏想展示。' },
      told: { en: 'you have books and collections to show', zh: '有很多书和收藏想展示' },
      answer: { en: 'Lit display shelves in the living room, with a place for every book and piece you collect.', zh: '客厅做带灯的展示格，书和收藏都有自己的位置。' },
      note: { en: 'Your books and collections get lit display shelves, where you can see every piece.', zh: '你们的书和收藏有了带灯的展示格，每一件都看得见。' }
    },
    luggage: {
      field: 'storage', match: /行李箱|luggage|suitcase|bulky/i, room: 'foyer', feats: ['understair'],
      condo: {
        room: 'master', feats: ['fullheight'],
        answer: { en: 'Wardrobes run to the ceiling; luggage and bulky things go in the top section.', zh: '衣柜做到天花，行李箱与大件放最上层，柜顶不再积灰。' },
        note: { en: 'Luggage and bulky items go into the top section of a ceiling-high wardrobe — out of sight, off the floor.', zh: '行李箱与大件放进通顶衣柜的最上层 —— 看不见，也不占地面。' }
      },
      quote: { en: 'Luggage and bulky things have nowhere to go.', zh: '行李箱和大件杂物没地方放。' },
      told: { en: 'luggage and bulky things have nowhere to go', zh: '行李箱和大件杂物没地方放' },
      answer: { en: 'The space under the stairs and the top of each wardrobe take the bulky things.', zh: '楼梯底与每个衣柜顶部，都变成大件收纳。' },
      note: { en: 'The space under the stairs takes the luggage and bulky items, so they never reach the bedrooms.', zh: '楼梯底收下行李箱与大件杂物，不再挤进卧室。' }
    },
    shoes: {
      field: 'storage', match: /鞋子|shoe/i, room: 'foyer', feats: ['fullheight', 'ventilated'],
      quote: { en: 'We have a lot of shoes.', zh: '我们鞋子很多。' },
      told: { en: 'you have a lot of shoes', zh: '鞋子很多' },
      answer: { en: 'A full-height, ventilated shoe wall at the door, so air keeps moving and every pair is put away.', zh: '整面通顶透气鞋柜，空气流通，每双鞋都收进柜里。' },
      note: { en: 'Lots of shoes, so the whole foyer wall becomes a ventilated shoe cabinet — nothing left at the door.', zh: '鞋子多，所以整面玄关墙都是透气鞋柜 —— 门口什么都不留。' }
    },
    elderly: {
      field: 'household', match: /长辈|elder|parent/i, room: 'foyer', feats: ['bench'],
      quote: { en: 'Our parents live with us.', zh: '长辈和我们同住。' },
      told: { en: 'your parents live with you', zh: '家里有长辈同住' },
      answer: { en: 'A bench by the door for changing shoes, and everyday things at an easy height.', zh: '门口一张换鞋凳，常用的东西放在不用弯腰的高度。' },
      note: { en: 'Your parents live with you, so there’s a bench by the door, and everyday shoes sit where no one has to bend.', zh: '长辈同住，所以门口有换鞋凳，常穿的鞋放在不用弯腰的高度。' }
    },
    pets: {
      field: 'household', match: /宠物|\bpets?\b/i, room: 'living', feats: ['floatingconsole'],
      quote: { en: 'We have pets.', zh: '我们有宠物。' },
      told: { en: 'you have pets', zh: '家里有宠物' },
      answer: { en: 'Floating units with no dark gap for fur to collect, and low surfaces that wipe down easily.', zh: '柜体悬空，底下不积毛；低处饰面好擦。' },
      note: { en: 'With pets at home, the TV console floats — no dark gap for fur to collect, and the vacuum passes right under.', zh: '家里有宠物，所以电视柜悬空 —— 没有积毛的死角，吸尘器直接扫过去。' }
    },
    helper: {
      field: 'household', match: /帮佣|helper|maid/i, room: 'laundry', feats: ['tallbroom'],
      quote: { en: 'We have a helper at home.', zh: '家里有帮佣。' },
      told: { en: 'you have a helper at home', zh: '家里有帮佣' },
      answer: { en: 'One tall utility cupboard in the laundry, with every cleaning tool in one place.', zh: '洗衣房一个清洁高柜，清洁工具一次拿齐。' },
      note: { en: 'With a helper at home, every cleaning tool has one tall cupboard — nothing borrowed from other rooms.', zh: '家里有帮佣，所以清洁工具集中在一个高柜里，不用到处借位置。' }
    },
    guests: {
      field: 'household', match: /客人|guest/i, room: 'dining', feats: ['sideboard'],
      quote: { en: 'We often have guests over.', zh: '家里常有客人。' },
      told: { en: 'you often have guests over', zh: '家里常有客人' },
      // 上菜还是要从厨房端出来：只说「少跑几趟」「就在桌边」，不说「不用离开餐桌」
      answer: { en: 'A sideboard by the table for glasses and serving ware — fewer trips to the kitchen.', zh: '餐边柜放酒杯与餐具，开饭少跑几趟厨房。' },
      note: { en: 'You host often, so glasses and serving ware live in the sideboard, a step from the table.', zh: '你们常请客，酒杯与餐具就在餐边柜里，伸手就拿。' }
    }
  };

  /* ---------- 常见顾虑（「工期 · 保障」页，先讲出来再回答） ----
     马来西亚屋主对全屋定制最常担心的几件事，照重要性排（方案取前 2–3 条）。
     answer 只用公司资料（brand.js：订单周期、售后、流程、供应链）和真的流程（先量尺再报价）。
     答不了的不硬答：不保证「不会延期」，只说真的会做的事（每天在群里汇报）；不说「防潮」，只说真的板材与维保。
     订单周期、质保年数在同一页另有大字，这里说数字以外的事（不重复）；事实照 brand.js，那边改了这里也要看。
     needs     这一条要销售填了 p.extra 的哪一栏才出（没填预算就不先讲预算） */
  MB.CONCERNS = [
    { key: 'time',
      worry: { en: 'How long will it take — and will it run late?', zh: '要等多久？会不会一拖再拖？' },
      answer: { en: 'Each series has a stated lead time, shown here. Once installation starts, you get daily updates in your group chat.',
        zh: '每个系列的订单周期都写在这一页；安装开始后，每天在群里汇报进度。' } },
    { key: 'budget', needs: 'budget',
      worry: { en: 'Will the budget keep creeping up?', zh: '预算会不会越做越高？' },
      answer: { en: 'We quote after measuring on site, so the price is based on your home’s actual dimensions.',
        zh: '报价在上门量尺之后，按你们家的实际尺寸算。' } },
    { key: 'after',
      worry: { en: 'Once it’s installed, who do we call?', zh: '装好以后，有问题找谁？' },
      answer: { en: 'We come back: an adjustment visit before you move in, then a maintenance visit every year.',
        zh: '我们会回来：入住前上门调试一次，之后每年一次维保。' } },
    // 潮湿：只讲 brand.js 里有的事实（正品板材与五金、每年上门调试），不替板材打「防潮」的包票
    { key: 'humid',
      worry: { en: 'Will it hold up in our humidity?', zh: '马来西亚这么潮湿，柜子撑得住吗？' },
      answer: { en: 'Genuine Egger and Kastamonu boards and Blum hardware, bought directly from the brands — and if a door shifts, our yearly visit adjusts it.',
        zh: '板材是 Egger、Kastamonu 正品，五金用 Blum，都直接向品牌采购；门板走位了，每年的维保会来调。' } },
    { key: 'look',
      worry: { en: 'Will it look like these pictures?', zh: '做出来，会跟图上一样吗？' },
      answer: { en: 'See and touch the real boards at the showroom; before handover, every item is checked and signed off.',
        zh: '先到展厅看实物板材与色板；交付前专人逐项验收，签回执。' } }
  ];

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
    { match: /全屋|whole (house|home)/i, rooms: ['foyer', 'living', 'kitchen', 'laundry', 'master', 'bathroom'] },
    { match: /厨房|kitchen/i, rooms: ['kitchen'] },
    { match: /衣柜|wardrobe/i, rooms: ['master'] },
    { match: /鞋柜|shoe/i, rooms: ['foyer'] },
    { match: /电视柜|\bTV\b/i, rooms: ['living'] },
    { match: /书房|study/i, rooms: ['study'] },
    { match: /浴室柜|vanity|bathroom/i, rooms: ['bathroom'] },
    { match: /墙板|wall panel/i, rooms: ['living'] }
  ];

  /* 需求卡「风格倾向」→ 方向（取第一个对上的） */
  MB.STYLE_DIRECTION = [
    { match: /侘寂|wabi/i, dir: 'wabi' },
    { match: /日式|japandi|japanese/i, dir: 'misty' },
    { match: /自然原木|natural wood/i, dir: 'misty' },
    { match: /北欧|nordic|scandi/i, dir: 'misty' },
    { match: /现代简约|modern minimal|minimalist/i, dir: 'skeleton' },
    { match: /轻奢|luxe|luxury/i, dir: 'mountain' },
    { match: /中古|mid-century|vintage/i, dir: 'weaving' }
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
    { id: 'b:hero-sail', src: 'assets/img/hero-sail.jpg', w: 1800, h: 1036, series: '', rooms: ['showroom'], en: 'SAIL façade', zh: '溪岸门面' }
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
    { re: /KIDS|CHILD|儿童/, room: 'bedroom' },
    { re: /BEDROOM\d|BEDROOM|卧室/, room: 'guest' },
    { re: /ALTAR|神台/, room: 'altar' },
    { re: /GUEST|STUDIO|客房/, room: 'guest' },
    { re: /SKELETON|EMPTYMOUNTAIN|WEAVING|MISTY|WABI|ABOUTTHEBRAND|SHOWROOM/, room: 'showroom' }
  ];
})();
