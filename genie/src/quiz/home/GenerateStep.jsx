// G · 把它放进你的家（SPEC §7）—— 暮色里的仪式卡：真的梦想家卡牌 + 一张小清单（参考案例 · 你的家 · 户型图 · 保留）
// + 金色的「✦ 生成我的家」。按下去：光扫过按钮 → 「达成」→ 一大片暮色拂过 → 打开 3D（HomeJourney 负责跳转）。

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import Pangie from '../../shared/Pangie.jsx';
import fx, { useGleam } from '../../shared/fx.js';
import { lineText } from '../../shared/voice.js';
import { t, L } from '../../shared/i18n.js';
import { KEEP_SLOTS, KEEP_ITEM_BY_V, homeLine, whereText, keepLocks, keepLabel, floorsText, lab, planHint } from '../../shared/home.js';
import { FLOOR_NAMES } from '../../studio/plan/model.js';
import * as C from '../../shared/cases.js';
import { DreamerCard } from '../Reveal.jsx';
import { Head, Swatch } from './kit.jsx';

export default function GenerateStep({ profile, home, chosen = [], onGo, busy = false }) {
  const ctaRef = useRef(null);
  const cardRef = useRef(null);
  useGleam(ctaRef, !busy, { first: 2200, every: 5200 });
  useEffect(() => {
    const card = cardRef.current?.querySelector('.dcard');
    const off = fx.clock.after(500, () => card && fx.holo(card));
    return off;
  }, []);
  const first = chosen[0];
  const cover = first ? C.coverOf(first) : null;
  const locks = keepLocks(home);
  const items = home?.keepMode === 'new' ? [] : (home?.keepItems || []).filter((v) => KEEP_ITEM_BY_V[v]);
  const where = whereText(home);
  const st = home?.plan?.state;
  const read = st === 'read' || st === 'rough';
  // home.plan.rooms 是「几个房间」（数字）；解构读（静态守门只拦 plan.rooms 那种直接读户型房间表的写法）
  const { floors = 1, rooms = 0 } = home?.plan || {};
  // 客人说有两层、只读到一层：一层一层写清楚（一楼 ✓ · 二楼 —），不要只写「已读好」
  const want = read ? Math.min(4, Number(planHint(home || {}).storeys) || 1) : 1;
  const missing = read && want > floors;

  return (
    <div className="step hj-card hj-gen-step">
      <Head eyebrow={t('准备好了')} title={t('把它放进你的家')} />
      <div className="hj-gen">
        <div className="hj-gen-card" ref={cardRef}>
          <DreamerCard profile={profile} />
        </div>
        <dl>
          <dt>{t('参考案例')}</dt>
          <dd>
            {first ? (
              <>
                {cover && <img src={C.imageURL(first, cover, 480)} alt="" />}
                <span>{L(first.title)}</span>
                {chosen.length > 1 && <span className="hj-sample">{t('另外 {0} 个', [chosen.length - 1])}</span>}
              </>
            ) : (
              <span>{t('从你的牌开始')}</span>
            )}
          </dd>
          <dt>{t('你的家')}</dt>
          <dd>
            {/* 「1,880 sq ft」不在中间断行 */}
            <span>{(homeLine(home) || '—').replace(/ sq ft/g, '\u00a0sq\u00a0ft')}</span>
            {where && <span className="hj-sample">{where}</span>}
          </dd>
          <dt>{t('户型图')}</dt>
          <dd>
            {read ? (
              <>
                {missing ? (
                  <span className="hj-floors">
                    {Array.from({ length: want }, (_, i) => (
                      <span key={i} className={i < floors ? 'hj-ok' : 'hj-miss'}>
                        {i < floors ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : null}
                        {t(FLOOR_NAMES[i])}
                        {i < floors ? '' : ' —'}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="hj-ok">
                    <Check size={15} strokeWidth={2.4} aria-hidden="true" />
                    {t('已读好')}
                  </span>
                )}
                <span>{floors > 1 ? t('{0} · {1} 个房间', [floorsText(floors), rooms]) : t('{0} 个房间', [rooms])}</span>
                {missing && <span className="hj-sample">{t('少的那一层，设计师之后会补上')}</span>}
              </>
            ) : st === 'unreadable' ? (
              <span className="hj-sample">{t('已上传 · 先用示范户型，设计师会照着重新画')}</span>
            ) : (
              <span className="hj-sample">{t('示范户型（之后可以换成你的）')}</span>
            )}
          </dd>
          {(Object.keys(locks).length > 0 || items.length > 0) && (
            <>
              <dt>{t('保留')}</dt>
              <dd>
                {KEEP_SLOTS.filter((k) => locks[k.slot]).map((k) => (
                  <span key={k.slot} className="hj-kept">
                    <Swatch as="i" id={locks[k.slot]} px={64} className="hj-c" aria-hidden="true" />
                    {keepLabel(k.slot, locks[k.slot])}
                  </span>
                ))}
                {items.map((v) => (
                  <span key={v} className="hj-kept">
                    {lab(KEEP_ITEM_BY_V[v])}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="q-actions">
        <button ref={ctaRef} type="button" className="btn btn-gold big" onClick={onGo} disabled={busy} data-sfx="none">
          <span>✦ {t('生成我的家')}</span>
        </button>
      </div>
      <p className="hj-gen-say">
        <Pangie mood="happy" prop="ball" size={44} float={false} speaker />
        <span>{lineText('gen.ready')}</span>
      </p>
      <p className="hj-fine">{t('之后随时可以换案例、换颜色、拖家具。')}</p>
    </div>
  );
}
