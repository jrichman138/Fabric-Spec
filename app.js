// Parses fabrics.md and drives the UI. No framework, no build step.

'use strict';

const MARKDOWN_PATH = 'fabrics.md';

// ── HTML escaping ─────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Slug helpers ──────────────────────────────────────────────────────────────
// Must match the Python implementation in sync-fabrics.sh.

function slugify(name) {
  return String(name).toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseFabrics(md) {
  const fabrics = [];
  let currentGroup = '';
  let currentFabric = null;
  let section = null;

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();

    if (/^## /.test(line)) {
      currentGroup = line.slice(3).trim();
      continue;
    }

    if (/^### /.test(line)) {
      if (currentFabric) fabrics.push(currentFabric);
      currentFabric = {
        name:     line.slice(4).trim(),
        group:    currentGroup,
        tags:     [],
        machine:  '',
        needle:   { primary: '', alternative: '' },
        thread:   [],
        settings: {},
        tips:     [],
        detail:   '',
      };
      section = null;
      continue;
    }

    if (!currentFabric) continue;

    const tagsMatch = line.match(/^\*\*Tags:\*\*\s*(.+)/);
    if (tagsMatch) {
      currentFabric.tags = [...tagsMatch[1].matchAll(/`([^`]+)`/g)].map(m => m[1]);
      continue;
    }

    const machineMatch = line.match(/^\*\*Machine:\*\*\s*(.+)/);
    if (machineMatch) { currentFabric.machine = machineMatch[1].trim(); continue; }

    const sectionMatch = line.match(/^\*\*(Needle|Thread|Machine Settings|Quick Tips|Detail)\*\*$/);
    if (sectionMatch) { section = sectionMatch[1]; continue; }

    if (!section) continue;

    const bullet = line.match(/^- (.+)/);

    if (section === 'Needle' && bullet) {
      const v = bullet[1];
      if (/^Primary:/i.test(v))          currentFabric.needle.primary     = v.replace(/^Primary:\s*/i, '');
      else if (/^Alternative:/i.test(v)) currentFabric.needle.alternative = v.replace(/^Alternative:\s*/i, '');
    } else if (section === 'Thread' && bullet) {
      currentFabric.thread.push(bullet[1]);
    } else if (section === 'Machine Settings' && bullet) {
      const [key, ...rest] = bullet[1].split(':');
      if (key && rest.length) currentFabric.settings[key.trim()] = rest.join(':').trim();
    } else if (section === 'Quick Tips' && bullet) {
      currentFabric.tips.push(bullet[1]);
    } else if (section === 'Detail') {
      const t = line.trim();
      if (t && t !== '---') currentFabric.detail += (currentFabric.detail ? ' ' : '') + t;
    }
  }

  if (currentFabric) fabrics.push(currentFabric);
  return fabrics;
}

// ── State ─────────────────────────────────────────────────────────────────────

let allFabrics = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────

const detailViewEl  = document.getElementById('detail-view');
const detailPanelEl = document.getElementById('detail-panel');
const toolbarSelect = document.getElementById('toolbar-select');
const themeToggle   = document.getElementById('theme-toggle');
const detailEl      = document.getElementById('fabric-detail');
const placeholderEl = document.getElementById('placeholder');
const footerEl      = document.getElementById('detail-footer');
const footerCredit  = document.getElementById('footer-credit');
const contactLink   = document.getElementById('contact-link');
const fontSizeBtn   = document.getElementById('font-size-btn');
const fontSizePanel = document.getElementById('font-size-panel');
const fontSizeSlider = document.getElementById('font-size-slider');

// ── Dropdown population ───────────────────────────────────────────────────────

function buildOptions(selectEl) {
  selectEl.innerHTML = '';

  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Pick your fabric';
  selectEl.appendChild(blank);

  const groups = [...new Set(allFabrics.map(f => f.group))];

  for (const group of groups) {
    const og = document.createElement('optgroup');
    og.label = group;
    allFabrics.forEach((fabric, idx) => {
      if (fabric.group !== group) return;
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = fabric.name;
      og.appendChild(opt);
    });
    selectEl.appendChild(og);
  }
}

// ── Views ─────────────────────────────────────────────────────────────────────

function showPlaceholder() {
  toolbarSelect.value     = '';
  detailEl.hidden         = true;
  footerEl.hidden         = true;
  placeholderEl.hidden    = false;
  detailPanelEl.scrollTop = 0;
  detailViewEl.classList.add('is-empty');
  document.title = 'Fabric Spec';
}

function renderDetail(fabric) {
  placeholderEl.hidden = true;
  detailEl.hidden      = false;
  footerEl.hidden      = false;
  detailViewEl.classList.remove('is-empty');

  const settingRows = Object.entries(fabric.settings)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');

  detailEl.innerHTML = `
    <div class="fabric-header">
      <div class="fabric-group">${esc(fabric.group)}</div>
      <div class="fabric-name">${esc(fabric.name)}</div>
      <div class="tags">${fabric.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Needle</h2>
      <div class="kv-list">
        <div class="kv-row"><span class="kv-key">Primary</span><span class="kv-val">${esc(fabric.needle.primary)}</span></div>
        <div class="kv-row"><span class="kv-key">Alternative</span><span class="kv-val">${esc(fabric.needle.alternative)}</span></div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Thread</h2>
      <ul class="thread-list">${fabric.thread.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>

    <div class="section">
      <div class="section-title-row">
        <h2 class="section-title">Machine Settings</h2>
        ${fabric.machine ? `<span class="section-machine">${esc(fabric.machine)}</span>` : ''}
      </div>
      <table class="settings-table"><tbody>${settingRows}</tbody></table>
    </div>

    <div class="section">
      <h2 class="section-title">Quick Tips</h2>
      <ul class="tips-list">${fabric.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>

    ${fabric.detail ? `
    <div class="section">
      <h2 class="section-title">Detail</h2>
      <p class="detail-text">${esc(fabric.detail)}</p>
    </div>` : ''}
  `;

  detailPanelEl.scrollTop = 0;
  document.title = `${fabric.name} · Fabric Spec`;
}

// ── Routing ───────────────────────────────────────────────────────────────────
// Root URL `/` uses hash routing (e.g. `/#cordura-500d`).
// Per-fabric pages live at `/fabric/<slug>/` and pre-select via <meta name="initial-fabric">.
// On a per-fabric page, picking a different fabric does a full navigation.

function onFabricPage() {
  return location.pathname.startsWith('/fabric/');
}

function findFabricBySlug(slug) {
  return allFabrics.find(f => slugify(f.name) === slug);
}

function navigateToFabric(fabric) {
  const slug = slugify(fabric.name);
  if (onFabricPage()) {
    location.href = `/fabric/${slug}/`;
    return;
  }
  if (location.hash !== `#${slug}`) location.hash = slug;
  else renderDetail(fabric);
}

function applyRoute() {
  const slug = location.hash.slice(1);
  if (!slug) { showPlaceholder(); return; }
  const fabric = findFabricBySlug(slug);
  if (fabric) renderDetail(fabric);
  else showPlaceholder();
}

function selectFabric(fabric) {
  navigateToFabric(fabric);
  toolbarSelect.value = '';
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggle) {
    const ariaLabel = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    themeToggle.setAttribute('aria-label', ariaLabel);
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('theme', next);
}

// ── Footer setup ──────────────────────────────────────────────────────────────
footerCredit.textContent = `© ${new Date().getFullYear()} James Richman`;
contactLink.href = `mailto:${'jrichman138'}@${'gmail.com'}`;

(function initFontSize() {
  const saved = localStorage.getItem('font-size');
  if (saved) {
    fontSizeSlider.value = saved;
    document.documentElement.style.setProperty('--content-font-size', saved + 'px');
  }

  fontSizeBtn.addEventListener('click', e => {
    e.stopPropagation();
    const opening = fontSizePanel.hidden;
    fontSizePanel.hidden = !opening;
    fontSizeBtn.setAttribute('aria-expanded', opening);
  });

  document.addEventListener('click', () => {
    fontSizePanel.hidden = true;
    fontSizeBtn.setAttribute('aria-expanded', 'false');
  });

  fontSizeSlider.addEventListener('input', () => {
    document.documentElement.style.setProperty('--content-font-size', fontSizeSlider.value + 'px');
    localStorage.setItem('font-size', fontSizeSlider.value);
  });
}());

(function initTheme() {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = localStorage.getItem('theme') || (systemDark ? 'dark' : 'light');
  applyTheme(saved);
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
}());

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  let md;
  const inline = document.getElementById('fabrics-data');
  if (inline && inline.textContent.trim()) {
    md = inline.textContent;
  } else {
    try {
      const res = await fetch(MARKDOWN_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      md = await res.text();
    } catch (err) {
      console.warn('Could not load fabrics.md:', err.message);
      placeholderEl.innerHTML = `
        <div style="text-align:center;max-width:320px;padding:24px">
          <p style="margin-bottom:8px">Unable to load fabric data.</p>
        </div>`;
      return;
    }
  }

  allFabrics = parseFabrics(md);

  buildOptions(toolbarSelect);

  toolbarSelect.addEventListener('change', () => {
    const idx = parseInt(toolbarSelect.value, 10);
    if (!isNaN(idx) && allFabrics[idx]) selectFabric(allFabrics[idx]);
  });

  const initialMeta = document.querySelector('meta[name="initial-fabric"]');
  const initialSlug = (initialMeta && initialMeta.content) || location.hash.slice(1);
  if (initialSlug) {
    const fabric = findFabricBySlug(initialSlug);
    if (fabric) renderDetail(fabric);
  }

  window.addEventListener('hashchange', () => {
    if (onFabricPage()) return;
    applyRoute();
  });
}

init();

if ('serviceWorker' in navigator && !location.pathname.startsWith('/fabric/')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
