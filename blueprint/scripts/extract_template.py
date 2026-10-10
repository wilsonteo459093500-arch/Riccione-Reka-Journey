"""一次性工具：从已定稿的 Dreamhouse Blueprint PPT 抽出「公司固定页」→ src/engine/companyTemplate.js + public/template/*。

用法：python3 scripts/extract_template.py <定稿.pptx 解压目录> <blueprint 根目录>
以后公司介绍页改版：在 PowerPoint 里改好定稿 PPT → 解压 → 重跑本脚本即可（项目相关文字会自动换成 {{token}}）。
"""
import hashlib, json, os, shutil, sys
from xml.etree import ElementTree as ET

NS = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
EMU = 9525  # 1px @ 1920×1080
FONT_KEYS = {'Source Han Serif CN': 'serif', 'Ogg': 'display', 'Outfit': 'sans'}

# 定稿 PPT 页码 → 公司页 key（第 15–53 页是方案页，第 55 页团队页改由代码按项目生成）
SLIDES = {
    1: 'cover', 2: 'contents',
    3: 'brand-divider', 4: 'brand-philosophy', 5: 'brand-story', 6: 'brand-collections', 7: 'brand-awards', 8: 'brand-supply',
    9: 'company-divider', 10: 'company-about', 11: 'company-history', 12: 'company-showrooms', 13: 'company-certified',
    14: 'design-divider',
    54: 'service-divider', 56: 'service-process', 57: 'service-cycle', 58: 'service-aftersales', 59: 'closing',
}
TITLES = {
    'cover': '公司封面', 'contents': '目录', 'brand-divider': '品牌 · 章节页', 'brand-philosophy': '品牌理念',
    'brand-story': '品牌故事', 'brand-collections': '原创系列', 'brand-awards': '国际设计奖项', 'brand-supply': '全球供应链',
    'company-divider': '公司 · 章节页', 'company-about': '关于瑞吉欧', 'company-history': '发展历程',
    'company-showrooms': '展厅与服务地区', 'company-certified': '品质认证', 'design-divider': '方案 · 章节页（无 Material Board 时的封面）',
    'service-divider': '服务 · 章节页', 'service-process': '服务流程', 'service-cycle': '订单周期',
    'service-aftersales': '售后维保', 'closing': '封底 · 联系方式',
}
SECTIONS = {
    'cover': 'opening', 'contents': 'opening',
    'brand-divider': 'brand', 'brand-philosophy': 'brand', 'brand-story': 'brand', 'brand-collections': 'brand',
    'brand-awards': 'brand', 'brand-supply': 'brand',
    'company-divider': 'company', 'company-about': 'company', 'company-history': 'company',
    'company-showrooms': 'company', 'company-certified': 'company',
    'design-divider': 'design',
    'service-divider': 'service', 'service-process': 'service', 'service-cycle': 'service',
    'service-aftersales': 'service', 'closing': 'service',
}
# 项目相关文字 → token（整段 run 文本精确匹配）
TOKENS = {
    'Muar · Mr Lau': '{{clientLine}}',
    '2026 · 08': '{{dateLine}}',
    '全屋定制设计方案': '{{proposalTitle}}',
    'DESIGN · 一楼与二楼': 'DESIGN · {{floorsLine}}',
    'Muar · Mr Lau · 一楼与二楼': '{{clientLine}} · {{floorsLine}}',
}


def px(v):
    return round(int(v) / EMU, 1)


def color_of(fill):
    c = fill.find('a:srgbClr', NS) if fill is not None else None
    if c is None:
        return None, 1
    a = c.find('a:alpha', NS)
    return c.get('val'), (round(int(a.get('val')) / 100000, 3) if a is not None else 1)


