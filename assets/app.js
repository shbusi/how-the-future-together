import { imagine, coverageGrid, SCENE_KEYS, TONES, NOW_YEAR, matches } from './engine.js';
import { validateContribution } from './validate.js';
import { createScene } from './scene.js';

// ---------- 작은 도구 ----------
const $ = sel => document.querySelector(sel);
function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list' && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  return node;
}
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 못 해도 괜찮다 */ } },
};
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.textContent = ''; }, 2800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ---------- 시작 ----------
async function boot() {
  let bundle;
  try {
    const res = await fetch('data/futures.json');
    if (!res.ok) throw new Error(res.status);
    bundle = await res.json();
  } catch {
    $('#headline').textContent = '미래 조각을 불러오지 못했어요.';
    $('#picture').textContent = '저장소에서 npm run dev 로 빌드한 뒤 열어 주세요. (data/futures.json이 필요합니다)';
    return;
  }

  const { site, conditions, year: yearCfg, presets } = bundle;
  const model = { year: yearCfg, conditions, futures: bundle.futures };
  const config = { conditions, year: yearCfg };
  const condById = Object.fromEntries(conditions.map(c => [c.id, c]));
  const repoUrl = `https://github.com/${site.repo}`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = createScene($('#scene'), { reducedMotion });
  $('#repo-link').href = repoUrl;

  // ----- 조건 상태 (주소의 ?year=..&climate=.. 로 공유 가능) -----
  const state = { year: yearCfg.default };
  for (const c of conditions) state[c.id] = c.default;
  const query = new URLSearchParams(location.search);
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  if (query.has('year')) state.year = clampTo(Math.round(Number(query.get('year')) / yearCfg.step) * yearCfg.step || yearCfg.default, yearCfg.min, yearCfg.max);
  for (const c of conditions) if (query.has(c.id)) state[c.id] = clampTo(Number(query.get(c.id)) || 0, 0, 100);

  const stamp = new Date(bundle.generatedAt);
  $('#stat').textContent = `미래 조각 ${model.futures.length}개 · 그린 사람 ${bundle.contributors.length}명 · ${stamp.getFullYear()}.${String(stamp.getMonth() + 1).padStart(2, '0')}.${String(stamp.getDate()).padStart(2, '0')} 갱신`;

  // ----- 계기판 -----
  const yearInput = $('#c-year');
  Object.assign(yearInput, { min: yearCfg.min, max: yearCfg.max, step: yearCfg.step, value: state.year });
  $('#year-label').textContent = yearCfg.label;
  const setFill = input => input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  yearInput.addEventListener('input', () => { state.year = Number(yearInput.value); render(); });

  const sliders = {};
  for (const c of conditions) {
    const input = h('input', { type: 'range', id: `c-${c.id}`, min: '0', max: '100', step: '5', value: String(state[c.id]) });
    const out = h('output', { for: `c-${c.id}` }, String(state[c.id]));
    input.addEventListener('input', () => { state[c.id] = Number(input.value); render(); });
    sliders[c.id] = { input, out };
    $('#sliders').append(h('div', { class: 'slider' },
      h('div', { class: 'slider-top' }, h('label', { for: `c-${c.id}` }, c.label), out),
      input,
      h('div', { class: 'slider-ends', 'aria-hidden': 'true' }, h('span', {}, c.low), h('span', {}, c.high)),
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
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => { Object.assign(state, p.values); render(); } }, p.name);
    $('#presets').append(b);
    return { b, p };
  });

  $('#reroll').addEventListener('click', () => scene.reroll());
  $('#save').addEventListener('click', () => {
    const a = h('a', { href: scene.toDataURL(), download: `future-${state.year}.png` });
    document.body.append(a);
    a.click();
    a.remove();
    toast('그림을 저장했어요.');
  });
  $('#share').addEventListener('click', async () => {
    const ok = await copy(shareUrl());
    toast(ok ? '이 미래로 오는 링크를 복사했어요.' : '주소창의 링크를 복사해 주세요.');
  });
  function shareUrl() {
    const q = new URLSearchParams({ year: state.year });
    for (const c of conditions) q.set(c.id, state[c.id]);
    return `${location.origin}${location.pathname}?${q}`;
  }

  // ----- 조각 카드와 연표 -----
  const yearsLabel = f => (f.when?.year ? `${f.when.year[0]}–${f.when.year[1]}` : '언제든');
  const who = a => (a === 'seed' ? '첫 씨앗' : `@${a}`);
  function issueUrl(params) {
    return `${repoUrl}/issues/new?${new URLSearchParams(params)}`;
  }
  function card(f) {
    const tagLine = (f.tags || []).map(t => `#${t}`).join(' ');
    const acts = f.draft ? h('span', { class: 'badge' }, '미리보기') : h('span', { class: 'acts' },
      h('a', {
        href: issueUrl({ template: 'opinion.yml', title: `[의견] ${f.title}`, piece: `${f.title} (${f.id}, futures/${f.file})` }),
        target: '_blank', rel: 'noopener',
      }, '의견 남기기'),
      h('a', { href: `${repoUrl}/edit/${site.branch}/futures/${f.file}`, target: '_blank', rel: 'noopener' }, '고쳐 쓰기'),
    );
    return h('li', { class: `card${f.draft ? ' draft' : ''}` },
      h('div', { class: 'card-top' }, h('span', { class: `tone tone-${f.tone}` }, TONES[f.tone]), h('span', { class: 'years' }, yearsLabel(f))),
      h('h3', {}, f.title),
      h('p', {}, f.story),
      h('div', { class: 'card-foot' }, h('span', { class: 'who' }, who(f.author)), tagLine && h('span', { class: 'tags' }, tagLine), acts),
    );
  }

  function renderPieces(result) {
    const list = $('#now');
    list.replaceChildren(...result.now.map(card));
    const { bright, mixed, dark } = result.tones;
    $('#pieces-note').textContent = result.now.length
      ? `${result.now.length}개의 조각이 이 미래를 그렸습니다. 밝음 ${bright} · 양면 ${mixed} · 어두움 ${dark}`
      : '';
    $('#gap').hidden = result.now.length >= 2;
    $('#gap p strong').textContent = result.now.length === 0 ? '이 조건의 미래는 아직 비어 있어요.' : '이 조건의 미래에는 아직 조각이 하나뿐이에요.';
  }

  function renderPath(result) {
    const items = result.path.map(f => {
      const past = f.when?.year && f.when.year[1] < state.year;
      return h('li', { class: f.active ? 'active' : past ? 'past' : '' },
        h('span', { class: 'ty' }, f.start <= NOW_YEAR ? '지금' : String(f.start)),
        h('span', { class: 'tl', 'aria-hidden': 'true' }),
        h('div', { class: 'tb' }, h('b', {}, f.title), ' ', h('span', {}, past ? `· ${f.when.year[1]}년 무렵 끝남` : `· ${who(f.author)}`)),
      );
    });
    items.push(h('li', { class: 'active' },
      h('span', { class: 'ty' }, String(state.year)),
      h('span', { class: 'tl', 'aria-hidden': 'true' }),
      h('div', { class: 'end' }, '지금 보고 있는 풍경'),
    ));
    $('#path').replaceChildren(...items);
  }

  // ----- 상상의 지도 -----
  const ax = $('#atlas-x');
  const ay = $('#atlas-y');
  for (const c of conditions) {
    ax.append(h('option', { value: c.id }, c.label));
    ay.append(h('option', { value: c.id }, c.label));
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
        'aria-label': `${condById[xk].label} ${c.x}, ${condById[yk].label} ${c.y}: 조각 ${c.count}개${here ? ' (지금 위치)' : ''}`,
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
    $('#atlas-xlabel').textContent = `${condById[xk].label} →`;
    $('#atlas-ylabel').textContent = `${condById[yk].label} →`;
  }

  // ----- 함께 그린 사람들 -----
  $('#people-note').textContent = `${bundle.contributors.length}명이 ${model.futures.length}개의 미래 조각을 그렸습니다. 조각이 많아질수록 풍경은 더 많은 사람의 상상을 닮아 갑니다.`;
  $('#contributors').replaceChildren(
    ...bundle.contributors.map(c => h('li', {},
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, c.author === 'seed' ? '씨' : c.author[0].toUpperCase()),
      c.author === 'seed'
        ? h('span', { class: 'name' }, '첫 씨앗 (프로젝트가 처음 심은 조각)')
        : h('a', { class: 'name', href: `https://github.com/${c.author}`, target: '_blank', rel: 'noopener' }, `@${c.author}`),
      h('span', { class: 'n' }, `${c.count}개`),
    )),
    h('li', { class: 'you' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, '+'),
      h('a', { class: 'name', href: '#write' }, '다음 조각은 당신 차례예요'),
    ),
  );

  // ----- 미래 조각 쓰기 -----
  const writer = setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, onChange: () => render() });

  // ----- 전체 그리기 -----
  function render() {
    syncControls();
    for (const { b, p } of presetButtons) b.setAttribute('aria-pressed', String(Object.entries(p.values).every(([k, v]) => state[k] === v)));
    writer.follow(state);
    const draft = writer.previewFuture();
    const result = imagine(draft ? { ...model, futures: [...model.futures, draft] } : model, state);
    scene.update(result.scene, state.year);
    $('#headline').textContent = result.headline;
    $('#picture').textContent = result.sentences.join(' ');
    $('#scene').setAttribute('aria-label', `${result.headline}. ${result.sentences.join(' ')}`);
    $('#metrics').replaceChildren(...result.metrics.map(m => h('div', { class: 'metric' },
      h('div', { class: 'metric-top' }, h('span', {}, m.label), h('b', {}, String(m.value))),
      h('div', { class: 'bar', role: 'meter', 'aria-label': m.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(m.value) }, Object.assign(h('i'), { style: `width:${m.value}%` })),
    )));
    renderPieces(result);
    renderPath(result);
    renderAtlas();
    writer.refresh();
    try { history.replaceState(null, '', `?${shareUrl().split('?')[1]}${location.hash}`); } catch { /* 주소를 못 바꾸는 환경 */ }
  }

  render();
}

