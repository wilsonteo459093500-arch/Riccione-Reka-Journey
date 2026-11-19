#!/usr/bin/env python3
"""DEKU 句库 → 审核网页（每句「要 / 不要」，复制结果贴回给 Claude）。

  python3 tools/make_deku_review.py deku/lines.json /tmp/deku-review.html
然后用 Claude 的 Artifact 发布（之前的网址：https://claude.ai/artifact/4DcXNNxeknMGqygntM4W6V）。
"""
import json, html, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
groups = [
 ("joke", "笑话", "原创，DEKU 讲给你听。好笑、不冒犯人才勾。"),
 ("inamori", "稻盛和夫", "中文照常见中文版的译法；请对你手上那一版的书。"),
 ("kuok", "郭鹤年", "只找到二手报道，把握最低；建议对过《郭鹤年自传》再勾。"),
 ("musk", "Elon Musk", "中文是翻译，DEKU 会先念中文再念英文原句。英文原句才是他说的话。"),
]
def esc(s): return html.escape(s, quote=True)
sections = []
for kind, name, note in groups:
    items = [l for l in d['lines'] if l['kind'] == kind]
    rows = []
    for l in items:
        meta = []
        if l.get('flavor'): meta.append(f'<span class="tag">{esc(l["flavor"])}</span>')
        if l.get('source'): meta.append(f'<span class="src">出处：{esc(l["source"])}</span>')
        if l.get('confidence'):
            c = l['confidence']; lvl = 'hi' if c.startswith('高') else 'mid' if c.startswith('中') else 'lo'
            meta.append(f'<span class="conf {lvl}">把握：{esc(c)}</span>')
        en = f'<p class="en" lang="en">{esc(l["en"])}</p>' if l.get('en') else ''
        rows.append(f'''<li class="item" data-id="{l["id"]}">
  <div class="body"><p class="zh"><span class="id">{l["id"]}</span>{esc(l["zh"])}</p>{en}<div class="meta">{"".join(meta)}</div></div>
  <div class="pick" role="group" aria-label="{l["id"]} 审核">
    <button type="button" class="yes" data-v="ok" aria-pressed="false">要</button>
    <button type="button" class="no" data-v="no" aria-pressed="false">不要</button>
  </div>
</li>''')
    sections.append(f'''<section id="{kind}"><header class="sec"><h2>{name}<span class="count" data-kind="{kind}"></span></h2><p>{note}</p></header>
<ol class="list">{"".join(rows)}</ol></section>''')