def main(src, root):
    out_dir = os.path.join(root, 'public', 'template')
    os.makedirs(out_dir, exist_ok=True)
    seen = {}  # sha1 → published name
    slides = []
    for n, key in SLIDES.items():
        xml = ET.parse(f'{src}/ppt/slides/slide{n}.xml')
        rels = ET.parse(f'{src}/ppt/slides/_rels/slide{n}.xml.rels').getroot()
        relmap = {r.get('Id'): r.get('Target').split('/')[-1] for r in rels}
        bg = xml.find('.//p:bg//a:srgbClr', NS)
        els = []
        img_no = 0
        for el in xml.find('.//p:spTree', NS):
            tag = el.tag.split('}')[1]
            if tag not in ('pic', 'sp'):
                continue
            off = el.find('.//a:xfrm/a:off', NS)
            ext = el.find('.//a:xfrm/a:ext', NS)
            box = {'x': px(off.get('x')), 'y': px(off.get('y')), 'w': px(ext.get('cx')), 'h': px(ext.get('cy'))}
            if tag == 'pic':
                blip = el.find('.//a:blip', NS)
                media = relmap[blip.get('{%s}embed' % NS['r'])]
                data = open(f'{src}/ppt/media/{media}', 'rb').read()
                digest = hashlib.sha1(data).hexdigest()
                if digest not in seen:
                    img_no += 1
                    ext_ = os.path.splitext(media)[1].replace('jpeg', 'jpg')
                    name = f'{key}-{img_no}{ext_}'
                    with open(os.path.join(out_dir, name), 'wb') as f:
                        f.write(data)
                    seen[digest] = name
                d = {'t': 'img', **box, 'src': f'/template/{seen[digest]}'}
                sr = el.find('.//a:srcRect', NS)
                if sr is not None and any(int(sr.get(k, 0)) for k in 'ltrb'):
                    d['crop'] = {k: round(int(sr.get(k, 0)) / 100000, 5) for k in 'ltrb'}
                els.append(d)
                continue
            sp = el.find('p:spPr', NS)
            tx = el.find('p:txBody', NS)
            text = ''.join(t.text or '' for t in tx.iter('{%s}t' % NS['a'])) if tx is not None else ''
            if text.strip():
                body = tx.find('a:bodyPr', NS)
                paras = []
                tokenized = False
                for p in tx.findall('a:p', NS):
                    ppr = p.find('a:pPr', NS)
                    para = {'runs': []}
                    if ppr is not None and ppr.get('algn') and ppr.get('algn') != 'l':
                        para['align'] = ppr.get('algn')
                    ls = p.find('a:pPr/a:lnSpc/a:spcPct', NS)
                    if ls is not None:
                        para['lineSpacing'] = round(int(ls.get('val')) / 1000, 2)
                    for r in p.findall('a:r', NS):
                        rpr = r.find('a:rPr', NS)
                        t = r.find('a:t', NS).text or ''
                        if t in TOKENS:
                            t = TOKENS[t]
                            tokenized = True
                        col, alpha = color_of(rpr.find('a:solidFill', NS))
                        run = {'text': t, 'font': FONT_KEYS.get(rpr.find('a:latin', NS).get('typeface'), 'sans'),
                               'size': int(rpr.get('sz')) / 100, 'color': col}
                        if alpha != 1:
                            run['alpha'] = alpha
                        if rpr.get('spc'):
                            run['spacing'] = int(rpr.get('spc')) / 100
                        if rpr.get('b') == '1':
                            run['bold'] = True
                        para['runs'].append(run)
                    paras.append(para)
                d = {'t': 'text', **box, 'paras': paras}
                if body is not None and body.get('anchor') not in (None, 't'):
                    d['valign'] = body.get('anchor')
                if tokenized:
                    # token 替换后文字可能变长：放宽文本框（居中的左右对称放宽）
                    align = paras[0].get('align', 'l')
                    if align == 'ctr':
                        cx = d['x'] + d['w'] / 2
                        d['x'], d['w'] = round(cx - 820, 1), 1640
                    elif align == 'l':
                        d['w'] = max(d['w'], 1100)
                    d['tokens'] = True
                els.append(d)
            else:
                col, alpha = color_of(sp.find('a:solidFill', NS))
                d = {'t': 'rect', **box}
                if col:
                    d['fill'] = col
                    if alpha != 1:
                        d['alpha'] = alpha
                gf = sp.find('a:gradFill', NS)
                if gf is not None:
                    lin = gf.find('a:lin', NS)
                    d['grad'] = {
                        'angle': int(lin.get('ang')) / 60000 if lin is not None else 90,
                        'stops': [{'pos': int(gs.get('pos')) / 1000, 'color': color_of(gs)[0], 'alpha': color_of(gs)[1]}
                                  for gs in gf.findall('.//a:gs', NS)],
                    }
                if not col and gf is None:
                    continue  # 无填充的占位框
                els.append(d)
        slides.append({'key': key, 'title': TITLES[key], 'section': SECTIONS[key], 'bg': bg.get('val') if bg is not None else 'F5F0E6', 'els': els})

    js = (
        '// 自动生成 —— 请勿手改。来源：已定稿 Dreamhouse Blueprint PPT 的公司固定页。\n'
        '// 重新生成：python3 scripts/extract_template.py <定稿pptx解压目录> .\n'
        '// 坐标单位 px（画布 1920×1080），字号/字距单位 pt；{{token}} 由 engine/deck.js 按项目填充。\n\n'
        f'export const COMPANY_SLIDES = {json.dumps(slides, ensure_ascii=False, indent=1)};\n'
    )
    with open(os.path.join(root, 'src', 'engine', 'companyTemplate.js'), 'w', encoding='utf8') as f:
        f.write(js)
    print(f'{len(slides)} slides, {len(seen)} images →', out_dir)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
