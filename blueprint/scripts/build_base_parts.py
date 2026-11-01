"""一次性工具：从定稿 PPT 抽出 master / layout / theme 等「骨架」XML → src/engine/pptx/baseParts.js。
主题字体改成品牌字体（C「安然」：标题 Ogg + 思源宋体 CN SemiBold；正文 Outfit + HarmonyOS Sans SC Medium），
设计师在 PowerPoint 里新加的文字框默认就是品牌字体；正文颜色 = 464646。
（只改主题字体 / 颜色时不用原 PPT：直接改 src/engine/pptx/baseParts.js 里 THEME 的 fontScheme 和 dk1，和这里保持一致。）"""
import json, re, sys
src, root = sys.argv[1], sys.argv[2]
rd = lambda p: re.sub(r'>\s+<', '><', open(f'{src}/{p}', encoding='utf8').read().strip())
theme = rd('ppt/theme/theme1.xml')
FONT_SCHEME = ('<a:fontScheme name="Blueprint"><a:majorFont><a:latin typeface="Ogg"/><a:ea typeface="思源宋体 CN SemiBold"/><a:cs typeface=""/></a:majorFont>'
               '<a:minorFont><a:latin typeface="Outfit"/><a:ea typeface="HarmonyOS Sans SC Medium"/><a:cs typeface=""/></a:minorFont></a:fontScheme>')
TEXT_DK1 = '464646'
fs = FONT_SCHEME
theme = re.sub(r'<a:fontScheme.*?</a:fontScheme>', fs, theme, flags=re.S).replace('name="Office Theme"', 'name="Blueprint"', 1)
theme = re.sub(r'<a:dk1>.*?</a:dk1>', f'<a:dk1><a:srgbClr val="{TEXT_DK1}"/></a:dk1>', theme, count=1, flags=re.S)
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