page = f'''<title>DEKU 句库审核</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600&display=swap">
<style>
/* 一栏清单：每句一行，右边「要 / 不要」；底部固定一条进度 + 复制结果 */
:root {{
  --bg: #f6f3ee; --panel: #fffdf9; --fg: #241f1a; --muted: #6f655a; --line: #e2dbd0;
  --brass: #9a7436; --ok: #2f7a4b; --no: #b0453c; --okbg: #e3f1e7; --nobg: #f6e2df;
  --display: "Noto Serif SC", "Songti SC", serif;
  --text: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #16120f; --panel: #1f1a16; --fg: #f1ebe2; --muted: #b3a797; --line: #342c25;
  --brass: #c8a46b; --ok: #6fc28d; --no: #e5837a; --okbg: #1d3426; --nobg: #3a201d; color-scheme: dark }} }}
:root[data-theme="dark"] {{
  --bg: #16120f; --panel: #1f1a16; --fg: #f1ebe2; --muted: #b3a797; --line: #342c25;
  --brass: #c8a46b; --ok: #6fc28d; --no: #e5837a; --okbg: #1d3426; --nobg: #3a201d; color-scheme: dark }}
body {{ background: var(--bg); color: var(--fg); font-family: var(--text); font-size: 15px; line-height: 1.6; }}
.wrap {{ max-width: 720px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 140px; }}
h1 {{ font-family: var(--display); font-size: 28px; margin: 0 0 6px; text-wrap: balance; }}
.lead {{ color: var(--muted); margin: 0 0 8px; max-width: 60ch; }}
nav {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }}
nav a {{ color: var(--brass); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 4px 12px; font-size: 14px; }}
nav a:focus-visible, button:focus-visible {{ outline: 2px solid var(--brass); outline-offset: 2px; }}
section {{ margin-top: 28px; }}
.sec h2 {{ font-family: var(--display); font-size: 21px; margin: 0; display: flex; align-items: baseline; gap: 10px; }}
.sec p {{ margin: 2px 0 10px; color: var(--muted); font-size: 14px; }}
.count {{ font-family: var(--text); font-size: 13px; color: var(--muted); font-weight: 400; font-variant-numeric: tabular-nums; }}
.list {{ list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }}
.item {{ display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line); }}
.item.ok {{ background: linear-gradient(90deg, var(--okbg), transparent 70%); }}
.item.no {{ background: linear-gradient(90deg, var(--nobg), transparent 70%); }}
.item.no .zh {{ color: var(--muted); text-decoration: line-through; text-decoration-thickness: 1px; }}
.body {{ flex: 1; min-width: 0; padding-left: 6px; }}
.zh {{ margin: 0; font-size: 16px; }}
.id {{ font: 600 12px/1 ui-monospace, Menlo, monospace; color: var(--brass); margin-right: 8px; letter-spacing: .04em; }}
.en {{ margin: 4px 0 0; color: var(--muted); font-style: italic; font-size: 14px; }}
.meta {{ display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 12.5px; color: var(--muted); }}
.tag {{ border: 1px solid var(--line); border-radius: 4px; padding: 0 6px; }}
.conf.lo {{ color: var(--no); }} .conf.hi {{ color: var(--ok); }}
.pick {{ display: flex; flex-direction: column; gap: 6px; flex: none; }}
.pick button {{ font: inherit; font-size: 14px; min-width: 64px; min-height: 36px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); cursor: pointer; }}
.pick .yes[aria-pressed="true"] {{ background: var(--ok); border-color: var(--ok); color: var(--panel); }}
.pick .no[aria-pressed="true"] {{ background: var(--no); border-color: var(--no); color: var(--panel); }}
.bar {{ position: fixed; left: 0; right: 0; bottom: 0; background: var(--panel); border-top: 1px solid var(--line);
  padding: 10px max(16px, env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }}
.bar .in {{ max-width: 720px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; }}
.progress {{ font-variant-numeric: tabular-nums; font-size: 14px; }}
.actions {{ display: flex; gap: 8px; flex-wrap: wrap; }}
.actions button {{ font: inherit; font-size: 14px; border-radius: 8px; padding: 8px 14px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); cursor: pointer; }}
.actions .primary {{ background: var(--brass); border-color: var(--brass); color: var(--panel); font-weight: 600; }}
#out {{ width: 100%; margin-top: 8px; font: 13px/1.5 ui-monospace, Menlo, monospace; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }}
#msg {{ font-size: 13px; color: var(--ok); width: 100%; }}
@media (prefers-reduced-motion: no-preference) {{ .item {{ transition: background .2s; }} }}
</style>
<div class="wrap">
  <h1>DEKU 句库审核</h1>
  <p class="lead">每一句选「要」或「不要」。只有选了「要」的会放进 FoloToy 和手机。全部选完，按下面的「复制结果」，贴回给 Claude。</p>
  <p class="lead">名人的话：没把握或对不上书的，请选「不要」。DEKU 不能说他们没说过的话。</p>
  <nav>{"".join(f'<a href="#{k}">{n}</a>' for k, n, _ in groups)}</nav>
  {"".join(sections)}
</div>
<div class="bar"><div class="in">
  <span class="progress" id="progress"></span>
  <div class="actions">
    <button type="button" id="allJokes">笑话全部「要」</button>
    <button type="button" class="primary" id="copy">复制结果</button>
  </div>
  <span id="msg" hidden></span>
  <textarea id="out" rows="3" readonly hidden aria-label="审核结果"></textarea>
</div></div>
<script>
(function () {{
  const KEY = 'deku-review-v1';
  let state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || '{{}}') || {{}}; }} catch (e) {{ state = {{}}; }}
  const items = Array.from(document.querySelectorAll('.item'));
  function save() {{ try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}} }}
  function paint() {{
    let done = 0;
    items.forEach(li => {{
      const v = state[li.dataset.id];
      li.classList.toggle('ok', v === 'ok'); li.classList.toggle('no', v === 'no');
      li.querySelector('.yes').setAttribute('aria-pressed', v === 'ok');
      li.querySelector('.no').setAttribute('aria-pressed', v === 'no');
      if (v) done++;
    }});
    document.getElementById('progress').textContent = '已审 ' + done + ' / ' + items.length;
    document.querySelectorAll('.count').forEach(c => {{
      const mine = items.filter(li => li.closest('section').id === c.dataset.kind);
      const ok = mine.filter(li => state[li.dataset.id] === 'ok').length;
      c.textContent = ok + ' 句要 · 共 ' + mine.length;
    }});
  }}
  items.forEach(li => li.querySelectorAll('.pick button').forEach(b => b.addEventListener('click', () => {{
    const id = li.dataset.id, v = b.dataset.v;
    state[id] = state[id] === v ? undefined : v; save(); paint();
  }})));
  document.getElementById('allJokes').addEventListener('click', () => {{
    items.filter(li => li.closest('section').id === 'joke').forEach(li => {{ if (!state[li.dataset.id]) state[li.dataset.id] = 'ok'; }});
    save(); paint();
  }});
  document.getElementById('copy').addEventListener('click', () => {{
    const ok = items.filter(li => state[li.dataset.id] === 'ok').map(li => li.dataset.id);
    const no = items.filter(li => state[li.dataset.id] === 'no').map(li => li.dataset.id);
    const left = items.filter(li => !state[li.dataset.id]).map(li => li.dataset.id);
    const text = 'DEKU 审核\\n要：' + (ok.join(' ') || '（没有）') + '\\n不要：' + (no.join(' ') || '（没有）') + (left.length ? '\\n还没审：' + left.join(' ') : '');
    const out = document.getElementById('out'), msg = document.getElementById('msg');
    out.value = text; out.hidden = false; msg.hidden = false;
    const done = () => {{ msg.textContent = '已复制，贴回给 Claude 就好'; }};
    const fail = () => {{ out.select(); msg.textContent = '没办法自动复制：下面的字已经选好，长按复制'; }};
    try {{ navigator.clipboard.writeText(text).then(done, fail); }} catch (e) {{ fail(); }}
  }});
  paint();
}})();
</script>
'''
open(out, 'w', encoding='utf-8').write(page)
print(out)
