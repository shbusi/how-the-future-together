import { imagine, coverageGrid, SCENE_KEYS, TONES, NOW_YEAR, matches } from './engine.js';
import { validateContribution, formatError, interpolate } from './validate.js';
import { createScene } from './scene.js';

// ---------- 작은 도구 ----------
const $ = sel => document.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  return node;
}
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 못 해도 괜찮다 */ } },
};
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ---------- 번역 ----------
// 문장은 locales/<언어>.json에 있다. 빠진 문장은 영어, 그다음 한국어로 대신 보인다.
const i18n = { lang: 'ko', locales: {}, languages: [] };
const tRaw = key => {
  for (const l of [i18n.lang, 'en', 'ko']) {
    const s = i18n.locales[l]?.[key];
    if (s !== undefined) return s;
  }
  return key;
};
const t = (key, params) => interpolate(tRaw(key), params);
/** **굵게** 표시만 허용하는 안전한 서식. innerHTML을 쓰지 않는다. */
const rich = str => str.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('strong', {}, part) : part));
const langMeta = code => i18n.languages.find(l => l.code === code);
const langName = code => langMeta(code)?.name ?? code;
const localizers = [];
/** 언어가 바뀔 때마다 다시 실행할 번역 작업을 등록하고 한 번 실행한다. */
const L = fn => { localizers.push(fn); fn(); };

function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach(el => el.replaceChildren(...rich(t(el.dataset.i18n))));
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  localizers.forEach(fn => fn());
}

function loadFonts(meta) {
  if (!meta?.fonts) return;
  const href = `https://fonts.googleapis.com/css2?family=${meta.fonts}&display=swap`;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === href)) return;
  document.head.append(h('link', { rel: 'stylesheet', href }));
}

/** 미래 조각의 제목·이야기를 지금 언어로. 번역이 없으면 원문을 돌려주고 missing 표시. */
function textOf(f, field) {
  const map = f[field] || {};
  if (map[i18n.lang]) return { text: map[i18n.lang], lang: i18n.lang, missing: false };
  const l = map[f.lang] ? f.lang : Object.keys(map)[0];
  return { text: map[l] ?? '', lang: l, missing: true };
}

function pickLanguage(codes) {
  const q = new URLSearchParams(location.search).get('lang');
  if (codes.includes(q)) return q;
  const saved = store.get('htft:lang');
  if (codes.includes(saved)) return saved;
  for (const n of navigator.languages || [navigator.language || '']) {
    const base = n.toLowerCase().split('-')[0];
    if (codes.includes(base)) return base;
  }
  return 'en';
}

