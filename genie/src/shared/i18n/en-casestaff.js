// 员工案例库（CaseManager：照片说明、细节、每个房间我们做了什么、照片空间）的英文。中文原句就是 key。
export default {
  // 照片：几张 · 按房间排 · 细节 · 说明
  '{0} / {1} 张': '{0} / {1} photos',
  按房间排: 'Sort by room',
  已按房间排好: 'Sorted by room (cover first)',
  '最多 {0} 张照片：有 {1} 张没加进来': 'Up to {0} photos per case: {1} were not added',
  '满了 · 最多 {0} 张': 'Full · {0} max',
  '「细节」= 柜门、拉手、板材纹理、收口这类近照，客人那边单独一格；说明写一句就好，客人看大图时看得到。':
    '"Details" = close-ups of doors, handles, board grain or joinery; guests get a separate tab for them. One short caption is enough: guests see it on the big photo.',
  '标成细节特写（柜门、拉手、板材纹理、收口）': 'Mark as a close-up detail (doors, handles, board grain, joinery)',
  照片说明: 'Photo caption',
  '照片说明（中文）': 'Caption (Chinese)',
  '照片说明（英文）': 'Caption (English)',
  // 这台设备的照片空间
  '这台设备的照片空间：已用 {0} MB · 还有约 {1} MB': 'Photo space on this device: {0} MB used · about {1} MB free',
  '空间快满了（大约还能放 {0} 张照片）：先「导出」备份，再移除用不到的照片。': 'Space is nearly full (room for about {0} more photos): Export a backup first, then remove photos you don’t need.',
  '浏览器没答应长期保留：空间紧张时可能会清掉这里的照片，记得常「导出」。': 'The browser hasn’t promised to keep these photos: it may clear them when space runs low, so Export often.',
  '这台设备的空间不够了：后面的照片没有存进去': 'This device is out of space: the remaining photos were not saved',
  // 存案例 / 藏起来 / 导入案例包的时候存不进去
  '这台设备的空间不够了：这次的改动没有存进去': 'This device is out of space: these changes were not saved',
  '没存进去：改动都还在，再存一次试试': 'Not saved: your changes are still here, so try saving again',
  '这台设备的空间不够了：案例包没有全部导进来': 'This device is out of space: the case pack was not fully imported',
  '案例包没有全部导进来，再试一次': 'The case pack was not fully imported. Try again.',
  // 每个房间我们做了什么
  '客人在案例详情里一个房间一行地看。「自动」= 照「我们做」和溪岸板材推算的；改了任何一样，这个房间就照你写的。':
    'Guests see this in the case details, one line per room. "Auto" = worked out from "We make this" and the sAil boards; change anything and this room uses what you wrote.',
  '没写：客人在「每个房间」里看不到这一行（照片照常显示）': 'Empty: left out of "What we made in each room" for guests (the photos still show)',
  '这个房间不在「做了哪些地方」里': 'Not in "Which spaces were done"',
  '每个房间最多 4 块板': 'Up to 4 boards per room',
  '这个案例还没填溪岸板材（在「这个家用了」里选）。': 'No sAil boards on this case yet (pick them under "In this home").',
  '一句说明（客人看得到）': 'A short note (guests see it)',
  '例：岛台下面一整排抽屉，锅具全收进去': 'e.g. A full run of drawers under the island for every pot and pan',
  恢复自动: 'Back to auto',
  // 溪岸系列（五大系列，docs/showcase/SERIES.md §4）：系列的名字和那一句话在 en-cases.js（src/shared/series.js）
  溪岸系列: 'sAil series',
  '这个家做的是溪岸哪一个系列。客人在卡片和详情里看到「溪岸 · 空山」这样的小标签；和客人最适合的系列一样的家会排前面。拿不准就先选「未定」。':
    'Which sAil series this home was made in. Guests see a small tag like "SAIL · Empty Mountain" on the card and in the details, and homes in the series that suits a guest best rank higher. If you’re not sure, leave it as "Not set".',
  未定: 'Not set',
  '还没定：客人那边不显示系列标签，也不会因为系列排前。': 'Not set yet: guests see no series tag, and the home gets no series boost.',
  '这个家的溪岸系列 = 客人最适合的（第二适合的加得少一点）': 'This home’s sAil series = the one that suits the guest best (the second-best adds a little less)',
};