// ---------- 미래 조각 쓰기 폼 ----------
function setupWriter({ conditions, yearCfg, config, model, state, site, repoUrl, onChange }) {
  const saved = store.get('htft:draft') || {};
  const autoId = saved.autoId || `future-${Math.random().toString(36).slice(2, 7)}`;
  const rows = {};
  let followConditions = !saved.when;

  const dims = [{ id: 'year', label: '연도', lo: NOW_YEAR, hi: yearCfg.max, step: 5 }, ...conditions.map(c => ({ id: c.id, label: c.label, lo: 0, hi: 100, step: 5 }))];
  for (const d of dims) {
    const use = h('input', { type: 'checkbox', id: `f-use-${d.id}` });
    const min = h('input', { type: 'number', id: `f-min-${d.id}`, min: String(d.lo), max: String(d.hi), step: String(d.step), 'aria-label': `${d.label} 최소` });
    const max = h('input', { type: 'number', id: `f-max-${d.id}`, min: String(d.lo), max: String(d.hi), step: String(d.step), 'aria-label': `${d.label} 최대` });
    const row = h('div', { class: 'when-row' }, h('label', { class: 'check', for: `f-use-${d.id}` }, use, d.label), min, h('span', { class: 'dash' }, '~'), max);
    for (const input of [use, min, max]) input.addEventListener('input', () => { followConditions = false; changed(); });
    rows[d.id] = { use, min, max, row, d };
    $('#f-when').append(row);
  }

  const fx = {};
  for (const [key, label] of Object.entries(SCENE_KEYS)) {
    const input = h('input', { type: 'range', id: `f-scene-${key}`, min: '-50', max: '50', step: '5', value: '0' });
    const out = h('output', { for: `f-scene-${key}` }, '0');
    input.addEventListener('input', changed);
    fx[key] = { input, out };
    $('#f-scene').append(h('div', { class: 'fx-row' }, h('label', { for: `f-scene-${key}` }, label), input, out));
  }

  const fields = ['author', 'id', 'title', 'story', 'tags', 'sources'].map(k => [k, $(`#f-${k}`)]);
  for (const [k, input] of fields) {
    if (saved[k]) input.value = saved[k];
    input.addEventListener('input', changed);
  }
  if (saved.tone) $(`#f-tone-${saved.tone}`).checked = true;
  document.querySelectorAll('input[name="tone"]').forEach(r => r.addEventListener('change', changed));
  if (saved.when) {
    for (const [id, r] of Object.entries(rows)) {
      const v = saved.when[id];
      r.use.checked = Boolean(v);
      if (v) { r.min.value = v[0]; r.max.value = v[1]; }
    }
  }
  if (saved.scene) for (const [k, v] of Object.entries(saved.scene)) if (fx[k]) fx[k].input.value = Math.round(v * 100);
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
    const tags = val('tags').split(',').map(t => t.trim()).filter(Boolean);
    const sources = val('sources').split('\n').map(t => t.trim()).filter(Boolean);
    const future = {
      id: val('id') || autoId,
      title: val('title'),
      story: val('story'),
      when,
      tone: document.querySelector('input[name="tone"]:checked')?.value || 'mixed',
    };
    if (tags.length) future.tags = tags;
    if (Object.keys(scene).length) future.scene = scene;
    if (sources.length) future.sources = sources;
    return { author: val('author'), futures: [future] };
  }

  function changed() {
    const c = readContribution();
    const f = c.futures[0];
    store.set('htft:draft', {
      autoId, author: c.author, id: $('#f-id').value.trim(), title: f.title, story: f.story,
      tags: $('#f-tags').value, sources: $('#f-sources').value, tone: f.tone, when: followConditions ? null : f.when, scene: f.scene,
    });
    onChange();
  }

  return {
    follow(s) {
      if (followConditions) fillFrom(s);
    },
    previewFuture() {
      if (!$('#f-preview').checked) return null;
      const c = readContribution();
      const f = c.futures[0];
      if (!f.title || f.story.length < 5 || !Object.keys(f.when).length) return null;
      return { ...f, author: c.author || '나', draft: true, file: null };
    },
    refresh() {
      const c = readContribution();
      const f = c.futures[0];
      $('#f-story-count').textContent = `${f.story.length} / 400`;
      const pristine = !c.author && !f.title && !f.story;
      const errors = validateContribution(c, config);
      if (model.futures.some(x => x.id === f.id)) errors.push(`id "${f.id}"는 이미 다른 조각이 쓰고 있어요. 다른 이름을 골라 주세요.`);
      const status = pristine
        ? [h('div', { class: 'info' }, '아이디, 제목, 이야기를 쓰면 여기서 바로 형식을 검사합니다.')]
        : errors.length
        ? errors.map(e => h('div', { class: 'no' }, `✖ ${e.replace(/^futures\[0\]( \([^)]*\))?: /, '')}`))
        : [h('div', { class: 'ok' }, '✔ 형식 검사를 통과했어요. 보낼 준비가 됐습니다.')];
      if (Object.keys(f.when).length) {
        status.push(h('div', { class: 'info' }, matches(f, state)
          ? '지금 고른 조건에서 이 조각이 나타납니다.'
          : '지금 고른 조건에서는 이 조각이 나타나지 않아요. 왼쪽 조건을 범위 안으로 옮겨 보세요.'));
      }
      $('#f-status').replaceChildren(...status);

      const json = `${JSON.stringify(c, null, 2)}\n`;
      $('#f-json').textContent = json;
      const pr = $('#send-pr');
      if (errors.length) {
        pr.setAttribute('aria-disabled', 'true');
        pr.href = '#write';
      } else {
        pr.removeAttribute('aria-disabled');
        const filename = `futures/${c.author}-${f.id}.json`;
        pr.href = `${repoUrl}/new/${site.branch}?${new URLSearchParams({ filename, value: json })}`;
      }
      const issue = $('#send-issue');
      const usable = f.title || f.story;
      issue.setAttribute('aria-disabled', String(!usable));
      issue.href = usable
        ? `${repoUrl}/issues/new?${new URLSearchParams({ template: 'future-idea.yml', title: `[미래 조각] ${f.title || '제목 없음'}`, story: f.story, future_json: json })}`
        : '#write';
    },
  };
}

$('#copy-json').addEventListener('click', async () => {
  const ok = await copy($('#f-json').textContent);
  if (ok) {
    $('#copy-json').textContent = '복사했어요';
    setTimeout(() => { $('#copy-json').textContent = 'JSON 복사'; }, 2000);
  } else {
    const range = document.createRange();
    range.selectNodeContents($('#f-json'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
});

boot();
