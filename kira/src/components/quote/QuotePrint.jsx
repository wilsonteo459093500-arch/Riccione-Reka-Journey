import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Image as ImageIcon } from 'lucide-react';
import { exportLongImage } from '../../utils/longImage.js';
import CabinetPics from '../planner/CabinetPics.jsx';
import PlanFigure from '../plan/PlanFigure.jsx';
import { planReady } from '../../planner/plan.js';
import { planImageDataUrl } from '../../services/planImages.js';
import { useBackClose } from '../planner/bits.jsx';
import { cabinetTitle, frameTitle } from '../../planner/templates.js';
import { frameDimsLabel } from '../../planner/bridge.js';
import { T } from '../../theme.js';
import { fmtMYR, fmtNum, tr, pickLang, capColor, cabTypeById, cabDimsLabel, RLBL, QUOTE_TERMS, LOOSE_TERMS, discountChainRate, discountChainLabel } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

// 报价单（可打印 / 另存 PDF）。lang：'en' | 'zh' | 'both'。
// 定制橱柜（SAIL by Riccione Reka）+ Loose Furniture（Riccione Furniture，另起一页）。
export default function QuotePrint({ meta, computed, loose, cabinetNote = '', looseNote = '', discountNote = '', looseDiscountNote = '', audience = 'retail', designerDisc = '30', lang = 'both', showPics = true, plans = [], onClose }) {
  useBackClose(onClose); // 手机返回键 = 关掉预览，不离开 KIRA
  // 第三版：平面索引图（每张有柜子的户型图一页）。图片先转 data URL（长图截图时不用再下载）
  const allZones = computed.zoneResults.map((zr) => zr.zone);
  const cabsAll = allZones.flatMap((z) => (z.cabinets || []).map((c) => ({ c, z })));
  const planPages = (plans || []).filter((p) => planReady(p) && cabsAll.some(({ c }) => c.place?.planId === p.id));
  const [planImgs, setPlanImgs] = useState({});
  const planLoad = useRef(null);
  if (!planLoad.current) {
    planLoad.current = Promise.all(planPages.map((p) => planImageDataUrl(p.image.path).then((u) => [p.image.path, u || '']).catch(() => [p.image.path, ''])))
      .then((pairs) => Object.fromEntries(pairs));
  }
  useEffect(() => { let on = true; planLoad.current.then((m) => { if (on) setPlanImgs(m); }); return () => { on = false; }; }, []);
  const zones = computed.zoneResults.filter((zr) => zr.zone.items.length > 0);
  const looseRows = loose?.rows || [];
  const hasCab = zones.length > 0;
  const hasLoose = looseRows.length > 0;
  const looseNet = loose?.net || 0;
  const grand = computed.net + looseNet;
  const hasSummary = hasCab && hasLoose; // 两个部分都有才需要总览页
  // 三种版本：retail 零售 / designer 双价(零售+供货,只在总额) / designer_net 净价(每个单价都是供货价)
  const isDesigner = audience === 'designer';         // 双价
  const isDesignerNet = audience === 'designer_net';  // 净价
  const anyDesigner = isDesigner || isDesignerNet;
  const supplyRate = discountChainRate(designerDisc);
  const supply = (retail) => Math.round((Number(retail) || 0) * supplyRate);
  const discTag = discountChainLabel(designerDisc); // "30%+10%"
  const priceScale = isDesignerNet ? supplyRate : 1; // 净价版把每个价格 × 系数
  const px = (v) => Math.round((Number(v) || 0) * priceScale); // 显示价（净价版=供货价）
  // 岩板 sintered stone 不折扣：设计师版也不打供货折扣。按项目判断（ir.noDiscount）。
  const pxi = (v, ir) => (ir?.noDiscount ? Math.round(Number(v) || 0) : px(v));
  const zoneShown = (zr) => Math.round(zr.items.reduce((s, ir) => s + (ir.noDiscount ? ir.total : ir.total * priceScale), 0));
  const excluded = computed.excluded || 0;
  // 设计师版按「零售原价 gross」计（不理会给零售客户的折扣）；零售版按折后 net 计。
  const cabRetail = anyDesigner ? computed.gross : computed.net;
  const looseRetailV = anyDesigner ? (loose?.gross || 0) : looseNet;
  const grandRetail = cabRetail + looseRetailV;
  // 供货价：定制 = (原价 − 岩板) × 系数 + 岩板；家具 = 原价 × 系数
  const cabSupply = supply(cabRetail - excluded) + Math.round(excluded);
  const looseSupply = supply(looseRetailV);
  const grandSupply = cabSupply + looseSupply;
  const exclTag = excluded > 0 ? ` · ${tr(RLBL.noDiscExcl, lang)}` : '';
  const t = (obj) => tr(obj, lang);
  const lineDesc = (ln) => (lang === 'en' ? ln.descEn : lang === 'zh' ? ln.descZh : `${ln.descEn} ${ln.descZh}`);
  const lineUom = (ln) => (lang === 'en' ? ln.uomEn : lang === 'zh' ? ln.uomZh : ln.uomZh);
  // 定制柜体子项描述：门板/柜体 → "Door: A Series"；抽屉 → "Drawers"
  const cabLineLabel = (ln) => {
    const sid = (ln.descEn.split(' ')[1] || '').trim();
    const map = {
      door:    { en: `Door: ${sid} Series`,         zh: `门板：${sid} 系列` },
      carcass: { en: `Carcass: ${sid} Series`,      zh: `柜体：${sid} 系列` },
      open:    { en: `Open Cabinet: ${sid} Series`, zh: `开放柜：${sid} 系列` },
      drawer:  { en: ln.descEn, zh: ln.descZh }, // 全展 / 半展 由明细自带
    };
    return map[ln.bucket] ? t(map[ln.bucket]) : lineDesc(ln);
  };

  // PDF 文件名：EST QUOTE_RICCIONE_[客户]_[Site]_YYYYMMDD（Chrome 存 PDF 默认取 document.title）
  const handlePrint = async () => {
    // 户型图（平面索引图页）载入完才打印，不然那一页会是空白
    if (planPages.length) { await planLoad.current; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
    const prev = document.title;
    const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, ' ');
    const d = (meta.date || '').replace(/-/g, '');
    document.title = `EST QUOTE_RICCIONE_${safe(meta.name) || 'Customer'}_${safe(meta.location) || 'Site'}_${d || 'draft'}${isDesignerNet ? '_DESIGNER_NET' : isDesigner ? '_DESIGNER' : ''}`;
    const restore = () => { document.title = prev; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  };

  // 一张长图（内容和 PDF 一样完整）：手机可直接分享到 WhatsApp，电脑则下载 PNG
  const sheetRef = useRef(null);
  const [imgBusy, setImgBusy] = useState(false);
  const docName = () => {
    const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, ' ');
    const d = (meta.date || '').replace(/-/g, '');
    return `EST QUOTE_RICCIONE_${safe(meta.name) || 'Customer'}_${safe(meta.location) || 'Site'}_${d || 'draft'}${isDesignerNet ? '_DESIGNER_NET' : isDesigner ? '_DESIGNER' : ''}`;
  };
  const handleImage = async () => {
    if (!sheetRef.current || imgBusy) return;
    setImgBusy(true);
    try {
      await planLoad.current; // 户型图载入完才截图
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await exportLongImage(sheetRef.current, docName());
    } catch (e) { alert('Long image failed 长图生成失败：' + (e?.message || e)); }
    setImgBusy(false);
  };

  // 抬头（品牌可换）
  // logo：有就印正式标志图（public/brand/），alt = 原来的品牌文字；没有就照旧印文字
  const Head = ({ brand, logo, logoH = 40 }) => (
    <div className="flex items-start justify-between pb-4 mb-4" style={{ borderBottom: `2px solid ${T.ink}` }}>
      <div>
        {logo
          ? <img src={logo} alt={brand} data-quote-logo style={{ height: logoH, width: 'auto', display: 'block' }} />
          : <div className="font-display text-2xl">{brand}</div>}
        <div className="text-xs tracking-widest uppercase mt-1" style={{ color: T.inkSoft }}>{t(RLBL.estQuote)}</div>
        {anyDesigner && (
          <div className="inline-block mt-1 px-2 py-0.5 text-[10px] uppercase tracking-widest"
            style={{ background: T.wood, color: '#fff', borderRadius: 2 }}>
            {t({ en: 'Designer Copy', zh: '设计师版' })}{isDesignerNet ? ` · ${t({ en: 'Net Price', zh: '净价' })}` : ''} · {t({ en: 'Confidential', zh: '内部' })}
          </div>
        )}
      </div>
      <div className="text-right text-xs" style={{ color: T.inkSoft }}>
        <div className="font-medium" style={{ color: T.ink }}>{t(RLBL.rev)} {meta.version || '1'}</div>
        <div>{t(RLBL.date)} {fmt(meta.date)}</div>
        {meta.ref && <div>{t(RLBL.ref)} {meta.ref}</div>}
        {meta.pic && <div>{t(RLBL.pic)} {meta.pic}</div>}
      </div>
    </div>
  );

  const CustomerRow = () => (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-5">
      <div><span style={{ color: T.inkSoft }}>{t(RLBL.name)}：</span>{meta.name || '—'}</div>
      <div><span style={{ color: T.inkSoft }}>{t(RLBL.site)}：</span>{meta.location || '—'}</div>
    </div>
  );

  const Terms = ({ terms }) => (
    <div className="mt-8 space-y-3 text-[11px]" style={{ color: T.inkSoft, breakInside: 'avoid' }}>
      {terms.map((sec, si) => (
        <div key={si}>
          <div className="font-medium" style={{ color: T.ink }}>{t(sec.title)}</div>
          {sec.lines.map((ln, li) => (
            lang === 'both'
              ? <div key={li}>{sec.bullet ? '• ' : ''}{ln.en}　{ln.zh}</div>
              : <div key={li}>{sec.bullet ? '• ' : ''}{t(ln)}</div>
          ))}
          {sec.note && <div className="italic">{t(sec.note)}</div>}
        </div>
      ))}
    </div>
  );

  const NoteBlock = ({ text }) => (
    text ? (
      <div className="mt-5 text-[11px]" style={{ color: T.inkSoft, breakInside: 'avoid' }}>
        <div className="font-medium" style={{ color: T.ink }}>{t(RLBL.notes)}</div>
        <div style={{ whiteSpace: 'pre-line' }}>{text}</div>
      </div>
    ) : null
  );

  // 总览页：某部分的 原价 / 折扣 / 折后小计
  const SummarySection = ({ label, brand, calc, note, supplyVal }) => (
    <>
      <tr style={{ borderTop: `1px solid ${T.line}` }}>
        <td className="pt-2 px-2 font-medium" colSpan={2}>{label} <span style={{ color: T.inkSoft }}>· {brand}</span></td>
      </tr>
      {anyDesigner ? (
        /* 设计师版：只显示一个小计（双价=零售原价；净价=供货价）*/
        <tr>
          <td className="py-0.5 px-2 pl-5 font-medium">{t(RLBL.subtotal)}</td>
          <td className="text-right py-0.5 px-2 font-medium">{fmtMYR(isDesignerNet ? supplyVal : calc.gross)}</td>
        </tr>
      ) : (
        <>
          <tr>
            <td className="py-0.5 px-2 pl-5" style={{ color: T.inkSoft }}>{t(RLBL.gross)}</td>
            <td className="text-right py-0.5 px-2">{fmtMYR(calc.gross)}</td>
          </tr>
          {calc.discount > 0 && (
            <tr style={{ color: T.terra }}>
              <td className="py-0.5 px-2 pl-5">{t(RLBL.discount)}{calc.discountMode === 'amt' ? '' : ` (${calc.adjustPct}%)`}{calc.excluded > 0 ? ` · ${t(RLBL.noDiscExcl)}` : ''}{note ? <span className="italic"> — {note}</span> : null}</td>
              <td className="text-right py-0.5 px-2">− {fmtMYR(calc.discount)}</td>
            </tr>
          )}
          <tr>
            <td className="py-0.5 px-2 pl-5 font-medium">{t(RLBL.subtotal)}</td>
            <td className="text-right py-0.5 px-2 font-medium">{fmtMYR(calc.net)}</td>
          </tr>
        </>
      )}
    </>
  );

  const Signatures = () => (
    <div className="mt-12 text-xs" style={{ width: '48%' }}>
      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>{t(RLBL.customer)}</div>
    </div>
  );

  // ---- KIRA 积木柜：小图（左）+ 每个柜体的明细（右）----
  const partLabel = (ln) => {
    const sid = (ln.descEn.split(' ')[1] || '').trim();
    if (ln.bucket === 'panel' && ln.part === 'tvWall') return t({ en: `Feature Wall: ${sid} Series`, zh: `电视墙：${sid} 系列` });
    if (ln.bucket === 'panel') return t({ en: `Side Panel: ${sid} Series`, zh: `见光板：${sid} 系列` });
    if (ln.bucket === 'door' && ln.part === 'glass') return t({ en: `Glass Door: ${sid} Series`, zh: `玻璃门：${sid} 系列` });
    return cabLineLabel(ln);
  };
  const frameLines = (frame, irs) => {
    const lines = irs.filter((ir) => ir.item.kira?.frameId === frame.id)
      .flatMap((ir) => ir.lines.map((ln) => ({ ...ln, part: ir.item.kira.part })));
    const out = [];
    lines.forEach((ln) => {
      const key = `${ln.bucket}|${ln.unitMyr}|${ln.uomEn}|${partLabel(ln)}`;
      const hit = out.find((o) => o.key === key);
      if (hit) { hit.qty += ln.qty; hit.total += ln.total; } else out.push({ ...ln, key });
    });
    return out;
  };
  // 宽版（电脑 / 打印 / 长图 820 px）：小图在左边一栏（rowSpan）；
  // 窄版（手机上看预览，报价单 < 600 px）：小图单独一行在上，明细占满整行。两版都出，用容器查询切换（kq-w / kq-n）。
  const kiraCabinetRows = (cab, irs) => {
    const frames = (cab.frames || []).map((f) => ({ f, lines: frameLines(f, irs) })).filter((x) => x.lines.length);
    const multi = frames.length > 1;
    const nRows = frames.reduce((a, x) => a + x.lines.length + (multi ? 1 : 0), 0);
    const title = [cab.code, cabinetTitle(cab, lang)].filter(Boolean).join(' · ');
    const one = frames[0]?.f;
    const build = (side, cls) => {
      const k = `${cab.id}-${cls || 'x'}`;
      const span = side ? 5 : 6; // 左边一栏被小图占了 → 少一栏
      const rows = [];
      if (cls === 'kq-n') rows.push(
        <tr key={k + '-p'} className={cls} style={{ borderTop: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
          <td colSpan={6} className="pt-2 px-2"><CabinetPics cab={cab} lang={lang} height="42mm" /></td>
        </tr>,
      );
      rows.push(
        <tr key={k + '-h'} className={cls} style={{ borderTop: cls === 'kq-n' ? 'none' : `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
          {side && (
            <td rowSpan={nRows + 1} className="py-2 px-2 align-top" style={{ width: '34%' }}>
              <CabinetPics cab={cab} lang={lang} height="42mm" />
            </td>
          )}
          <td className="py-1 px-2 font-medium" colSpan={span}>
            {title}
            {!multi && one && <span className="font-normal ml-2" style={{ color: T.inkSoft }}>{frameDimsLabel(one, lang === 'zh' ? 'zh' : 'en')}</span>}
          </td>
        </tr>,
      );
      frames.forEach(({ f, lines }) => {
        if (multi) rows.push(
          <tr key={k + f.id + '-h'} className={cls}>
            <td className="pt-1 px-2 pl-4 text-xs" colSpan={span} style={{ color: T.ink }}>
              {frameTitle(cab, f, lang) /* 按语言从模板 + 柜体种类 / 第几面墙生成（不拆 label 字串）*/}
              <span className="ml-2" style={{ color: T.inkSoft }}>{frameDimsLabel(f, lang === 'zh' ? 'zh' : 'en')}</span>
            </td>
          </tr>,
        );
        lines.forEach((ln, i) => rows.push(
          <tr key={k + f.id + i} className={cls}>
            <td className="py-1 px-2 pl-6" colSpan={side ? 1 : 2} style={{ color: T.inkSoft }}>{partLabel(ln)}</td>
            <td className="text-right py-1 px-2">{fmtNum(ln.qty, ln.piece ? 0 : 2)}</td>
            <td className="py-1 px-2">{lineUom(ln)}</td>
            <td className="text-right py-1 px-2">{fmtNum(px(ln.unitMyr), 0)}</td>
            <td className="text-right py-1 px-2">{fmtNum(px(ln.total), 0)}</td>
          </tr>,
        ));
      });
      return rows;
    };
    // 宽版在前、窄版在后：rowSpan 只跨宽版自己那几行
    return showPics ? [...build(true, 'kq-w'), ...build(false, 'kq-n')] : build(false, undefined);
  };

  const th = 'text-right font-normal py-1 px-2';

  return createPortal(
    <div className="quote-print-overlay fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45,62,54,0.85)' }} onClick={onClose}>
      {/* 报价单本身窄（手机预览）→ 柜子小图换到明细上面一行；长图 / 打印 / 电脑都是宽版 */}
      <style>{'.kq-n{display:none}@container (max-width:599px){.kq-w{display:none}.kq-n{display:table-row}}'}</style>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-8">
        <div ref={sheetRef} className="quote-print-sheet w-full max-w-4xl my-4" style={{ background: '#fff', borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', containerType: 'inline-size' }} onClick={(e) => e.stopPropagation()}>

          {/* toolbar */}
          <div className="no-print flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: T.inkSoft }}>{t(RLBL.preview)}</span>
            <div className="flex items-center gap-2">
              <button onClick={handleImage} disabled={imgBusy} className="px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: T.sage, color: '#fff', borderRadius: '2px' }}>
                <ImageIcon size={12} /> {imgBusy ? '…' : t({ en: 'Long image', zh: '存长图' })}
              </button>
              <button onClick={handlePrint} className="px-3 py-1.5 text-xs flex items-center gap-1.5"
                style={{ background: T.wood, color: '#fff', borderRadius: '2px' }}>
                <Printer size={12} /> {t(RLBL.printBtn)}
              </button>
              <button onClick={onClose} className="p-1.5" style={{ color: T.inkSoft }}><X size={16} /></button>
            </div>
          </div>

          {/* ===== 第一页：总览 Summary（定制 + 家具 总计）===== */}
          {hasSummary && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13 }}>
              <Head brand="RICCIONE" logo="/brand/riccione-logo.png" logoH={30} />
              <CustomerRow />
              <div className="mt-6" style={{ breakInside: 'avoid' }}>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide" style={{ background: T.sand }}>{t(RLBL.summary)}</div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <SummarySection label={t(RLBL.customCabinet)} brand="SAIL by Riccione Reka" calc={computed} note={discountNote} supplyVal={cabSupply} />
                    <SummarySection label={t(RLBL.looseSection)} brand="Riccione Furniture" calc={loose} note={looseDiscountNote} supplyVal={looseSupply} />
                    {/* 合计（两部分）—— 零售版才显示原价/折扣分解 */}
                    {!anyDesigner && (
                      <>
                        <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                          <td className="pt-2 px-2" style={{ color: T.inkSoft }}>{t(RLBL.totalBeforeDiscount)}</td>
                          <td className="text-right pt-2 px-2">{fmtMYR(computed.gross + (loose?.gross || 0))}</td>
                        </tr>
                        {(computed.discount + (loose?.discount || 0)) > 0 && (
                          <tr style={{ color: T.terra }}>
                            <td className="py-0.5 px-2">{t(RLBL.totalDiscountAmt)}</td>
                            <td className="text-right py-0.5 px-2">− {fmtMYR(computed.discount + (loose?.discount || 0))}</td>
                          </tr>
                        )}
                      </>
                    )}
                    {isDesignerNet ? (
                      /* 净价版：直接一个供货总额 */
                      <tr style={{ borderTop: `2px solid ${T.ink}`, color: T.wood }}>
                        <td className="py-3 px-2 font-display text-xl">{t({ en: 'Designer Total', zh: '设计师总额' })}{exclTag && <span className="text-xs font-body" style={{ color: T.inkSoft }}>{exclTag}</span>}</td>
                        <td className="text-right py-3 px-2 font-display text-xl">{fmtMYR(grandSupply)}</td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ borderTop: `2px solid ${T.ink}` }}>
                          <td className="py-3 px-2 font-display text-xl">{isDesigner ? t({ en: 'Retail Total', zh: '零售总额' }) : t(RLBL.grandTotal)}</td>
                          <td className="text-right py-3 px-2 font-display text-xl">{fmtMYR(grandRetail)}</td>
                        </tr>
                        {isDesigner && (
                          <tr style={{ color: T.wood, borderTop: `1px solid ${T.line}` }}>
                            <td className="py-3 px-2 font-display text-xl">{t({ en: 'Designer Supply', zh: '设计师供货价' })} ({discTag}){exclTag && <span className="text-xs font-body" style={{ color: T.inkSoft }}>{exclTag}</span>}</td>
                            <td className="text-right py-3 px-2 font-display text-xl">{fmtMYR(grandSupply)}</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
                <div className="mt-4 text-[11px] italic" style={{ color: T.inkSoft }}>{t(RLBL.detailNote)}</div>
              </div>
              <Signatures />
            </div>
          )}

          {/* ===== 第三版：平面索引图（定制橱柜明细前，每张户型图一页）===== */}
          {hasCab && planPages.map((p, i) => {
            const here = cabsAll.filter(({ c }) => c.place?.planId === p.id).sort((a, b) => (parseInt(String(a.c.code).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.c.code).replace(/\D/g, ''), 10) || 0));
            return (
              <div key={p.id} className="p-8 text-[#2D3E36]" style={{ fontSize: 13, breakBefore: hasSummary || i > 0 ? 'page' : 'auto' }} data-plan-page>
                <Head brand="SAIL BY RICCIONE REKA" logo="/brand/sail-logo.png" logoH={58} />
                <CustomerRow />
                <div className="mt-4 px-2 py-1 font-medium text-xs uppercase tracking-wide" style={{ background: T.sand }}>
                  {t({ en: 'Floor Plan Index', zh: '平面索引图' })}{p.name ? ` · ${pickLang(p.name, lang)}` : ''}
                </div>
                <div className="mt-2" style={{ border: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
                  <PlanFigure plan={p} href={planImgs[p.image.path] || null} cabinets={here.map(({ c }) => c)} />
                </div>
                <table className="w-full mt-3 text-xs" style={{ borderCollapse: 'collapse', breakInside: 'avoid' }}>
                  <tbody>
                    {here.map(({ c, z }) => (
                      <tr key={c.id} style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                        <td className="py-1 px-2 font-medium" style={{ width: 48 }}>{c.code}</td>
                        <td className="py-1 px-2">{cabinetTitle(c, lang)}</td>
                        <td className="py-1 px-2" style={{ color: T.inkSoft }}>{pickLang(z.name, lang) || t(RLBL.untitled)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] italic" style={{ color: T.inkSoft }}>{t({ en: 'Positions are indicative; final dimensions follow site measurement.', zh: '位置仅示意，最终尺寸以现场测量为准。' })}</div>
              </div>
            );
          })}

          {/* ===== 定制橱柜 SAIL BY RICCIONE REKA ===== */}
          {hasCab && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13, breakBefore: hasSummary || planPages.length ? 'page' : 'auto' }}>
              <Head brand="SAIL BY RICCIONE REKA" logo="/brand/sail-logo.png" logoH={58} />
              <CustomerRow />

              {zones.map((zr) => {
                // KIRA：积木柜的明细按柜子分组；有积木柜的房间多一栏放小图（立面 + 3D 在明细左边）
                const cabById = new Map((zr.zone.cabinets || []).map((c) => [c.id, c]));
                const groups = [];
                zr.items.forEach((ir) => {
                  const cid = ir.item.kira?.cabinetId;
                  if (cid && cabById.has(cid)) {
                    const last = groups[groups.length - 1];
                    if (last && last.cab && last.cab.id === cid) last.irs.push(ir);
                    else groups.push({ cab: cabById.get(cid), irs: [ir] });
                  } else groups.push({ ir });
                });
                const withPics = groups.some((g) => g.cab);
                const descSpan = withPics ? 2 : 1;
                return (
                <div key={zr.zone.id} className="mb-4">
                  <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide"
                    style={{ background: T.sand, breakInside: 'avoid', breakAfter: 'avoid' }}>{pickLang(zr.zone.name, lang) || t(RLBL.untitled)}</div>
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                        <th className="text-left font-normal py-1 px-2" colSpan={descSpan} style={{ width: withPics ? '62%' : '42%' }}>{t(RLBL.desc)}</th>
                        <th className={th}>{t(RLBL.qty)}</th>
                        <th className="text-left font-normal py-1 px-2">{t(RLBL.uom)}</th>
                        <th className={th}>{t(RLBL.unitPrice)}</th>
                        <th className={th}>{t(RLBL.amount)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.flatMap((g) => {
                        if (g.cab) return kiraCabinetRows(g.cab, g.irs);
                        const ir = g.ir;
                        const qtyCell = (ln) => <td className="text-right py-1 px-2">{fmtNum(ln.qty, ln.piece ? 0 : 2)}</td>;
                        // 定制柜体：柜体类型（+名称）作为分组抬头，门板/柜体/抽屉缩进列在下面
                        if (ir.item.type === 'cabinet') {
                          const typeLabel = pickLang(cabTypeById(ir.item.cabType).label, lang);
                          const nm = pickLang(ir.item.name || ir.item.desc || '', lang);
                          const head = [typeLabel, nm].filter(Boolean).join(' · ');
                          const dims = cabDimsLabel(ir.item, lang === 'zh' ? 'zh' : 'en');
                          return [
                            <tr key={ir.item.id + '-h'} style={{ borderTop: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
                              <td className="py-1 px-2 font-medium" colSpan={4 + descSpan}>
                                {head}
                                <span className="font-normal ml-2" style={{ color: T.inkSoft }}>{dims}</span>
                              </td>
                            </tr>,
                            ...ir.lines.map((ln, i) => (
                              <tr key={ir.item.id + i}>
                                <td className="py-1 px-2 pl-6" colSpan={descSpan} style={{ color: T.inkSoft }}>{cabLineLabel(ln)}</td>
                                {qtyCell(ln)}
                                <td className="py-1 px-2">{lineUom(ln)}</td>
                                <td className="text-right py-1 px-2">{fmtNum(pxi(ln.unitMyr, ir), 0)}</td>
                                <td className="text-right py-1 px-2">{fmtNum(pxi(ln.total, ir), 0)}</td>
                              </tr>
                            )),
                          ];
                        }
                        // 其他类型（墙板/房门/灯带/其他）：单行，首行带名称前缀
                        return ir.lines.map((ln, i) => (
                          <tr key={ir.item.id + i} style={{ borderTop: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
                            <td className="py-1 px-2" colSpan={descSpan}>
                              {i === 0 && (() => {
                                const nm = pickLang(ir.item.name || '', lang); // 房门/其他/灯带的 desc 即描述，避免重复
                                return nm ? <span className="font-medium">{nm} · </span> : null;
                              })()}
                              {lineDesc(ln)}
                            </td>
                            {qtyCell(ln)}
                            <td className="py-1 px-2">{lineUom(ln)}</td>
                            <td className="text-right py-1 px-2">{fmtNum(pxi(ln.unitMyr, ir), 0)}</td>
                            <td className="text-right py-1 px-2">{fmtNum(pxi(ln.total, ir), 0)}</td>
                          </tr>
                        ));
                      })}
                      <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                        <td colSpan={3 + descSpan} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>{t(RLBL.subtotal)}</td>
                        <td className="text-right py-1 px-2 font-medium">{fmtNum(zoneShown(zr), 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                );
              })}

              <div className="mt-6 flex justify-end" style={{ breakInside: 'avoid' }}>
                <div className="w-72 text-sm">
                  {!anyDesigner && (
                    <>
                      <div className="flex justify-between py-1">
                        <span style={{ color: T.inkSoft }}>{t(RLBL.gross)}</span><span>{fmtMYR(computed.gross)}</span>
                      </div>
                      {computed.discount > 0 && (
                        <>
                          <div className="flex justify-between py-1" style={{ color: T.terra }}>
                            <span>{t(RLBL.discount)}{computed.discountMode === 'amt' ? '' : ` (${computed.adjustPct}%)`}{computed.excluded > 0 ? ` · ${t(RLBL.noDiscExcl)}` : ''}</span><span>− {fmtMYR(computed.discount)}</span>
                          </div>
                          {discountNote && <div className="text-[10px] italic -mt-0.5 pb-1" style={{ color: T.inkSoft }}>{discountNote}</div>}
                        </>
                      )}
                    </>
                  )}
                  {isDesignerNet ? (
                    <div className="flex justify-between py-2 mt-1 font-display text-xl" style={{ borderTop: `2px solid ${T.ink}`, color: T.wood }}>
                      <span>{t({ en: 'Designer Total', zh: '设计师总额' })}{exclTag && <span className="text-xs font-body" style={{ color: T.inkSoft }}>{exclTag}</span>}</span><span>{fmtMYR(cabSupply)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between py-2 mt-1 font-display text-xl" style={{ borderTop: `2px solid ${T.ink}` }}>
                        <span>{isDesigner ? t({ en: 'Retail Total', zh: '零售总额' }) : t(RLBL.total)}</span><span>{fmtMYR(cabRetail)}</span>
                      </div>
                      {isDesigner && (
                        <div className="flex justify-between py-1 font-medium" style={{ color: T.wood }}>
                          <span>{t({ en: 'Designer Supply', zh: '设计师供货价' })} ({discTag}){exclTag}</span><span>{fmtMYR(cabSupply)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <NoteBlock text={cabinetNote} />
              <Terms terms={QUOTE_TERMS} />
              {!hasSummary && <Signatures />}
            </div>
          )}

          {/* ===== Loose Furniture RICCIONE FURNITURE（另起一页）===== */}
          {hasLoose && (
            <div className="p-8 text-[#2D3E36]" style={{ fontSize: 13, breakBefore: hasCab ? 'page' : 'auto' }}>
              <Head brand="RICCIONE FURNITURE" logo="/brand/riccione-furniture-logo.png" logoH={44} />
              <CustomerRow />

              <div>
                <div className="px-2 py-1 font-medium text-xs uppercase tracking-wide" style={{ background: T.sand }}>
                  {t(RLBL.looseSection)}
                </div>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide" style={{ color: T.inkSoft }}>
                      <th className="text-left font-normal py-1 px-2" style={{ width: 110 }}>{t(RLBL.photo)}</th>
                      <th className="text-left font-normal py-1 px-2" style={{ width: '24%' }}>{t(RLBL.productType)}</th>
                      <th className="text-left font-normal py-1 px-2">{t(RLBL.model)}</th>
                      <th className="text-left font-normal py-1 px-2" style={{ width: 72 }}>{t(RLBL.color)}</th>
                      <th className={th}>{t(RLBL.qty)}</th>
                      <th className={th}>{t(RLBL.unitPrice)}</th>
                      <th className={th}>{t(RLBL.amount)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {looseRows.map((r) => (
                      <tr key={r.id} style={{ borderTop: `1px solid ${T.lineSoft}`, breakInside: 'avoid' }}>
                        <td className="py-1 px-2">
                          {r.image ? <img src={r.image} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 2, border: `1px solid ${T.lineSoft}` }} /> : null}
                        </td>
                        <td className="py-1 px-2">{r.type || '—'}</td>
                        <td className="py-1 px-2">{r.model || '—'}</td>
                        <td className="py-1 px-2">{capColor(r.color) || '—'}</td>
                        <td className="text-right py-1 px-2">{fmtNum(Number(r.qty) || 0, 0)}</td>
                        <td className="text-right py-1 px-2">{fmtNum(px(r.unitMyr), 0)}</td>
                        <td className="text-right py-1 px-2">{fmtNum(px(r.total), 0)}</td>
                      </tr>
                    ))}
                    {!anyDesigner && (
                      <>
                        <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                          <td colSpan={6} className="text-right py-1 px-2 text-xs" style={{ color: T.inkSoft }}>{t(RLBL.gross)}</td>
                          <td className="text-right py-1 px-2">{fmtNum(loose.gross, 0)}</td>
                        </tr>
                        {loose.discount > 0 && (
                          <tr style={{ color: T.terra }}>
                            <td colSpan={6} className="text-right py-1 px-2 text-xs">{t(RLBL.discount)}{loose.discountMode === 'amt' ? '' : ` (${loose.adjustPct}%)`}{looseDiscountNote ? <span className="italic"> — {looseDiscountNote}</span> : null}</td>
                            <td className="text-right py-1 px-2">− {fmtNum(loose.discount, 0)}</td>
                          </tr>
                        )}
                      </>
                    )}
                    {isDesignerNet ? (
                      <tr style={{ borderTop: `1.5px solid ${T.line}`, color: T.wood }}>
                        <td colSpan={6} className="text-right py-1 px-2 font-medium">{t({ en: 'Designer Total', zh: '设计师总额' })}</td>
                        <td className="text-right py-1 px-2 font-medium">{fmtNum(supply(looseRetailV), 0)}</td>
                      </tr>
                    ) : (
                      <>
                        <tr style={{ borderTop: `1.5px solid ${T.line}` }}>
                          <td colSpan={6} className="text-right py-1 px-2 font-medium">{isDesigner ? t({ en: 'Retail Total', zh: '零售总额' }) : t(RLBL.total)}</td>
                          <td className="text-right py-1 px-2 font-medium">{fmtNum(looseRetailV, 0)}</td>
                        </tr>
                        {isDesigner && (
                          <tr style={{ color: T.wood }}>
                            <td colSpan={6} className="text-right py-1 px-2 font-medium">{t({ en: 'Designer Supply', zh: '设计师供货价' })} ({discTag})</td>
                            <td className="text-right py-1 px-2 font-medium">{fmtNum(supply(looseRetailV), 0)}</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              <NoteBlock text={looseNote} />
              {/* Loose Furniture 只放 Validity 条款 */}
              <Terms terms={LOOSE_TERMS} />
              {!hasSummary && <Signatures />}
            </div>
          )}

          {!hasCab && !hasLoose && (
            <div className="p-8 text-center text-sm" style={{ color: T.inkSoft }}>No items 暂无明细</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
