import { imagine, coverageGrid, chronicle, regionFilter, isHistory, isPast, startYear, SCENE_KEYS, TONES, NOW_YEAR, HISTORY_WINDOW, matches } from './engine.js';
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
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

/** 조각의 제목·이야기를 지금 언어로. 번역이 없으면 원문을 돌려주고 missing 표시. */
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

const yearsLabel = f => {
  if (!f.when?.year) return null;
  const [a, b] = f.when.year;
  return a === b ? String(a) : `${a}–${b}`;
};
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

// ---------- 시작 ----------
async function boot() {
  let bundle;
  try {
    const res = await fetch('data/futures.json');
    if (!res.ok) throw new Error(res.status);
    bundle = await res.json();
  } catch {
    $('#headline').textContent = '조각을 불러오지 못했어요. · Couldn’t load the pieces.';
    $('#picture').textContent = 'npm run dev → data/futures.json';
    return;
  }

  i18n.locales = bundle.locales;
  i18n.languages = bundle.languages;
  const codes = bundle.languages.map(l => l.code);
  i18n.lang = pickLanguage(codes);

  const { site, conditions, year: yearCfg, presets, eras, domains, regions } = bundle;
  const model = { year: yearCfg, conditions, futures: bundle.futures };
  const config = { conditions, year: yearCfg, languages: codes, domains, regions };
  const repoUrl = `https://github.com/${site.repo}`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = createScene($('#scene'), { reducedMotion });
  const condLabel = id => (id === 'year' ? t('f.year') : t(`cond.${id}.label`));
  const regionName = id => (id === 'world' ? t('region.all') : t(`region.${id}`));
  const historyCount = model.futures.filter(isHistory).length;
  const editors = bundle.editors || {};
  const editorsOf = f => (f.file ? editors[f.file] || [] : []).filter(login => login !== f.author);

  // ----- 상태 (?lang=..&year=..&region=..&climate=.. 로 공유 가능) -----
  const state = { year: yearCfg.default, region: 'world' };
  for (const c of conditions) state[c.id] = c.default;
  const query = new URLSearchParams(location.search);
  if (query.has('year')) state.year = clampTo(Math.round(Number(query.get('year')) / yearCfg.step) * yearCfg.step || yearCfg.default, yearCfg.min, yearCfg.max);
  if (regions.some(r => r.id === query.get('region'))) state.region = query.get('region');
  for (const c of conditions) if (query.has(c.id)) state[c.id] = clampTo(Number(query.get(c.id)) || 0, 0, 100);
  const pool = () => model.futures.filter(regionFilter(regions, state.region));

  // ----- 언어 고르기 -----
  const langSelect = $('#lang');
  langSelect.replaceChildren(...bundle.languages.map(l => h('option', { value: l.code, lang: l.html }, l.name)));
  langSelect.addEventListener('change', () => setLanguage(langSelect.value));
  $('#repo-link').href = repoUrl;
  L(() => $('.brand-en').setAttribute('lang', i18n.lang === 'ko' ? 'en' : 'ko'));

  const stamp = new Date(bundle.generatedAt);
  L(() => {
    const date = new Intl.DateTimeFormat(langMeta(i18n.lang).html, { dateStyle: 'medium' }).format(stamp);
    $('#stat').textContent = t('intro.stat', {
      pieces: model.futures.length, history: historyCount, futures: model.futures.length - historyCount,
      people: bundle.contributors.length, langs: codes.length, date,
    });
  });

  // ----- 계기판 -----
  const yearInput = $('#c-year');
  Object.assign(yearInput, { min: yearCfg.min, max: yearCfg.max, step: yearCfg.step, value: state.year });
  const setFill = input => input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  yearInput.addEventListener('input', () => { state.year = Number(yearInput.value); render(); });
  const pos = y => `${((y - yearCfg.min) / (yearCfg.max - yearCfg.min)) * 100}%`;
  const nowTick = h('span', { class: 'tick now', style: `left:${pos(NOW_YEAR)}` });
  $('#year-ticks').replaceChildren(
    ...[yearCfg.min, 1950, 2000, 2050, yearCfg.max].map(y => h('span', { class: 'tick', style: `left:${pos(y)}` }, String(y))),
    nowTick,
  );
  document.querySelector('.year-control').style.setProperty('--now', pos(NOW_YEAR));
  L(() => { nowTick.textContent = t('year.now'); });

  const regionSelect = $('#c-region');
  const depth = id => { let d = 0; for (let r = regions.find(x => x.id === id); r?.parent; r = regions.find(x => x.id === r.parent)) d++; return d; };
  const regionOptions = regions.map(r => h('option', { value: r.id }));
  regionSelect.replaceChildren(...regionOptions);
  L(() => regionOptions.forEach((o, i) => { o.textContent = `${' '.repeat(Math.max(0, depth(regions[i].id) - 1))}${regionName(regions[i].id)}`; }));
  regionSelect.addEventListener('change', () => { state.region = regionSelect.value; render(); });

  const sliders = {};
  for (const c of conditions) {
    const input = h('input', { type: 'range', id: `c-${c.id}`, min: '0', max: '100', step: '5', value: String(state[c.id]) });
    const out = h('output', { for: `c-${c.id}` }, String(state[c.id]));
    input.addEventListener('input', () => { state[c.id] = Number(input.value); render(); });
    const wrap = h('div', { class: 'slider' },
      h('div', { class: 'slider-top' }, h('label', { for: `c-${c.id}`, 'data-i18n': `cond.${c.id}.label` }), out),
      input,
      h('div', { class: 'slider-ends', 'aria-hidden': 'true' }, h('span', { 'data-i18n': `cond.${c.id}.low` }), h('span', { 'data-i18n': `cond.${c.id}.high` })),
    );
    sliders[c.id] = { input, out, wrap };
    $('#sliders').append(wrap);
  }
  function syncControls() {
    const past = isPast(state.year);
    yearInput.value = state.year;
    $('#year-out').textContent = state.year;
    $('#era-badge').textContent = t(past ? 'year.past' : 'year.future');
    $('#era-badge').className = `era-badge ${past ? 'past' : 'future'}`;
    $('#past-note').hidden = !past;
    $('#sliders').classList.toggle('locked', past);
    setFill(yearInput);
    regionSelect.value = state.region;
    for (const c of conditions) {
      sliders[c.id].input.value = state[c.id];
      sliders[c.id].input.disabled = past;
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
    if (state.region !== 'world') q.set('region', state.region);
    for (const c of conditions) q.set(c.id, state[c.id]);
    return q;
  }
  const shareUrl = () => `${location.origin}${location.pathname}?${shareQuery()}`;

  // ----- 조각 카드 -----
  const who = a => (a === 'seed' ? t('who.seed') : `@${a}`);
  const editUrl = f => `${repoUrl}/edit/${site.branch}/futures/${f.file}`;
  const issueUrl = params => `${repoUrl}/issues/new?${new URLSearchParams(params)}`;

  const condSummary = f => {
    const parts = Object.entries(f.when || {}).filter(([k]) => k !== 'year').map(([k, [a, b]]) => `${condLabel(k)} ${a}–${b}`);
    return parts.length ? parts.join(' · ') : t('field.anyCond');
  };
  const person = login => h('a', { href: `https://github.com/${login}`, target: '_blank', rel: 'noopener' }, `@${login}`);

  function cardBody(f, { full = false, conds = false } = {}) {
    const title = textOf(f, 'title');
    const story = textOf(f, 'story');
    const domainLine = (f.domains || []).map(id => t(`domain.${id}`)).join(' · ');
    const acts = f.draft ? h('span', { class: 'badge' }, t('card.preview')) : h('span', { class: 'acts' },
      title.missing && h('a', { href: editUrl(f), target: '_blank', rel: 'noopener', class: 'strong' }, t('card.translate')),
      h('a', { href: issueUrl({ template: 'opinion.yml', title: t('opinion.title', { title: title.text }), piece: `${title.text} (${f.id}, futures/${f.file})` }), target: '_blank', rel: 'noopener' }, t('card.opinion')),
      !title.missing && h('a', { href: editUrl(f), target: '_blank', rel: 'noopener' }, t('card.edit')),
    );
    const sources = (f.sources || []).map(u => h('a', { href: u, target: '_blank', rel: 'noopener' }, host(u)));
    return [
      h('div', { class: 'card-top' },
        isHistory(f) ? h('span', { class: 'kind' }, t('card.history')) : null,
        h('span', { class: `tone tone-${f.tone}` }, t(`${isHistory(f) ? 'toneH' : 'tone'}.${f.tone}`)),
        f.region && f.region !== 'world' && h('span', { class: 'region' }, t(`region.${f.region}`)),
        title.missing && h('span', { class: 'orig' }, t('card.original', { lang: langName(title.lang) })),
        h('span', { class: 'years' }, yearsLabel(f) ?? t('card.anytime'))),
      h(full ? 'h2' : 'h3', { lang: langMeta(title.lang)?.html, id: full ? 'dlg-title' : null }, title.text),
      h('p', { lang: langMeta(story.lang)?.html }, story.text),
      conds && !isHistory(f) && h('p', { class: 'conds' },
        matches(f, state, { ignoreYear: true }) && h('span', { class: 'match' }, t('field.matchNow')), condSummary(f)),
      (full || conds) && editorsOf(f).length > 0 && h('p', { class: 'eds' }, `${t('field.editors')}: `, ...editorsOf(f).flatMap((l, i) => (i ? [', ', person(l)] : [person(l)]))),
      h('div', { class: 'card-foot' },
        h('span', { class: 'who' }, who(f.author)),
        domainLine && h('span', { class: 'tags' }, domainLine),
        sources.length > 0 && h('span', { class: 'src' }, `${t('card.sources')}: `, ...sources.flatMap((a, i) => (i ? [', ', a] : [a]))),
        acts),
    ];
  }
  const card = f => h('li', { class: `card${f.draft ? ' draft' : ''}${isHistory(f) ? ' history' : ''}` }, ...cardBody(f));

  const dialog = $('#piece-dialog');
  function openPiece(f) {
    $('#dlg-body').replaceChildren(h('article', { class: `card${isHistory(f) ? ' history' : ''}` }, ...cardBody(f, { full: true })));
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  function renderPieces(result) {
    const past = result.past;
    $('#pieces-title').textContent = t(past ? 'pieces.titlePast' : 'pieces.title');
    $('#now').replaceChildren(...result.now.map(card));
    const n = result.now.length;
    $('#pieces-note').textContent = !n ? '' : past
      ? t('pieces.notePast', { n, from: state.year - HISTORY_WINDOW, to: Math.min(NOW_YEAR, state.year + HISTORY_WINDOW) })
      : t('pieces.note', { n, ...result.tones });
    $('#gap').hidden = n >= 2;
    $('#gap-lead').textContent = t(past ? (n === 0 ? 'gap.emptyPast' : 'gap.onePast') : (n === 0 ? 'gap.empty' : 'gap.one'));
    $('#gap-body').textContent = t(past ? 'gap.bodyPast' : 'gap.body');
  }

  function renderPath(result) {
    $('#road-desc').textContent = t(result.past ? 'road.descPast' : 'road.desc');
    const items = result.path.map(f => {
      const ended = !isHistory(f) && f.when?.year && f.when.year[1] < state.year;
      const title = textOf(f, 'title');
      return h('li', { class: f.active ? 'active' : ended || isHistory(f) ? 'past' : '' },
        h('span', { class: 'ty' }, !isHistory(f) && f.start <= NOW_YEAR ? t('road.now') : String(f.start)),
        h('span', { class: 'tl', 'aria-hidden': 'true' }),
        h('div', { class: 'tb' },
          h('button', { type: 'button', class: 'linkish', lang: langMeta(title.lang)?.html, onclick: () => openPiece(f) }, title.text), ' ',
          h('span', {}, `· ${ended ? t('road.ended', { year: f.when.year[1] }) : (f.domains || []).slice(0, 1).map(d => t(`domain.${d}`)).join('')}`)),
      );
    });
    items.push(h('li', { class: 'active' },
      h('span', { class: 'ty' }, String(state.year)),
      h('span', { class: 'tl', 'aria-hidden': 'true' }),
      h('div', { class: 'end' }, t('road.here')),
    ));
    $('#path').replaceChildren(...items);
  }

  // ----- 분야별 연대기 -----
  const firstFuture = eras.findIndex(([a]) => a > NOW_YEAR);
  function renderChronicle(pieces) {
    $('#chron-desc').replaceChildren(...rich(t('chron.desc', { n: domains.length })));
    const rows = chronicle(pieces, state, eras, domains);
    const here = eras.findIndex(([a, b]) => state.year >= a && state.year <= b);
    const eraLabel = ([a, b]) => `${a}–${b}`;
    const head1 = h('tr', {},
      h('th', { class: 'corner', scope: 'col', rowspan: '2' }, t('chron.field')),
      h('th', { class: 'band-past', colspan: String(firstFuture), scope: 'colgroup' }, t('chron.past')),
      h('th', { class: 'band-future', colspan: String(eras.length - firstFuture), scope: 'colgroup' }, t('chron.future')));
    const head2 = h('tr', {}, ...eras.map(([a, b], i) => h('th', { scope: 'col', class: `${i === here ? 'here' : ''}${i === firstFuture ? ' split' : ''}` },
      h('button', {
        type: 'button', class: 'era-btn', 'aria-label': t('chron.era', { from: a, to: b }),
        onclick: () => {
          const target = i < firstFuture ? Math.min(b, NOW_YEAR - 1) : Math.round((a + b) / 2);
          state.year = clampTo(Math.round(target / yearCfg.step) * yearCfg.step, yearCfg.min, yearCfg.max);
          if (i < firstFuture && state.year >= NOW_YEAR) state.year -= yearCfg.step;
          render();
          $('#imagine').scrollIntoView({ block: 'start' });
        },
      }, eraLabel([a, b])))));
    const body = rows.map(r => h('tr', {},
      h('th', { scope: 'row' }, h('a', { class: 'dname', href: `#field-${r.domain}` }, t(`domain.${r.domain}`)), h('span', { class: 'dcount' }, String(r.cells.reduce((n, c) => n + c.length, 0)))),
      ...r.cells.map((cell, i) => h('td', { class: `${i === here ? 'here' : ''}${i === firstFuture ? ' split' : ''}${i >= firstFuture ? ' fut' : ''}` },
        cell.length
          ? h('ul', {}, ...cell.map(f => {
            const title = textOf(f, 'title');
            return h('li', {}, h('button', { type: 'button', class: `piece tone-${f.tone}`, lang: langMeta(title.lang)?.html, onclick: () => openPiece(f) },
              h('span', { class: 'py' }, String(startYear(f))), ' ', title.text));
          }))
          : h('button', {
            type: 'button', class: 'add', 'aria-label': t('chron.add', { domain: t(`domain.${r.domain}`), era: eraLabel(eras[i]) }),
            onclick: () => {
              writer.prefill({ type: i < firstFuture ? 'history' : 'future', from: eras[i][0], to: eras[i][1], domain: r.domain });
              $('#write').scrollIntoView({ block: 'start' });
            },
          }, '+'),
      )),
    ));
    $('#chron').replaceChildren(h('thead', {}, head1, head2), h('tbody', {}, ...body));
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
    renderAtlas(pool());
  };
  ax.addEventListener('change', () => fixAxes(ax));
  ay.addEventListener('change', () => fixAxes(ay));

  function renderAtlas(pieces) {
    const xk = ax.value;
    const yk = ay.value;
    const cells = coverageGrid(pieces, xk, yk, state, 5);
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
          if (isPast(state.year)) state.year = yearCfg.default;
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
        h('span', { class: 'n' }, [c.count ? t('people.count', { n: c.count }) : '', c.edited ? t('people.edited', { n: c.edited }) : ''].filter(Boolean).join(' · ')),
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

  // ----- 조각 쓰기 -----
  const writer = setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, domains, regions, codes, condLabel, regionName, onChange: () => render() });

  // ----- 전체 그리기 -----
  function render() {
    syncControls();
    for (const { b, p } of presetButtons) b.setAttribute('aria-pressed', String(Object.entries(p.values).every(([k, v]) => state[k] === v)));
    writer.follow(state);
    const draft = writer.previewPiece();
    const pieces = draft ? [...pool(), draft] : pool();
    const result = imagine({ ...model, futures: pieces }, state);
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
    renderChronicle(pieces);
    renderAtlas(pieces);
    if (currentField) renderField(currentField, pieces);
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
    mountedTerm = null; // 토론방도 새 언어로
    render();
  }

  // ----- 분야 페이지 (#field-<분야>) -----
  let currentField = null;
  let mountedTerm = null;
  const fieldTerm = id => `field: ${id}`;
  const fieldSwitch = domains.map(id => h('a', { href: `#field-${id}`, class: 'chip', 'data-i18n': `domain.${id}` }));
  $('#fv-switch').replaceChildren(...fieldSwitch);
  $('#fv-write').addEventListener('click', () => {
    writer.prefill({ type: isPast(state.year) ? 'history' : 'future', from: isPast(state.year) ? state.year - HISTORY_WINDOW : NOW_YEAR, to: isPast(state.year) ? Math.min(NOW_YEAR, state.year + HISTORY_WINDOW) : yearCfg.max, domain: currentField });
    location.hash = 'write';
  });

  function renderField(id, pieces) {
    const mine = pieces.filter(f => f.domains?.includes(id));
    const history = mine.filter(isHistory).sort((a, b) => startYear(a) - startYear(b) || a.id.localeCompare(b.id));
    const futures = mine.filter(f => !isHistory(f)).sort((a, b) => startYear(a) - startYear(b) || a.id.localeCompare(b.id));
    const people = new Set(mine.flatMap(f => [f.author, ...editorsOf(f)]));
    $('#fv-title').textContent = t(`domain.${id}`);
    $('#fv-stats').textContent = t('field.stats', { history: history.length, futures: futures.length, people: people.size });
    fieldSwitch.forEach((a, i) => a.setAttribute('aria-current', domains[i] === id ? 'page' : 'false'));
    $('#fv-history').replaceChildren(...(history.length ? history.map(f => h('li', { class: 'card history' }, ...cardBody(f, { conds: true }))) : [h('li', { class: 'muted' }, t('field.historyEmpty'))]));
    $('#fv-futures').replaceChildren(...futures.map(f => h('li', { class: 'card' }, ...cardBody(f, { conds: true }))));
    // 아무도 쓰지 않은 시대 (이 분야를 첫 번째로 둔 조각 기준, 미래는 조건과 상관없이)
    const filled = eras.map(() => false);
    for (const f of mine.filter(x => x.domains[0] === id)) {
      const y = isHistory(f) ? f.when.year[0] : Math.max(NOW_YEAR + 1, startYear(f));
      const i = eras.findIndex(([a, b]) => y >= a && y <= b);
      if (i >= 0) filled[i] = true;
    }
    const gaps = eras.map((era, i) => ({ era, i })).filter(g => !filled[g.i]);
    $('#fv-gaps-desc').textContent = t(gaps.length ? 'field.gapsDesc' : 'field.gapsNone');
    $('#fv-gaps').replaceChildren(...gaps.map(({ era: [a, b], i }) => h('button', {
      type: 'button', class: `gap-btn${i >= firstFuture ? ' fut' : ''}`,
      'aria-label': t('chron.add', { domain: t(`domain.${id}`), era: `${a}–${b}` }),
      onclick: () => {
        writer.prefill({ type: i < firstFuture ? 'history' : 'future', from: a, to: b, domain: id });
        location.hash = 'write';
      },
    }, `+ ${a}–${b}`)));
    mountDiscussion(id);
  }

  /** 분야 토론방: giscus가 설정돼 있으면 사이트 안에, 아니면 GitHub Discussions 링크만. */
  function mountDiscussion(id) {
    const term = fieldTerm(id);
    $('#fv-discuss-link').href = `${repoUrl}/discussions?discussions_q=${encodeURIComponent(`"${term}"`)}`;
    const box = $('#fv-discuss-box');
    const g = site.discussions?.giscus;
    if (!g) {
      box.replaceChildren(h('p', { class: 'pending' }, t('field.discussPending')));
      return;
    }
    if (mountedTerm === `${term}|${i18n.lang}`) return;
    mountedTerm = `${term}|${i18n.lang}`;
    const giscusLang = { zh: 'zh-CN' }[i18n.lang] || i18n.lang;
    box.replaceChildren(h('script', {
      src: 'https://giscus.app/client.js', 'data-repo': site.repo, 'data-repo-id': g.repoId,
      'data-category': g.category, 'data-category-id': g.categoryId,
      'data-mapping': 'specific', 'data-term': term, 'data-strict': '1',
      'data-reactions-enabled': '1', 'data-emit-metadata': '0', 'data-input-position': 'top',
      'data-theme': 'preferred_color_scheme', 'data-lang': giscusLang, 'data-loading': 'lazy',
      crossorigin: 'anonymous', async: true,
    }));
  }

  function route() {
    const m = location.hash.match(/^#field-([a-z-]+)$/);
    const id = m && domains.includes(m[1]) ? m[1] : null;
    const changed = id !== currentField;
    currentField = id;
    $('#top').hidden = Boolean(id);
    $('#field-view').hidden = !id;
    if (id) {
      renderField(id, pool());
      if (changed) window.scrollTo(0, 0);
    } else if (changed && location.hash.length > 1) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', route);

  setLanguage(i18n.lang);
  route();
}

// ---------- 조각 쓰기 폼 ----------
function setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, domains, regions, codes, condLabel, regionName, onChange }) {
  const saved = store.get('htft:draft') || {};
  const autoId = saved.autoId || `piece-${Math.random().toString(36).slice(2, 7)}`;
  const rows = {};
  let followConditions = !saved.when;
  let followType = !saved.type;
  const typeIs = () => ($('#f-type-history').checked ? 'history' : 'future');
  if (saved.type === 'history') $('#f-type-history').checked = true;

  // 쓰는 언어
  const langSel = $('#f-lang');
  langSel.replaceChildren(...i18n.languages.map(l => h('option', { value: l.code }, l.name)));
  langSel.value = codes.includes(saved.lang) ? saved.lang : i18n.lang;

  // 지역
  const regionSel = $('#f-region');
  const regionOpts = regions.map(r => h('option', { value: r.id }));
  regionSel.replaceChildren(...regionOpts);
  L(() => regionOpts.forEach((o, i) => { o.textContent = regions[i].id === 'world' ? t('region.world') : t(`region.${regions[i].id}`); }));
  regionSel.value = regions.some(r => r.id === saved.region) ? saved.region : 'world';
  regionSel.addEventListener('change', changed);

  // 조건 범위
  const dims = [{ id: 'year' }, ...conditions.map(c => ({ id: c.id }))];
  for (const d of dims) {
    const use = h('input', { type: 'checkbox', id: `f-use-${d.id}` });
    const min = h('input', { type: 'number', id: `f-min-${d.id}`, step: '1' });
    const max = h('input', { type: 'number', id: `f-max-${d.id}`, step: '1' });
    if (d.id !== 'year') { min.min = max.min = '0'; min.max = max.max = '100'; }
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

  // 분야 (누른 순서대로, 첫 번째가 대표 분야)
  const chosen = (saved.domains || []).filter(id => domains.includes(id)).slice(0, 3);
  const domainButtons = new Map(domains.map(id => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-i18n': `domain.${id}` });
    b.addEventListener('click', () => {
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length < 3) chosen.push(id);
      syncDomains();
      changed();
    });
    $('#f-domains').append(b);
    return [id, b];
  }));
  function syncDomains() {
    for (const [id, b] of domainButtons) {
      const i = chosen.indexOf(id);
      b.setAttribute('aria-pressed', String(i >= 0));
      b.dataset.order = i >= 0 ? String(i + 1) : '';
    }
  }
  syncDomains();

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
  document.querySelectorAll('input[name="ptype"]').forEach(r => r.addEventListener('change', () => {
    followType = false;
    if (followConditions) fillFrom(state);
    else fitYearToType();
    changed();
  }));
  /** 역사↔미래를 바꿨을 때 연도 범위가 그 종류에 맞지 않으면 지금 고른 해에 맞춰 다시 채운다. */
  function fitYearToType() {
    const history = typeIs() === 'history';
    const lo = history ? yearCfg.min : NOW_YEAR;
    const hi = history ? NOW_YEAR : yearCfg.max;
    const yr = rows.year;
    const a = Number(yr.min.value);
    const b = Number(yr.max.value);
    if (yr.use.checked && a >= lo && b <= hi && a <= b) return;
    yr.use.checked = true;
    if (history) {
      const y = Math.min(state.year, NOW_YEAR - 1);
      yr.min.value = Math.max(lo, y - HISTORY_WINDOW);
      yr.max.value = Math.min(hi, y + HISTORY_WINDOW);
    } else {
      yr.min.value = Math.max(lo, state.year - 10);
      yr.max.value = hi;
    }
  }
  if (saved.when) {
    for (const [id, r] of Object.entries(rows)) {
      const v = saved.when[id];
      r.use.checked = Boolean(v);
      if (v) { r.min.value = v[0]; r.max.value = v[1]; }
    }
  }
  $('#f-preview').addEventListener('change', onChange);

  /** 역사/미래에 따라 폼 모양을 바꾼다. */
  function syncType() {
    const history = typeIs() === 'history';
    for (const [id, r] of Object.entries(rows)) r.row.hidden = history && id !== 'year';
    const yr = rows.year;
    yr.min.min = yr.max.min = String(history ? yearCfg.min : NOW_YEAR);
    yr.min.max = yr.max.max = String(history ? NOW_YEAR : yearCfg.max);
    if (history) yr.use.checked = true;
    $('#f-history-hint').hidden = !history;
    for (const tone of TONES) {
      const label = $(`#f-tone-${tone}`).nextElementSibling;
      label.dataset.i18n = `${history ? 'toneH' : 'tone'}.${tone}`;
      label.textContent = t(label.dataset.i18n);
    }
    $('#f-when-hint').hidden = history;
    $('#f-when-label').textContent = t(history ? 'f.whenHistory' : 'f.when');
  }
  L(syncType);

  function fillFrom(s) {
    if (followType) (isPast(s.year) ? $('#f-type-history') : $('#f-type-future')).checked = true;
    const history = typeIs() === 'history';
    for (const [id, r] of Object.entries(rows)) {
      const v = s[id];
      if (id === 'year') {
        r.use.checked = true;
        if (history) {
          const y = Math.min(v, NOW_YEAR - 1);
          r.min.value = Math.max(yearCfg.min, y - HISTORY_WINDOW);
          r.max.value = Math.min(NOW_YEAR, y + HISTORY_WINDOW);
        } else {
          r.min.value = Math.max(NOW_YEAR, v - 10);
          r.max.value = yearCfg.max;
        }
      } else {
        r.use.checked = v < 35 || v > 65; // 가운데 값은 '상관없음'으로 둔다
        r.min.value = Math.max(0, v - 20);
        r.max.value = Math.min(100, v + 20);
      }
    }
    syncType();
  }
  if (followConditions) fillFrom(state);
  else syncType();
  $('#f-fill').addEventListener('click', () => { fillFrom(state); followConditions = true; changed(); });
  $('#gap-cta').addEventListener('click', () => { fillFrom(state); followConditions = true; changed(); setTimeout(() => $('#f-title').focus(), 300); });

  function readContribution() {
    const val = k => $(`#f-${k}`).value.trim();
    const wl = langSel.value;
    const history = typeIs() === 'history';
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
      const on = r.use.checked && (!history || id === 'year');
      r.row.classList.toggle('off', !on);
      if (on) when[id] = [Number(r.min.value), Number(r.max.value)];
    }
    const scene = {};
    for (const [k, { input, out }] of Object.entries(fx)) {
      const v = Number(input.value) / 100;
      out.textContent = v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
      if (v !== 0) scene[k] = v;
    }
    const sources = val('sources').split('\n').map(s => s.trim()).filter(Boolean);
    const piece = { id: val('id') || autoId };
    if (history) piece.type = 'history';
    Object.assign(piece, { title, story, when, tone: document.querySelector('input[name="tone"]:checked')?.value || 'mixed', domains: [...chosen] });
    if (regionSel.value !== 'world') piece.region = regionSel.value;
    if (Object.keys(scene).length) piece.scene = scene;
    if (sources.length) piece.sources = sources;
    return { author: val('author'), lang: wl, futures: [piece] };
  }

  function changed() {
    syncType();
    const c = readContribution();
    const f = c.futures[0];
    const translations = {};
    for (const [code, r] of Object.entries(trs)) if (r.title.value || r.story.value) translations[code] = { title: r.title.value, story: r.story.value };
    store.set('htft:draft', {
      autoId, author: c.author, id: $('#f-id').value.trim(), lang: c.lang, title: $('#f-title').value, story: $('#f-story').value,
      translations, type: followType ? null : typeIs(), domains: f.domains, region: f.region, sources: $('#f-sources').value,
      tone: f.tone, when: followConditions ? null : f.when, scene: f.scene,
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
    /** 연대기의 빈 칸에서: 그 칸의 시대와 분야로 폼을 채운다. */
    prefill({ type, from, to, domain }) {
      followType = false;
      (type === 'history' ? $('#f-type-history') : $('#f-type-future')).checked = true;
      fillFrom(state);
      followConditions = false;
      rows.year.use.checked = true;
      rows.year.min.value = Math.max(type === 'history' ? yearCfg.min : NOW_YEAR, from);
      rows.year.max.value = Math.min(type === 'history' ? NOW_YEAR : yearCfg.max, to);
      chosen.splice(0, chosen.length, domain);
      syncDomains();
      changed();
      setTimeout(() => $('#f-title').focus({ preventScroll: true }), 400);
    },
    previewPiece() {
      if (!$('#f-preview').checked) return null;
      const c = readContribution();
      const f = c.futures[0];
      if (!f.title[c.lang] || f.story[c.lang].length < 5 || !f.when.year && !Object.keys(f.when).length) return null;
      if (f.type === 'history' && !f.when.year) return null;
      return { ...f, domains: f.domains.length ? f.domains : ['daily'], lang: c.lang, author: c.author || '…', draft: true, file: null };
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
