import { Modal } from './kit.jsx';
import { GUIDE } from '../../shared/config.js';

export default function HelpModal({ onClose }) {
  return (
    <Modal title="怎么玩" onClose={onClose} wide>
      <div className="help-grid">
        <section>
          <h4>换材质</h4>
          <p>
            把底部的色块<b>拖到房间里任何表面</b>（地板、墙、柜子、沙发…），那一组表面会发金光，放手就换上。也可以先在左边 MOODBOARD 点一个表面，再点色块。
          </p>
        </section>
        <section>
          <h4>一键情绪</h4>
          <p>
            左上角 <b>Cozy / Bright / Moody</b> 一键换整套材质和时间；有许愿档案时，第一个按钮就是客人自己的梦想家配色。
          </p>
        </section>
        <section>
          <h4>光影</h4>
          <p>右边拖时间滑杆，太阳从清晨走到深夜；窗上的树影、斜进来的光柱、夜里的灯都会跟着变。</p>
        </section>
        <section>
          <h4>家具</h4>
          <p>
            <b>拖动</b>家具换位置；<b>点一下</b>出现小工具条：旋转、换款、复制、移走。底部「Furniture」可以加家具（键盘：R 旋转、Delete 移走）。
          </p>
        </section>
        <section>
          <h4>镜头</h4>
          <p>单指 / 左键拖：转；双指 / 滚轮：缩放；右键 / 三指：平移。相机按钮换视角，房子按钮切换墙的高低。</p>
        </section>
        <section>
          <h4>平面图</h4>
          <p>✏️ 上传平面图（图片或 PDF），AI 先认出房间和门窗，你拖一拖校正，按「生成 3D」—— 家具按设计师规则自动摆好，衣柜、鞋柜长度按客人许愿时数出来的量。</p>
        </section>
        <section>
          <h4>展厅 / 宣传</h4>
          <p>▶ 演示模式：自动环绕 + 一天的光影循环，适合放在展厅大屏或录屏发社交媒体。⬇ 下载带品牌的高清概念图。</p>
        </section>
        <section>
          <h4>和许愿连起来</h4>
          <p>客人在 iPad 上和熊猫{GUIDE.name}许完愿，蓝图页按「在 3D 里看见它」就会带着档案进来。见面时直接在这里讨论：这是不是你要的？</p>
        </section>
      </div>
    </Modal>
  );
}
