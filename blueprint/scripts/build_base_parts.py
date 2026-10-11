"""一次性工具：从定稿 PPT 抽出 master / layout / theme 等「骨架」XML → src/engine/pptx/baseParts.js。
主题字体改成品牌字体（Outfit + 思源宋体），设计师在 PowerPoint 里新加的文字框默认就是品牌字体。"""
import json, re, sys
src, root = sys.argv[1], sys.argv[2]
rd = lambda p: re.sub(r'>\s+<', '><', open(f'{src}/{p}', encoding='utf8').read().strip())
theme = rd('ppt/theme/theme1.xml')
fs = ('<a:fontScheme name="Blueprint"><a:majorFont><a:latin typeface="Ogg"/><a:ea typeface="Source Han Serif CN"/><a:cs typeface=""/></a:majorFont>'
      '<a:minorFont><a:latin typeface="Outfit"/><a:ea typeface="Source Han Serif CN"/><a:cs typeface=""/></a:minorFont></a:fontScheme>')
theme = re.sub(r'<a:fontScheme.*?</a:fontScheme>', fs, theme, flags=re.S).replace('name="Office Theme"', 'name="Blueprint"', 1)
pres = rd('ppt/presentation.xml')
dts = re.search(r'<p:defaultTextStyle>.*?</p:defaultTextStyle>', pres, re.S).group(0)
parts = {
    'SLIDE_MASTER': rd('ppt/slideMasters/slideMaster1.xml'),
    'SLIDE_MASTER_RELS': rd('ppt/slideMasters/_rels/slideMaster1.xml.rels'),
    'SLIDE_LAYOUT': rd('ppt/slideLayouts/slideLayout1.xml'),
    'SLIDE_LAYOUT_RELS': rd('ppt/slideLayouts/_rels/slideLayout1.xml.rels'),
    'THEME': theme,
    'DEFAULT_TEXT_STYLE': dts,
    'PRES_PROPS': rd('ppt/presProps.xml'),
    'VIEW_PROPS': rd('ppt/viewProps.xml'),
    'TABLE_STYLES': rd('ppt/tableStyles.xml'),
}
js = '// 自动生成（scripts/build_base_parts.py）—— PPT 骨架 XML，取自定稿 Dreamhouse Blueprint PPT。请勿手改。\n\n'
for k, v in parts.items():
    js += f'export const {k} = {json.dumps(v, ensure_ascii=False)};\n\n'
open(f'{root}/src/engine/pptx/baseParts.js', 'w', encoding='utf8').write(js)
print({k: len(v) for k, v in parts.items()})
