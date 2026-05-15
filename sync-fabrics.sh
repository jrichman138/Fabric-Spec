#!/usr/bin/env bash
# Mirrors fabrics.md into index.html, generates per-fabric SEO pages, and writes sitemap.xml.
# Run after editing fabrics.md. fabrics.md remains the canonical source.

set -euo pipefail
cd "$(dirname "$0")"

[[ -f fabrics.md ]] || { echo "fabrics.md not found"; exit 1; }
[[ -f index.html ]] || { echo "index.html not found"; exit 1; }

python3 - <<'PY'
import re, pathlib, html, datetime, shutil

SITE_URL = 'https://fabricspec.com'

# ── Slug (must match slugify() in app.js) ─────────────────────────────────────

def slugify(name):
    s = re.sub(r'[\s/]+', '-', name.lower())
    s = re.sub(r'[^a-z0-9-]', '', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

# ── Parse fabrics.md (mirrors parseFabrics in app.js) ─────────────────────────

def parse_fabrics(md):
    fabrics, current, group, section = [], None, '', None
    for raw in md.split('\n'):
        line = raw.rstrip()
        if line.startswith('## '):
            group = line[3:].strip(); continue
        if line.startswith('### '):
            if current: fabrics.append(current)
            current = {'name': line[4:].strip(), 'group': group, 'tags': [], 'machine': '',
                       'needle': {'primary': '', 'alternative': ''}, 'thread': [],
                       'settings': {}, 'tips': [], 'detail': ''}
            section = None; continue
        if not current: continue
        m = re.match(r'^\*\*Tags:\*\*\s*(.+)', line)
        if m: current['tags'] = re.findall(r'`([^`]+)`', m.group(1)); continue
        m = re.match(r'^\*\*Machine:\*\*\s*(.+)', line)
        if m: current['machine'] = m.group(1).strip(); continue
        m = re.match(r'^\*\*(Needle|Thread|Machine Settings|Quick Tips|Detail)\*\*$', line)
        if m: section = m.group(1); continue
        if not section: continue
        b = re.match(r'^- (.+)', line)
        if section == 'Needle' and b:
            v = b.group(1)
            if re.match(r'^Primary:', v, re.I):
                current['needle']['primary'] = re.sub(r'^Primary:\s*', '', v, flags=re.I)
            elif re.match(r'^Alternative:', v, re.I):
                current['needle']['alternative'] = re.sub(r'^Alternative:\s*', '', v, flags=re.I)
        elif section == 'Thread' and b:
            current['thread'].append(b.group(1))
        elif section == 'Machine Settings' and b:
            parts = b.group(1).split(':')
            if len(parts) >= 2:
                current['settings'][parts[0].strip()] = ':'.join(parts[1:]).strip()
        elif section == 'Quick Tips' and b:
            current['tips'].append(b.group(1))
        elif section == 'Detail':
            t = line.strip()
            if t and t != '---':
                current['detail'] += (' ' if current['detail'] else '') + t
    if current: fabrics.append(current)
    return fabrics

# ── Render the fabric detail HTML (mirrors renderDetail in app.js) ────────────

def esc(s):
    return html.escape(str(s), quote=True)

def render_detail(f):
    rows = ''.join(f'<tr><td>{esc(k)}</td><td>{esc(v)}</td></tr>' for k, v in f['settings'].items())
    tags = ''.join(f'<span class="tag">{esc(t)}</span>' for t in f['tags'])
    thread = ''.join(f'<li>{esc(t)}</li>' for t in f['thread'])
    tips = ''.join(f'<li>{esc(t)}</li>' for t in f['tips'])
    machine = f'<span class="section-machine">{esc(f["machine"])}</span>' if f['machine'] else ''
    detail_block = ''
    if f['detail']:
        detail_block = f'''
    <div class="section">
      <h2 class="section-title">Detail</h2>
      <p class="detail-text">{esc(f['detail'])}</p>
    </div>'''
    return f'''
    <div class="fabric-header">
      <div class="fabric-group">{esc(f['group'])}</div>
      <div class="fabric-name">{esc(f['name'])}</div>
      <div class="tags">{tags}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Needle</h2>
      <div class="kv-list">
        <div class="kv-row"><span class="kv-key">Primary</span><span class="kv-val">{esc(f['needle']['primary'])}</span></div>
        <div class="kv-row"><span class="kv-key">Alternative</span><span class="kv-val">{esc(f['needle']['alternative'])}</span></div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Thread</h2>
      <ul class="thread-list">{thread}</ul>
    </div>

    <div class="section">
      <div class="section-title-row">
        <h2 class="section-title">Machine Settings</h2>
        {machine}
      </div>
      <table class="settings-table"><tbody>{rows}</tbody></table>
    </div>

    <div class="section">
      <h2 class="section-title">Quick Tips</h2>
      <ul class="tips-list">{tips}</ul>
    </div>{detail_block}
  '''

def og_description(f):
    needle = f['needle']['primary'] or 'standard'
    thread = f['thread'][0] if f['thread'] else 'standard polyester'
    return (f"Sewing {f['name']} on the Singer Heavy Duty 4452. "
            f"Needle: {needle}. Thread: {thread}.")

# ── Read source files ─────────────────────────────────────────────────────────

md = pathlib.Path('fabrics.md').read_text()
html_src = pathlib.Path('index.html').read_text()
fabrics = parse_fabrics(md)

# ── 1. Mirror fabrics.md into the inline <script> block in index.html ─────────

start = '<script type="text/markdown" id="fabrics-data">'
end_after_start = '</script>'
i = html_src.find(start)
if i < 0: raise SystemExit('Could not find #fabrics-data block in index.html')
j = html_src.find(end_after_start, i)
if j < 0: raise SystemExit('Unclosed #fabrics-data block')

html_src = html_src[:i + len(start)] + '\n' + md.rstrip() + '\n  ' + html_src[j:]
pathlib.Path('index.html').write_text(html_src)
print(f'Synced fabrics.md → index.html  ({len(fabrics)} fabrics)')

# ── 2. Generate /fabric/<slug>/index.html for each fabric ─────────────────────

# Clean out the existing fabric/ tree so removed fabrics don't linger.
fabric_root = pathlib.Path('fabric')
if fabric_root.exists():
    shutil.rmtree(fabric_root)
fabric_root.mkdir()

placeholder_block = '''<div id="placeholder">
            <div id="placeholder-logo">Fabric<br>Spec</div>
          </div>
          <div id="fabric-detail" hidden></div>'''

for f in fabrics:
    slug = slugify(f['name'])
    page_url = f'{SITE_URL}/fabric/{slug}/'
    title = f"{f['name']} · Fabric Spec"
    desc = og_description(f)
    pre_rendered = render_detail(f)

    page = html_src

    # Title.
    page = page.replace('<title>Fabric Spec</title>', f'<title>{esc(title)}</title>', 1)

    # Canonical.
    page = page.replace(
        '<link rel="canonical" href="https://fabricspec.com/">',
        f'<link rel="canonical" href="{page_url}">', 1
    )

    # OG / Twitter — replace title, description, url for this fabric.
    page = page.replace(
        '<meta property="og:title" content="Fabric Spec">',
        f'<meta property="og:title" content="{esc(title)}">', 1
    )
    page = page.replace(
        '<meta property="og:description" content="Sewing reference for the Singer Heavy Duty 4452. Needle sizes, thread weights, and machine settings for Cordura, X-Pac, duck canvas, silnylon, fleece, and more.">',
        f'<meta property="og:description" content="{esc(desc)}">', 1
    )
    page = page.replace(
        '<meta property="og:url" content="https://fabricspec.com/">',
        f'<meta property="og:url" content="{page_url}">', 1
    )
    page = page.replace(
        '<meta name="twitter:title" content="Fabric Spec">',
        f'<meta name="twitter:title" content="{esc(title)}">', 1
    )
    page = page.replace(
        '<meta name="twitter:description" content="Sewing reference for the Singer Heavy Duty 4452. Needle sizes, thread weights, and machine settings for Cordura, X-Pac, duck canvas, silnylon, fleece, and more.">',
        f'<meta name="twitter:description" content="{esc(desc)}">', 1
    )

    # Initial fabric marker (the app reads this on load to pre-select).
    page = page.replace(
        '<link rel="canonical"',
        f'<meta name="initial-fabric" content="{slug}">\n  <link rel="canonical"', 1
    )

    # Rewrite relative asset paths to absolute so they resolve from /fabric/<slug>/.
    page = re.sub(r'href="(images|fonts)/', r'href="/\1/', page)
    page = re.sub(r'content="(images)/', r'content="/\1/', page)
    page = page.replace('href="manifest.json"', 'href="/manifest.json"')
    page = page.replace('href="style.css?', 'href="/style.css?')
    page = page.replace('src="app.js?', 'src="/app.js?')

    # Pre-render the fabric detail into the body, hide the placeholder, show the detail.
    pre_html = (
        f'<div id="placeholder" hidden>\n'
        f'            <div id="placeholder-logo">Fabric<br>Spec</div>\n'
        f'          </div>\n'
        f'          <div id="fabric-detail">{pre_rendered}</div>'
    )
    page = page.replace(placeholder_block, pre_html, 1)

    out_dir = fabric_root / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'index.html').write_text(page)

print(f'Generated {len(fabrics)} per-fabric pages in fabric/')

# ── 3. Generate sitemap.xml ───────────────────────────────────────────────────

today = datetime.date.today().isoformat()
urls = [f'  <url><loc>{SITE_URL}/</loc><lastmod>{today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>']
for f in fabrics:
    urls.append(
        f'  <url><loc>{SITE_URL}/fabric/{slugify(f["name"])}/</loc>'
        f'<lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>'
    )

sitemap = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '\n'.join(urls) + '\n'
    '</urlset>\n'
)
pathlib.Path('sitemap.xml').write_text(sitemap)
print(f'Wrote sitemap.xml  ({len(urls)} URLs)')
PY