// ---------- 시작 ----------
async function boot() {
  let bundle;
  try {
    const res = await fetch('data/futures.json');
    if (!res.ok) throw new Error(res.status);
    bundle = await res.json();
  } catch {
    $('#headline').textContent = '미래 조각을 불러오지 못했어요. · Couldn’t load the future pieces.';
    $('#picture').textContent = 'npm run dev → data/futures.json';
    return;
  }

  i18n.locales = bundle.locales;
  i18n.languages = bundle.languages;
  const codes = bundle.languages.map(l => l.code);
  i18n.lang = pickLanguage(codes);

  const { site, conditions, year: yearCfg, presets, tags } = bundle;
  const model = { year: yearCfg, conditions, futures: bundle.futures };
  const config = { conditions, year: yearCfg, languages: codes, tags };
  const repoUrl = `https://github.com/${site.repo}`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = createScene($('#scene'), { reducedMotion });
  const condLabel = id => (id === 'year' ? t('f.year') : t(`cond.${id}.label`));

  // ----- 조건 상태 (?lang=..&year=..&climate=.. 로 공유 가능) -----
  const state = { year: yearCfg.default };
  for (const c of conditions) state[c.id] = c.default;
  const query = new URLSearchParams(location.search);
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (query.has('year')) state.year = clampTo(Math.round(Number(query.get('year')) / yearCfg.step) * yearCfg.step || yearCfg.default, yearCfg.min, yearCfg.max);
  for (const c of conditions) if (query.has(c.id)) state[c.id] = clampTo(Number(query.get(c.id)) || 0, 0, 100);

  // ----- 언어 고르기 -----
  const langSelect = $('#lang');
  langSelect.replaceChildren(...bundle.languages.map(l => h('option', { value: l.code, lang: l.html }, l.name)));
  langSelect.addEventListener('change', () => setLanguage(langSelect.value));
  $('#repo-link').href = repoUrl;
  L(() => $('.brand-en').setAttribute('lang', i18n.lang === 'ko' ? 'en' : 'ko'));

  const stamp = new Date(bundle.generatedAt);
  L(() => {
    const date = new Intl.DateTimeFormat(langMeta(i18n.lang).html, { dateStyle: 'medium' }).format(stamp);
    $('#stat').textContent = t('intro.stat', { pieces: model.futures.length, people: bundle.contributors.length, langs: codes.length, date });
  });

  // ----- 계기판 -----
  const yearInput = $('#c-year');
  Object.assign(yearInput, { min: yearCfg.min, max: yearCfg.max, step: yearCfg.step, value: state.year });
  const setFill = input => input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  yearInput.addEventListener('input', () => { state.year = Number(yearInput.value); render(); });

  const sliders = {};
  for (const c of conditions) {
    const input = h('input', { type: 'range', id: `c-${c.id}`, min: '0', max: '100', step: '5', value: String(state[c.id]) });
    const out = h('output', { for: `c-${c.id}` }, String(state[c.id]));
    input.addEventListener('input', () => { state[c.id] = Number(input.value); render(); });
    sliders[c.id] = { input, out };
    $('#sliders').append(h('div', { class: 'slider' },
      h('div', { class: 'slider-top' }, h('label', { for: `c-${c.id}`, 'data-i18n': `cond.${c.id}.label` }), out),
      input,
      h('div', { class: 'slider-ends', 'aria-hidden': 'true' }, h('span', { 'data-i18n': `cond.${c.id}.low` }), h('span', { 'data-i18n': `cond.${c.id}.high` })),
    ));
  }
  function syncControls() {
    yearInput.value = state.year;
    $('#year-out').textContent = state.year;
    setFill(yearInput);
    for (const c of conditions) {
      sliders[c.id].input.value = state[c.id];
      sliders[c.id].out.textContent = state[c.id];
      setFill(sliders[c.id].input);
    }
  }

  const presetButtons = presets.map(p => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-i18n': `preset.${p.id}`, onclick: () => { Object.assign(state, p.values); render(); } });
    $('#presets').append(b);
    return { b, p };
  });

  let toastTimer = 0;
  const toast = msg => {
    $('#toast').textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 2800);
  };
  $('#reroll').addEventListener('click', () => scene.reroll());
  $('#save').addEventListener('click', () => {
    const a = h('a', { href: scene.toDataURL(), download: `future-${state.year}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    toast(t('toast.saved'));
  });
  $('#share').addEventListener('click', async () => toast(t((await copy(shareUrl())) ? 'toast.copied' : 'toast.copyFail')));
  function shareQuery() {
    const q = new URLSearchParams({ lang: i18n.lang, year: state.year });
    for (const c of conditions) q.set(c.id, state[c.id]);
    return q;
  }
  const shareUrl = () => `${location.origin}${location.pathname}?${shareQuery()}`;

  // ----- 조각 카드와 연표 -----
  const who = a => (a === 'seed' ? t('who.seed') : `@${a}`);
  const editUrl = f => `${repoUrl}/edit/${site.branch}/futures/${f.file}`;
  const issueUrl = params => `${repoUrl}/issues/new?${new URLSearchParams(params)}`;

  function card(f) {
    const title = textOf(f, 'title');
    const story = textOf(f, 'story');
    const years = f.when?.year ? `${f.when.year[0]}–${f.when.year[1]}` : t('card.anytime');
    const tagLine = (f.tags || []).map(id => `#${t(`tag.${id}`)}`).join(' ');
    const html = langMeta(title.lang)?.html;
    const acts = f.draft ? h('span', { class: 'badge' }, t('card.preview')) : h('span', { class: 'acts' },
      title.missing && h('a', { href: editUrl(f), target: '_blank', rel: 'noopener', class: 'strong' }, t('card.translate')),
      h('a', { href: issueUrl({ template: 'opinion.yml', title: t('opinion.title', { title: title.text }), piece: `${title.text} (${f.id}, futures/${f.file})` }), target: '_blank', rel: 'noopener' }, t('card.opinion')),
      !title.missing && h('a', { href: editUrl(f), target: '_blank', rel: 'noopener' }, t('card.edit')),
    );
    return h('li', { class: `card${f.draft ? ' draft' : ''}` },
      h('div', { class: 'card-top' },
        h('span', { class: `tone tone-${f.tone}` }, t(`tone.${f.tone}`)),
        title.missing && h('span', { class: 'orig' }, t('card.original', { lang: langName(title.lang) })),
        h('span', { class: 'years' }, years)),
      h('h3', { lang: html }, title.text),
      h('p', { lang: langMeta(story.lang)?.html }, story.text),
      h('div', { class: 'card-foot' }, h('span', { class: 'who' }, who(f.author)), tagLine && h('span', { class: 'tags' }, tagLine), acts),
    );
  }

  function renderPieces(result) {
    $('#now').replaceChildren(...result.now.map(card));
    $('#pieces-note').textContent = result.now.length ? t('pieces.note', { n: result.now.length, ...result.tones }) : '';
    $('#gap').hidden = result.now.length >= 2;
    $('#gap-lead').textContent = t(result.now.length === 0 ? 'gap.empty' : 'gap.one');
  }

  function renderPath(result) {
    const items = result.path.map(f => {
      const past = f.when?.year && f.when.year[1] < state.year;
      const title = textOf(f, 'title');
      return h('li', { class: f.active ? 'active' : past ? 'past' : '' },
        h('span', { class: 'ty' }, f.start <= NOW_YEAR ? t('road.now') : String(f.start)),
        h('span', { class: 'tl', 'aria-hidden': 'true' }),
        h('div', { class: 'tb' }, h('b', { lang: langMeta(title.lang)?.html }, title.text), ' ', h('span', {}, `· ${past ? t('road.ended', { year: f.when.year[1] }) : who(f.author)}`)),
      );
    });
    items.push(h('li', { class: 'active' },
      h('span', { class: 'ty' }, String(state.year)),
      h('span', { class: 'tl', 'aria-hidden': 'true' }),
      h('div', { class: 'end' }, t('road.here')),
    ));
    $('#path').replaceChildren(...items);
  }

  // ----- 상상의 지도 -----
  const ax = $('#atlas-x');
  const ay = $('#atlas-y');
  for (const c of conditions) {
    ax.append(h('option', { value: c.id, 'data-i18n': `cond.${c.id}.label` }));
    ay.append(h('option', { value: c.id, 'data-i18n': `cond.${c.id}.label` }));
  }
  ax.value = 'climate';
  ay.value = 'tech';
  const fixAxes = changed => {
    if (ax.value === ay.value) (changed === ax ? ay : ax).value = conditions.find(c => c.id !== changed.value).id;
    renderAtlas();
  };
  ax.addEventListener('change', () => fixAxes(ax));
  ay.addEventListener('change', () => fixAxes(ay));

  function renderAtlas() {
    const xk = ax.value;
    const yk = ay.value;
    const cells = coverageGrid(model.futures, xk, yk, state, 5);
    const max = Math.max(1, ...cells.map(c => c.count));
    const hx = Math.min(4, Math.floor(state[xk] / 20));
    const hy = Math.min(4, Math.floor(state[yk] / 20));
    $('#atlas').replaceChildren(...cells.map(c => {
      const here = Math.floor(c.x / 20) === hx && Math.floor(c.y / 20) === hy;
      const d = c.count / max;
      const b = h('button', {
        type: 'button',
        class: `cell${c.count ? '' : ' empty'}${d > 0.55 ? ' hi' : ''}${here ? ' here' : ''}`,
        'aria-label': `${t('atlas.cell', { xl: condLabel(xk), x: c.x, yl: condLabel(yk), y: c.y, n: c.count })}${here ? ` ${t('atlas.here')}` : ''}`,
        onclick: () => {
          state[xk] = c.x;
          state[yk] = c.y;
          render();
          $('#imagine').scrollIntoView({ block: 'start' });
        },
      }, c.count ? String(c.count) : '?');
      b.style.setProperty('--d', d.toFixed(2));
      return b;
    }));
    $('#atlas-xlabel').textContent = `${condLabel(xk)} →`;
    $('#atlas-ylabel').textContent = `${condLabel(yk)} →`;
  }

  // ----- 함께 그린 사람들, 번역 현황 -----
  L(() => {
    $('#people-note').textContent = t('people.note', { people: bundle.contributors.length, pieces: model.futures.length });
    $('#contributors').replaceChildren(
      ...bundle.contributors.map(c => h('li', {},
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, c.author === 'seed' ? '∗' : c.author[0].toUpperCase()),
        c.author === 'seed'
          ? h('span', { class: 'name' }, t('people.seed'))
          : h('a', { class: 'name', href: `https://github.com/${c.author}`, target: '_blank', rel: 'noopener' }, `@${c.author}`),
        h('span', { class: 'n' }, t('people.count', { n: c.count })),
      )),
      h('li', { class: 'you' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, '+'), h('a', { class: 'name', href: '#write' }, t('people.you'))),
    );
    const total = model.futures.length;
    $('#lang-bars').replaceChildren(...bundle.languages.map(l => {
      const done = model.futures.filter(f => f.title[l.code] && f.story[l.code]).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return h('li', { class: l.code === i18n.lang ? 'current' : '' },
        h('span', { class: 'ln', lang: l.html }, l.name),
        h('span', { class: 'bar', role: 'meter', 'aria-label': l.name, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) }, h('i', { style: `width:${pct}%` })),
        h('span', { class: 'lv' }, `${done}/${total}`),
      );
    }));
    $('#langs-help').href = `${repoUrl}/blob/${site.branch}/${i18n.lang === 'ko' ? 'CONTRIBUTING.md#번역하기' : 'CONTRIBUTING.en.md#translating'}`;
  });

  // ----- 미래 조각 쓰기 -----
  const writer = setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, tags, codes, condLabel, onChange: () => render() });

  // ----- 전체 그리기 -----
  function render() {
    syncControls();
    for (const { b, p } of presetButtons) b.setAttribute('aria-pressed', String(Object.entries(p.values).every(([k, v]) => state[k] === v)));
    writer.follow(state);
    const draft = writer.previewFuture();
    const result = imagine(draft ? { ...model, futures: [...model.futures, draft] } : model, state);
    scene.update(result.scene, state.year);
    const headline = t('headline.format', { year: state.year, place: t(`headline.${result.headline}`) });
    const sentences = result.sentences.map(id => t(`picture.${id}`)).join(' ');
    $('#headline').textContent = headline;
    $('#picture').textContent = sentences;
    $('#scene').setAttribute('aria-label', `${headline}. ${sentences}`);
    $('#metrics').replaceChildren(...result.metrics.map(m => h('div', { class: 'metric' },
      h('div', { class: 'metric-top' }, h('span', {}, t(`metric.${m.id}`)), h('b', {}, String(m.value))),
      h('div', { class: 'bar', role: 'meter', 'aria-label': t(`metric.${m.id}`), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(m.value) }, h('i', { style: `width:${m.value}%` })),
    )));
    renderPieces(result);
    renderPath(result);
    renderAtlas();
    writer.refresh();
    try { history.replaceState(null, '', `?${shareQuery()}${location.hash}`); } catch { /* 주소를 못 바꾸는 환경 */ }
  }

  function setLanguage(code) {
    i18n.lang = code;
    store.set('htft:lang', code);
    const meta = langMeta(code);
    document.documentElement.lang = meta.html;
    loadFonts(meta);
    document.title = t('meta.title');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
    langSelect.value = code;
    applyStatic();
    render();
  }

  setLanguage(i18n.lang);
}

