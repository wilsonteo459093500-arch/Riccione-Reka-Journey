// 怎么用：八张小卡，一张一件事。标题和「更多」菜单里的那一项同名（怎么用 / How to use）。
// 许愿模式（wish）：平面图只能画、没有相机按钮（下载概念图）—— 那两张卡换成不提上传、不提相机的说法。

import { BRAND } from '../../shared/config.js';
import { Modal, Icon } from './kit.jsx';
import { t, tj, guideName, isEn } from '../../shared/i18n.js';

const CARDS = [
  { icon: 'palette', h: '换材质', p: () => tj('把底部的色块{0}（地板、墙、柜子、沙发…），那一组表面会发金光，放手就换上。也可以先在左边材质板点一个表面，再点色块。', [<b key="b">{t('拖到房间里任何表面')}</b>]) },
  // 和面板上的按钮同名：中文「温暖 / 明亮 / 沉浸」，英文 Cosy / Bright / Moody
  { icon: 'sparkles', h: '一键情绪', p: () => t('左上角「温暖 / 明亮 / 沉浸」一键换整套材质和时间；有许愿档案时，第一个按钮就是客人自己的梦想家配色。客人的雷区会自动避开。') },
  { icon: 'sun', h: '光影', p: () => t('拖太阳或时间滑杆，太阳从清晨走到深夜；窗上的树影、斜进来的光柱、夜里的灯都会跟着变。') },
  { icon: 'pointer', h: '家具', p: () => t('拖动家具换位置；点一下出现小工具条：旋转、换款、复制、移走。底部「家具」可以加家具（键盘：R 旋转、Delete 移走）。') },
  { icon: 'view', h: '镜头', p: () => t('单指 / 左键拖：转；双指 / 滚轮：缩放；右键 / 三指：平移。视角按钮换角度，墙按钮切换墙的高低。') },
  {
    icon: 'plan',
    h: '平面图',
    p: (wish) =>
      wish
        ? t('按「平面图」拉方块画房间、点墙放门窗，再按「生成 3D」—— 家具按设计师规则自动摆好。你家真正的平面图，设计师之后会换上去。')
        : t('按「平面图」上传图片或 PDF，AI 先认出房间和门窗，你拖一拖校正，按「生成 3D」—— 家具按设计师规则自动摆好，衣柜、鞋柜长度按客人许愿时数出来的量。'),
  },
  {
    icon: 'showroom',
    // 许愿模式里客人用不到展厅大屏、相机按钮：只讲演示模式
    h: (wish) => (wish ? '演示模式' : '展厅 / 宣传'),
    p: (wish) =>
      wish
        ? t('「更多」里的演示模式：自动环绕 + 一天的光影循环；点任意处退出。')
        : t('「更多」里的演示模式：自动环绕 + 一天的光影循环。展厅大屏直接打开 studio.html?demo=1（只显示示范户型，不会出现客人名字；长按左下角 WISH 字标 1.5 秒或按 Esc 退出）。相机按钮下载带品牌的高清概念图。'),
  },
  { icon: 'storage', h: '和许愿连起来', p: () => t('客人在 iPad 上和熊猫{0}许完愿，蓝图页按「在 3D 里看见它」就会带着档案进来。见面时直接在这里讨论：这是不是你要的？', [guideName()]) },
];

export default function HelpModal({ wish = false, onClose }) {
  return (
    <Modal eyebrow={isEn() ? BRAND.studioEn : BRAND.studio} title={t('怎么用')} onClose={onClose} wide>
      <div className="help-grid">
        {CARDS.map((c) => (
          <section key={c.icon}>
            <span className="help-ico">
              <Icon name={c.icon} size={18} />
            </span>
            <h4>{t(typeof c.h === 'function' ? c.h(wish) : c.h)}</h4>
            <p>{c.p(wish)}</p>
          </section>
        ))}
      </div>
    </Modal>
  );
}
