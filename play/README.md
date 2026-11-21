# P.L.A.Y

自己手机开房 → 家人朋友扫码加入 → 一起玩。计划见 [`PLAN.md`](./PLAN.md)。

- 正式版：<https://play-wilson.vercel.app>（合并进 main 后自动更新）
- Vercel 项目 `play-wilson`；房间连线借用 SPACE 的 Supabase（只用即时转送，不碰资料表、不存资料）

## 现在有什么（第 1 阶段）

- **开房**：首页 → 密码机 → 开房间 → 大大的房号 + 二维码 + 分享连结
- **加入**：扫码或输入房号 → 输入名字（不用注册）→ 大厅
- **大厅**：看谁在线、房主请人出去、房主选玩法和难度、人到齐按「开始」
- **断线**：手机锁屏 / 切 App 回来自动接上；房主重新整理页面也接得回来（房间状态存在房主手机里）；房主太久没声音，其他人看到「等房主回来」
- **固定网址** `/r/名字`：首页「设定」填「我的固定房间名」→ 开着房间时，别人打开这个网址就自动进到你当下的房间。给 FoloToy 和贴纸用
- **密码机**
  - 一个人玩（不用网络）：简单 3 格 4 色 / 普通 4 格 6 色 / 挑战 5 格 8 色可重复；记最佳次数
  - 房间「比快」：同一题，猜中排前面，猜得少、用时短的赢；没结束前看不到别人猜的颜色
  - 房间「轮流出题」：一个人出题、看得到大家猜到哪里；别人没猜中出题人得分；每局换人出
  - 颜色都配形状，色弱也分得出来
- **中英切换**、可以「加到主画面」（装了以后一个人玩不用网络）

## 怎么运作

房主手机就是裁判：`src/net/room.js`（房间规则）+ 游戏规则（`src/games/codebreaker/game.js`）只在房主手机上跑。
别人的每一步传到房主手机判定，再把**每个人该看的画面**送回去（`viewFor`）。
房间资料经过 Supabase Realtime 的频道 `play:room:房号`、`play:home:名字` 转送，不存档。

要知道的：秘密资料（密码、以后的暗棋、身份）其实在房主手机上，转送时也是同一个频道。家人朋友玩没问题；要防懂技术的人偷看，要把裁判搬到云端（暂时不做）。

## FoloToy 用的东西

- 固定房间网址：`https://play-wilson.vercel.app/r/<你的固定房间名>`
- 密码机规则对照表：[`shared/codebreaker-vectors.json`](./shared/codebreaker-vectors.json)（颜色顺序、三种难度、66 组「密码 + 猜法 → 几个全对 / 几个颜色对」）。FoloToy 版拿这份来测，答案一定跟手机版一样。改了规则要跑 `npm run vectors` 重产生

## 开发

```bash
cd play
npm install
npm test                 # 规则、房间、连线模拟（Node，25 项）
npx vite --port 5175     # 本机跑；网址加 ?net=local&as=名字 → 同一个浏览器开几个分页模拟几支手机
node test/browser/room.browser.mjs [截图资料夹]   # 浏览器实测：3 支手机走一整局（要先开上面那个）
npx vite build
```

本机要连真的 Supabase：`play/.env.local` 放 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（SPACE 项目的公开钥匙，Vercel 上已经设好）。

| 档案 | 内容 |
|---|---|
| `src/games/codebreaker/rules.js` | 密码机规则（打分、出题、合不合规则） |
| `src/games/codebreaker/game.js` | 房间版：比快 / 轮流出题、计分、谁看得到什么 |
| `src/net/room.js` | 房间规则：加入、请出、开始、回大厅 |
| `src/net/host.js` / `client.js` | 房主收动作发画面 / 玩家打招呼、心跳、重连 |
| `src/net/home.js` | 固定网址找房间 |
| `src/net/transport.js` | 转送：Supabase Realtime 或同浏览器分页（测试用） |
| `src/screens/` | 首页、房间、固定网址页 |
