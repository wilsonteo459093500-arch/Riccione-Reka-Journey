// ============================================================
// THE FORMS — 4 fillable documents, one per stage (except CRAFT)
// ============================================================
export const FORMS = {
  // ---- Stage A · VISION ----
  SPACE_SURVEY: {
    code: 'SPACE_SURVEY',
    title: '客户空间问卷',
    en: 'Space Survey',
    purpose: '理解客户的生活方式与空间需求, 决定方案设计方向',
    role: 'client',
    sections: [
      {
        code: 'THRESHOLD', cn: '入户', desc: '客户跨入家门的方式',
        questions: [
          { id: 'th1', q: '鞋子总数预估', type: 'choice', options: ['<30 双', '30-50 双', '>50 双', '有 >43 码 / 长靴'] },
          { id: 'th2', q: '随手区 + 仪容镜', type: 'bool' },
          { id: 'th3', q: '大件物品收纳 (行李/婴儿车)', type: 'bool' },
          { id: 'th4', q: '神台/地主公位置', type: 'bool' },
        ],
      },
      {
        code: 'GATHER', cn: '客厅', desc: '款待与共处的空间',
        questions: [
          { id: 'ga1', q: '视听设置', type: 'choice', options: ['整面电视柜', '简约悬空柜', '投影 + 矮柜', '其他'] },
          { id: 'ga2', q: '展示需求 (艺术品/手办)', type: 'bool' },
          { id: 'ga3', q: '隐藏扫地机器人', type: 'bool' },
          { id: 'ga4', q: '柜体风格偏好', type: 'choice', options: ['全柜门', '开放格', '玻璃门', '露二藏八'] },
        ],
      },
      {
        code: 'NOURISH', cn: '餐厨', desc: '烹饪与用餐的空间',
        questions: [
          { id: 'no1', q: '餐边柜 + 备餐台', type: 'bool' },
          { id: 'no2', q: '酒柜 / 茶柜 / 小家电收纳', type: 'choice', options: ['仅酒', '仅茶', '小家电为主', '混合', '不需要'] },
          { id: 'no3', q: '净水机', type: 'choice', options: ['台式 (Coway)', '立式 (Cuckoo)', '其他', '不需要'] },
          { id: 'no4', q: '厨房布局', type: 'choice', options: ['U 形', 'L 形', '一字', 'Galley/中岛'] },
          { id: 'no5', q: '封闭 vs 开放', type: 'choice', options: ['封闭', '开放', '半开放 (玻璃门)'] },
          { id: 'no6', q: '嵌入式电器清单', type: 'text', placeholder: '冰箱 / 烤箱 / 微波 / 蒸 / 洗碗 ... 型号' },
        ],
      },
      {
        code: 'REST', cn: '卧室', desc: '休憩与充电的空间',
        questions: [
          { id: 're1', q: '挂衣 vs 叠衣比例', type: 'choice', options: ['多挂', '多叠', '一半一半'] },
          { id: 're2', q: '男女分区', type: 'bool' },
          { id: 're3', q: '衣帽间 vs 简约衣柜', type: 'choice', options: ['独立衣帽间', '步入式 (Walk-in)', '一字 / L 衣柜'] },
          { id: 're4', q: '超长衣物 (长裙/cosplay)', type: 'bool' },
          { id: 're5', q: '儿童房床型', type: 'choice', options: ['上下床', '上床下桌', '榻榻米', '独立床', '无儿童房'] },
          { id: 're6', q: '长辈房无障碍', type: 'bool' },
        ],
      },
      {
        code: 'RENEW', cn: '卫生间', desc: '私密的盥洗仪式',
        questions: [
          { id: 'rn1', q: '梳妆 + 镜柜', type: 'bool' },
          { id: 'rn2', q: '壁挂 vs 落地', type: 'choice', options: ['壁挂', '落地', '混合 (主壁挂客落地)'] },
          { id: 'rn3', q: '台盆方式', type: 'choice', options: ['台下盆', '台中盆', '台上盆'] },
        ],
      },
      {
        code: 'FLOW', cn: '多功能 + 阳台', desc: '空间的延展与转换',
        questions: [
          { id: 'fl1', q: '多功能房主要功能', type: 'choice', options: ['书房', '客房', '茶室', '电竞', '储物', '混合'] },
          { id: 'fl2', q: '翻床 / 榻榻米需求', type: 'choice', options: ['翻床', '榻榻米', '都不需要'] },
          { id: 'fl3', q: '阳台用途', type: 'choice', options: ['观景休闲', '工作后院', '混合'] },
          { id: 'fl4', q: '洗衣机位置', type: 'choice', options: ['阳台', '卫生间', '厨房', '其他'] },
        ],
      },
    ],
  },

  // ---- Stage B · BLUEPRINT ----
  MEASUREMENT: {
    code: 'MEASUREMENT',
    title: '现场量尺核查表',
    en: 'Site Measurement Checklist',
    purpose: '复尺时现场逐项核查, 确保图纸与实际一致',
    role: 'staff',
    sections: [
      {
        code: 'STRUCTURE', cn: '墙体与结构', desc: '基础条件核查',
        questions: [
          { id: 'ms1', q: '墙体类型', type: 'choice', options: ['砖墙', '混凝土', '石膏板', '混合', '其他'] },
          { id: 'ms2', q: '墙面是否平整 (无需补差)', type: 'bool' },
          { id: 'ms3', q: '净空高度', type: 'text', placeholder: '例: 2700mm' },
          { id: 'ms4', q: '横梁是否影响柜体走线', type: 'bool' },
        ],
      },
      {
        code: 'OPENINGS', cn: '门窗与开口', desc: '运输与采光通道',
        questions: [
          { id: 'ms5', q: '入户门净宽', type: 'text', placeholder: '例: 900mm' },
          { id: 'ms6', q: '电梯/楼梯运货净宽净高', type: 'text', placeholder: '例: 1200×2100mm' },
          { id: 'ms7', q: '窗户位置与图纸一致', type: 'bool' },
          { id: 'ms8', q: '阳台门尺寸', type: 'text', placeholder: '宽 × 高 (mm)' },
        ],
      },
      {
        code: 'UTILITIES', cn: '水电气', desc: '点位核查',
        questions: [
          { id: 'ms9', q: '水路点位与图纸一致', type: 'bool' },
          { id: 'ms10', q: '电路点位与图纸一致', type: 'bool' },
          { id: 'ms11', q: '燃气表 / 电箱位置', type: 'text', placeholder: '位置 + 距地距离' },
          { id: 'ms12', q: '网络 / 空调内机点位确认', type: 'bool' },
        ],
      },
      {
        code: 'KITBATH', cn: '厨卫专项', desc: '关键工种点位',
        questions: [
          { id: 'ms13', q: '烟管出口位置', type: 'text', placeholder: '距地 + 距墙' },
          { id: 'ms14', q: '水槽下水位置确认', type: 'bool' },
          { id: 'ms15', q: '冰箱位预留净宽 / 净深', type: 'text', placeholder: '例: 700×650mm' },
          { id: 'ms16', q: '嵌入式电器开孔尺寸已核对', type: 'bool' },
        ],
      },
      {
        code: 'SIGNOFF', cn: '收尾确认', desc: '存档 + 双方签字',
        questions: [
          { id: 'ms17', q: '现场拍照存档 (Drive 链接)', type: 'text', placeholder: '云盘链接 (可选, 也可在附件上传)' },
          { id: 'ms18', q: '客户现场签字确认', type: 'bool' },
          { id: 'ms19', q: '设计师签字确认', type: 'bool' },
          { id: 'ms20', q: '特殊情况 / 备注', type: 'text', placeholder: '如墙体偏差、客户临时变更等' },
        ],
      },
    ],
  },

  // ---- Stage D · ARRIVAL ----
  INSTALL_QC: {
    code: 'INSTALL_QC',
    title: '安装质量检查表',
    en: 'Installation QC',
    purpose: '安装过程中现场逐项核查, 不通过不交付',
    role: 'staff',
    sections: [
      {
        code: 'POSITION', cn: '柜体定位', desc: '基础定位检查',
        questions: [
          { id: 'iq1', q: '柜体水平 (气泡居中)', type: 'bool' },
          { id: 'iq2', q: '柜体垂直 (无倾斜)', type: 'bool' },
          { id: 'iq3', q: '与墙面缝隙 ≤ 3mm', type: 'bool' },
          { id: 'iq4', q: '柜体之间对齐顺直', type: 'bool' },
        ],
      },
      {
        code: 'DOORS', cn: '门板与抽屉', desc: '开合动作检查',
        questions: [
          { id: 'iq5', q: '门板缝隙均匀 ≤ 2mm', type: 'bool' },
          { id: 'iq6', q: '门铰链全部紧固', type: 'bool' },
          { id: 'iq7', q: '抽屉滑轨顺滑无卡顿', type: 'bool' },
          { id: 'iq8', q: '软关闭功能正常', type: 'bool' },
          { id: 'iq9', q: '把手 / 拉手安装牢固', type: 'bool' },
        ],
      },
      {
        code: 'HARDWARE', cn: '五金件', desc: '功能件运作检查',
        questions: [
          { id: 'iq10', q: '拉篮 / 旋转架运作正常', type: 'bool' },
          { id: 'iq11', q: 'LED 灯全部点亮', type: 'bool' },
          { id: 'iq12', q: '升降拉杆 / 气撑顺畅', type: 'bool' },
        ],
      },
      {
        code: 'SURFACES', cn: '台面与饰面', desc: '外观完成度',
        questions: [
          { id: 'iq13', q: '台面无划痕 / 缺角', type: 'bool' },
          { id: 'iq14', q: '台面接缝无渗胶 / 错位', type: 'bool' },
          { id: 'iq15', q: '饰面无气泡 / 脱胶', type: 'bool' },
          { id: 'iq16', q: '收边条 / 踢脚线平整', type: 'bool' },
        ],
      },
      {
        code: 'APPLIANCES', cn: '电器与现场', desc: '电器接驳 + 现场清理',
        questions: [
          { id: 'iq17', q: '嵌入式电器卡入到位', type: 'bool' },
          { id: 'iq18', q: '燃气 / 电连接完成', type: 'bool' },
          { id: 'iq19', q: '现场清理完成 (无残料)', type: 'bool' },
          { id: 'iq20', q: '未完成事项 / 备注', type: 'text', placeholder: '需返工 / 待补的项目' },
        ],
      },
    ],
  },

  // ---- Stage E · SIGNATURE ----
  HANDOVER: {
    code: 'HANDOVER',
    title: '最终验收表',
    en: 'Final Handover',
    purpose: '客户验收交付的最终核查, 双方签字后正式交付',
    role: 'staff',
    sections: [
      {
        code: 'OVERALL', cn: '整体验收', desc: '宏观符合度',
        questions: [
          { id: 'hd1', q: '整体外观符合设计方案', type: 'bool' },
          { id: 'hd2', q: '色彩 / 木纹匹配客户预期', type: 'bool' },
          { id: 'hd3', q: '整体尺寸 / 比例符合预期', type: 'bool' },
        ],
      },
      {
        code: 'FUNCTION', cn: '功能测试', desc: '逐项使用测试',
        questions: [
          { id: 'hd4', q: '所有抽屉 / 门正常开合', type: 'bool' },
          { id: 'hd5', q: '所有灯具正常点亮', type: 'bool' },
          { id: 'hd6', q: '所有电器开机测试通过', type: 'bool' },
        ],
      },
      {
        code: 'DETAIL', cn: '细节验收', desc: '近距离品质',
        questions: [
          { id: 'hd7', q: '表面无明显瑕疵 (划痕/脏污)', type: 'bool' },
          { id: 'hd8', q: '缝隙均匀一致', type: 'bool' },
          { id: 'hd9', q: '五金件紧固无松动', type: 'bool' },
        ],
      },
      {
        code: 'DOCS', cn: '文档移交', desc: '客户档案完整性',
        questions: [
          { id: 'hd10', q: '保养说明书已交付', type: 'bool' },
          { id: 'hd11', q: '保修卡已填写并交付', type: 'bool' },
          { id: 'hd12', q: '电器说明书已交付', type: 'bool' },
        ],
      },
      {
        code: 'SIGNOFF', cn: '客户签字', desc: '正式交付确认',
        questions: [
          { id: 'hd13', q: '使用 + 保养讲解完成', type: 'bool' },
          { id: 'hd14', q: '售后联系方式已交付客户', type: 'bool' },
          { id: 'hd15', q: '客户签字验收 (照片存档)', type: 'bool' },
          { id: 'hd16', q: '客户反馈 / 特殊说明', type: 'text', placeholder: '客户评价、未来改进点' },
        ],
      },
    ],
  },
};

// Helper to compute total questions in a form
export const formTotal = (formCode) => {
  const f = FORMS[formCode];
  return f ? f.sections.reduce((a, s) => a + s.questions.length, 0) : 0;
};