// ---------- 미래 조각 쓰기 폼 ----------
function setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, tags, codes, condLabel, onChange }) {
  const saved = store.get('htft:draft') || {};
  const autoId = saved.autoId || `future-${Math.random().toString(36).slice(2, 7)}`;
  const rows = {};
  let followConditions = !saved.when;

  // 쓰는 언어
  const langSel = $('#f-lang');
  langSel.replaceChildren(...i18n.languages.map(l => h('option', { value: l.code }, l.name)));
  langSel.value = codes.includes(saved.lang) ? saved.lang : i18n.lang;

  // 조건 범위
  const dims = [{ id: 'year', lo: NOW_YEAR, hi: yearCfg.max }, ...conditions.map(c => ({ id: c.id, lo: 0, hi: 100 }))];
  for (const d of dims) {
    const use = h('input', { type: 'checkbox', id: `f-use-${d.id}` });
    const min = h('input', { type: 'number', id: `f-min-${d.id}`, min: String(d.lo), max: String(d.hi), step: '5' });
    const max = h('input', { type: 'number', id: `f-max-${d.id}`, min: String(d.lo), max: String(d.hi), step: '5' });
    const name = h('span', { 'data-i18n': d.id === 'year' ? 'f.year' : `cond.${d.id}.label` });
    const row = h('div', { class: 'when-row' }, h('label', { class: 'check', for: `f-use-${d.id}` }, use, name), min, h('span', { class: 'dash' }, '~'), max);
    L(() => {
      min.setAttribute('aria-label', t('f.min', { label: condLabel(d.id) }));
      max.setAttribute('aria-label', t('f.max', { label: condLabel(d.id) }));
    });
    for (const input of [use, min, max]) input.addEventListener('input', () => { followConditions = false; changed(); });
    rows[d.id] = { use, min, max, row };
    $('#f-when').append(row);
  }

  // 태그 (정해진 목록에서 5개까지)
  const chosen = new Set((saved.tags || []).filter(id => tags.includes(id)));
  const tagButtons = tags.map(id => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(chosen.has(id)), 'data-i18n': `tag.${id}` });
    b.addEventListener('click', () => {
      if (chosen.has(id)) chosen.delete(id);
      else if (chosen.size < 5) chosen.add(id);
      for (const [tid, btn] of tagButtons) btn.setAttribute('aria-pressed', String(chosen.has(tid)));
      changed();
    });
    $('#f-tags').append(b);
    return [id, b];
  });

  // 번역
  const trs = {};
  for (const l of i18n.languages) {
    const title = h('input', { id: `f-tr-title-${l.code}`, lang: l.html, maxlength: '40' });
    const story = h('textarea', { id: `f-tr-story-${l.code}`, lang: l.html, rows: '2', maxlength: '400' });
    const tl = h('label', { for: `f-tr-title-${l.code}` });
    const sl = h('label', { for: `f-tr-story-${l.code}` });
    L(() => { tl.textContent = t('f.trTitle', { lang: l.name }); sl.textContent = t('f.trStory', { lang: l.name }); });
    const row = h('div', { class: 'tr-row' }, h('div', { class: 'field' }, tl, title), h('div', { class: 'field' }, sl, story));
    title.value = saved.translations?.[l.code]?.title || '';
    story.value = saved.translations?.[l.code]?.story || '';
    title.addEventListener('input', changed);
    story.addEventListener('input', changed);
    trs[l.code] = { title, story, row };
    $('#f-tr').append(row);
  }
  if (Object.values(saved.translations || {}).some(v => v.title || v.story)) $('#f-tr-box').open = true;
  const syncTrRows = () => {
    for (const [code, r] of Object.entries(trs)) r.row.hidden = code === langSel.value;
    const html = i18n.languages.find(l => l.code === langSel.value)?.html;
    $('#f-title').lang = html;
    $('#f-story').lang = html;
  };
  langSel.addEventListener('change', () => { syncTrRows(); changed(); });
  syncTrRows();

  // 그림 변화
  const fx = {};
  for (const key of SCENE_KEYS) {
    const input = h('input', { type: 'range', id: `f-scene-${key}`, min: '-50', max: '50', step: '5', value: String(Math.round((saved.scene?.[key] || 0) * 100)) });
    const out = h('output', { for: `f-scene-${key}` }, '0');
    input.addEventListener('input', changed);
    fx[key] = { input, out };
    $('#f-scene').append(h('div', { class: 'fx-row' }, h('label', { for: `f-scene-${key}`, 'data-i18n': `fx.${key}` }), input, out));
  }

  for (const k of ['author', 'id', 'title', 'story', 'sources']) {
    const input = $(`#f-${k}`);
    if (saved[k]) input.value = saved[k];
    input.addEventListener('input', changed);
  }
  if (TONES.includes(saved.tone)) $(`#f-tone-${saved.tone}`).checked = true;
  document.querySelectorAll('input[name="tone"]').forEach(r => r.addEventListener('change', changed));
  if (saved.when) {
    for (const [id, r] of Object.entries(rows)) {
      const v = saved.when[id];
      r.use.checked = Boolean(v);
      if (v) { r.min.value = v[0]; r.max.value = v[1]; }
    }
  }
  $('#f-preview').addEventListener('change', onChange);

  function fillFrom(s) {
    for (const [id, r] of Object.entries(rows)) {
      const v = s[id];
      if (id === 'year') {
        r.use.checked = true;
        r.min.value = Math.max(NOW_YEAR, v - 10);
        r.max.value = yearCfg.max;
      } else {
        r.use.checked = v < 35 || v > 65; // 가운데 값은 '상관없음'으로 둔다
        r.min.value = Math.max(0, v - 20);
        r.max.value = Math.min(100, v + 20);
      }
    }
  }
  if (followConditions) fillFrom(state);
  $('#f-fill').addEventListener('click', () => { fillFrom(state); followConditions = true; changed(); });
  $('#gap-cta').addEventListener('click', () => { fillFrom(state); followConditions = true; changed(); setTimeout(() => $('#f-title').focus(), 300); });

  function readContribution() {
    const val = k => $(`#f-${k}`).value.trim();
    const wl = langSel.value;
    const title = { [wl]: val('title') };
    const story = { [wl]: val('story') };
    for (const [code, r] of Object.entries(trs)) {
      if (code === wl) continue;
      const tt = r.title.value.trim();
      const ss = r.story.value.trim();
      if (tt || ss) { title[code] = tt; story[code] = ss; }
    }
    const when = {};
    for (const [id, r] of Object.entries(rows)) {
      r.row.classList.toggle('off', !r.use.checked);
      if (r.use.checked) when[id] = [Number(r.min.value), Number(r.max.value)];
    }
    const scene = {};
    for (const [k, { input, out }] of Object.entries(fx)) {
      const v = Number(input.value) / 100;
      out.textContent = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
      if (v !== 0) scene[k] = v;
    }
    const sources = val('sources').split('\n').map(s => s.trim()).filter(Boolean);
    const future = {
      id: val('id') || autoId,
      title,
      story,
      when,
      tone: document.querySelector('input[name="tone"]:checked')?.value || 'mixed',
    };
    if (chosen.size) future.tags = tags.filter(id => chosen.has(id));
    if (Object.keys(scene).length) future.scene = scene;
    if (sources.length) future.sources = sources;
    return { author: val('author'), lang: wl, futures: [future] };
  }

  function changed() {
    const c = readContribution();
    const f = c.futures[0];
    const translations = {};
    for (const [code, r] of Object.entries(trs)) if (r.title.value || r.story.value) translations[code] = { title: r.title.value, story: r.story.value };
    store.set('htft:draft', {
      autoId, author: c.author, id: $('#f-id').value.trim(), lang: c.lang, title: $('#f-title').value, story: $('#f-story').value,
      translations, tags: f.tags, sources: $('#f-sources').value, tone: f.tone, when: followConditions ? null : f.when, scene: f.scene,
    });
    onChange();
  }

  $('#copy-json').addEventListener('click', async () => {
    const btn = $('#copy-json');
    if (await copy($('#f-json').textContent)) {
      btn.textContent = t('send.copied');
      setTimeout(() => { btn.textContent = t('send.copy'); }, 2000);
    } else {
      const range = document.createRange();
      range.selectNodeContents($('#f-json'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });

  return {
    follow(s) {
      if (followConditions) fillFrom(s);
    },
    previewFuture() {
      if (!$('#f-preview').checked) return null;
      const c = readContribution();
      const f = c.futures[0];
      if (!f.title[c.lang] || f.story[c.lang].length < 5 || !Object.keys(f.when).length) return null;
      return { ...f, lang: c.lang, author: c.author || '…', draft: true, file: null };
    },
    refresh() {
      const c = readContribution();
      const f = c.futures[0];
      const wl = c.lang;
      $('#f-story-count').textContent = `${f.story[wl].length} / 400`;
      const pristine = !c.author && !f.title[wl] && !f.story[wl];
      const errors = validateContribution(c, config).map(e => formatError(e, tRaw, { withAt: false }));
      if (model.futures.some(x => x.id === f.id)) errors.push(t('status.idTaken', { id: f.id }));
      const status = pristine
        ? [h('div', { class: 'info' }, t('status.pristine'))]
        : errors.length
          ? errors.map(e => h('div', { class: 'no' }, `✖ ${e}`))
          : [h('div', { class: 'ok' }, `✔ ${t('status.ok')}`)];
      if (Object.keys(f.when).length) status.push(h('div', { class: 'info' }, t(matches(f, state) ? 'status.matches' : 'status.noMatch')));
      $('#f-status').replaceChildren(...status);

      const json = `${JSON.stringify(c, null, 2)}\n`;
      $('#f-json').textContent = json;
      const pr = $('#send-pr');
      if (errors.length || pristine) {
        pr.setAttribute('aria-disabled', 'true');
        pr.href = '#write';
      } else {
        pr.removeAttribute('aria-disabled');
        pr.href = `${repoUrl}/new/${site.branch}?${new URLSearchParams({ filename: `futures/${c.author}-${f.id}.json`, value: json })}`;
      }
      const issue = $('#send-issue');
      const usable = f.title[wl] || f.story[wl];
      issue.setAttribute('aria-disabled', String(!usable));
      issue.href = usable
        ? `${repoUrl}/issues/new?${new URLSearchParams({ template: 'future-idea.yml', title: t('send.issueTitle', { title: f.title[wl] || t('send.untitled') }), story: f.story[wl], future_json: json })}`
        : '#write';
    },
  };
}

boot();
