// 엔진: 조건 + 모두가 쓴 조각(역사 조각과 미래 조각)을 받아 그 해의 풍경을 계산한다.
// 과거는 하나뿐이라 조건과 상관없이 정해져 있고, 미래는 지금(2026년)에서 조건에 따라 갈라져 나간다.
// DOM을 쓰지 않으므로 브라우저와 Node(빌드·테스트) 양쪽에서 쓴다.

export const NOW_YEAR = 2026;
/** 역사 조각은 고른 해 앞뒤로 이만큼 안에 있으면 보인다 (연도 슬라이더가 5년 단위라서). */
export const HISTORY_WINDOW = 2;

// 그림을 움직이는 손잡이들. 조각의 "scene" 항목은 이 이름들만 쓸 수 있다.
// 화면에 보이는 이름은 locales/*.json의 "fx.<이름>"에 있다.
export const SCENE_KEYS = ['sea', 'heat', 'smog', 'green', 'solar', 'tech', 'density', 'decay', 'divide', 'community', 'dome', 'industry'];

export const TONES = ['bright', 'mixed', 'dark'];

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = t => t * t * (3 - 2 * t);

export const isHistory = f => f.type === 'history';
export const isPast = year => year < NOW_YEAR;

/**
 * 조각 하나가 지금 고른 해와 조건에 해당하는지. ignoreYear면 연도는 보지 않는다.
 * 역사 조각은 조건과 상관없이 연도만 본다.
 */
export function matches(piece, input, { ignoreYear = false } = {}) {
  if (isHistory(piece)) {
    if (ignoreYear) return true;
    const [a, b] = piece.when.year;
    return a <= input.year + HISTORY_WINDOW && b >= input.year - HISTORY_WINDOW;
  }
  for (const [key, range] of Object.entries(piece.when || {})) {
    if (key === 'year' && ignoreYear) continue;
    const v = input[key];
    if (v === undefined) return false;
    if (v < range[0] || v > range[1]) return false;
  }
  return true;
}

/** 조건을 좁게, 많이 걸수록 더 구체적인 미래로 보고 앞에 보여 준다. */
export function specificity(piece, model) {
  let score = 0;
  for (const [key, [lo, hi]] of Object.entries(piece.when || {})) {
    const span = key === 'year' ? model.year.max - model.year.min : 100;
    score += 1 - Math.min(1, (hi - lo) / span);
  }
  return score;
}

export function startYear(piece) {
  if (isHistory(piece)) return piece.when.year[0];
  return piece.when?.year ? Math.max(NOW_YEAR, piece.when.year[0]) : NOW_YEAR;
}

// ---------- 과거: 실제 흐름을 따라 정해진 기본 풍경 ----------
// modern은 건물 양식(0 = 낮은 벽돌·나무집, 1 = 오늘의 도시). 조각이 바꿀 수 없는 내부 값이다.
const HISTORY_KEYS = [...SCENE_KEYS, 'modern'];
const KEYFRAMES = [
  //      sea   heat  smog  green solar tech  dens  decay divide comm  dome  indus modern
  [1900, [0.00, 0.05, 0.08, 0.75, 0.00, 0.00, 0.10, 0.15, 0.42, 0.65, 0.00, 0.05, 0.00]],
  [1920, [0.00, 0.05, 0.15, 0.70, 0.00, 0.00, 0.15, 0.15, 0.42, 0.60, 0.00, 0.15, 0.08]],
  [1940, [0.00, 0.05, 0.20, 0.60, 0.00, 0.00, 0.20, 0.35, 0.40, 0.50, 0.00, 0.25, 0.15]],
  [1950, [0.00, 0.06, 0.20, 0.50, 0.00, 0.00, 0.20, 0.60, 0.38, 0.55, 0.00, 0.20, 0.20]],
  [1960, [0.00, 0.06, 0.30, 0.50, 0.00, 0.00, 0.30, 0.30, 0.38, 0.60, 0.00, 0.40, 0.30]],
  [1975, [0.00, 0.07, 0.55, 0.40, 0.00, 0.02, 0.45, 0.20, 0.40, 0.50, 0.00, 0.70, 0.50]],
  [1990, [0.01, 0.08, 0.55, 0.35, 0.00, 0.08, 0.60, 0.15, 0.40, 0.45, 0.00, 0.60, 0.70]],
  [2005, [0.02, 0.12, 0.45, 0.38, 0.05, 0.15, 0.72, 0.12, 0.42, 0.40, 0.00, 0.40, 0.88]],
  [2025, [0.05, 0.20, 0.35, 0.42, 0.20, 0.25, 0.78, 0.15, 0.42, 0.40, 0.00, 0.25, 1.00]],
];

/** 1900~2025년의 기본 풍경 (세계 도시가 걸어온 대략의 흐름). */
export function historyScene(year) {
  const y = clamp(year, KEYFRAMES[0][0], KEYFRAMES.at(-1)[0]);
  let i = KEYFRAMES.findIndex(([ky]) => ky >= y);
  if (i <= 0) i = 1;
  const [y0, a] = KEYFRAMES[i - 1];
  const [y1, b] = KEYFRAMES[i];
  const t = (y - y0) / (y1 - y0 || 1);
  return Object.fromEntries(HISTORY_KEYS.map((k, j) => [k, lerp(a[j], b[j], t)]));
}

// ---------- 미래: 조건이 정하는 풍경 ----------
/** 조건만으로 정해지는 풍경. 조각이 그 위에 덧칠한다. */
export function conditionScene(input) {
  const v = (id, d = 50) => (input[id] ?? d) / 100;
  const c = v('climate');
  const k = v('tech');
  const s = v('solidarity');
  const e = v('equality');
  const p = v('population');
  const w = v('peace');
  const g = v('growth');
  const t = clamp((input.year - 2025) / 75);

  const heat = clamp((1 - c) * (0.25 + 0.75 * t) * 0.95);
  const divide = clamp((1 - e) * (0.45 + 0.55 * t) * (1 - s * 0.3) + (1 - w) * 0.15);
  return {
    sea: clamp((1 - c) * t * 0.85 + t * 0.08),
    heat,
    smog: clamp((1 - c) * (0.35 + 0.45 * t) - k * c * 0.2 + (1 - s) * 0.08 + g * (1 - c) * 0.15 + (1 - w) * 0.05),
    green: clamp(0.25 + c * 0.55 + s * 0.15 - heat * 0.35 - p * 0.1),
    solar: clamp(c * (0.3 + 0.7 * Math.min(1, t * 1.6)) * (0.6 + 0.4 * k)),
    tech: clamp(k * (0.25 + 0.75 * t)),
    density: clamp(0.25 + p * 0.45 + k * 0.15 + t * 0.1 + (g - 0.5) * 0.2),
    decay: clamp((1 - p) * t * 0.75 + (1 - s) * (1 - c) * t * 0.35 - k * 0.1 + (1 - g) * t * 0.2 + (1 - w) * t * 0.3),
    divide,
    community: clamp(s * 0.75 + e * 0.25 - divide * 0.15 - (1 - w) * 0.1),
    dome: clamp((heat - 0.5) * 2.5 * clamp((k - 0.45) * 2.5)),
    industry: clamp((1 - c) * (0.3 + 0.4 * g) * (1 - k * 0.5)),
    modern: 1,
  };
}

/**
 * 그 해의 기본 풍경. 과거는 정해진 흐름, 미래는 지금의 풍경에서 조건이 정하는 풍경으로 서서히 갈라진다.
 * (2030년의 미래들은 서로 비슷하고, 2060년쯤이면 조건에 따라 완전히 달라진다.)
 */
export function baseScene(input) {
  if (isPast(input.year)) return historyScene(input.year);
  const present = historyScene(2025);
  const target = conditionScene(input);
  const w = smoothstep(clamp((input.year - 2025) / 35));
  return Object.fromEntries(HISTORY_KEYS.map(k => [k, lerp(present[k], target[k], w)]));
}

export function applyNudges(scene, pieces) {
  const out = { ...scene };
  for (const f of pieces) {
    for (const [key, delta] of Object.entries(f.scene || {})) {
      if (key in out && key !== 'modern') out[key] += delta;
    }
  }
  for (const key of Object.keys(out)) out[key] = clamp(out[key]);
  return out;
}

// ---------- 말로 옮기기 (문장은 locales/*.json에 있다) ----------
const PICTURE = [
  // [그림 값, 점수, 문장 id] — 문장은 "picture.<id>"
  ['modern',    s => s.modern < 0.35 ? 0.9 : 0, 'old-town'],
  ['decay',     s => s.decay > 0.45 && s.modern < 0.5 ? s.decay + 0.3 : 0, 'ruins'],
  ['industry',  s => s.industry > 0.5 ? s.industry : 0, 'industry-high'],
  ['dome',      s => s.dome > 0.35 ? s.dome + 0.4 : 0, 'dome'],
  ['sea',       s => s.sea > 0.6 ? s.sea : 0, 'sea-high'],
  ['sea',       s => s.sea > 0.3 && s.sea <= 0.6 ? s.sea * 0.8 : 0, 'sea-mid'],
  ['heat',      s => s.heat > 0.6 ? s.heat : 0, 'heat-high'],
  ['heat',      s => s.heat < 0.2 && s.modern >= 0.5 ? 0.35 : 0, 'heat-low'],
  ['smog',      s => s.smog > 0.55 ? s.smog : 0, 'smog-high'],
  ['smog',      s => s.smog < 0.15 ? 0.5 : 0, 'smog-low'],
  ['green',     s => s.green > 0.7 && s.modern >= 0.5 ? s.green : 0, 'green-high'],
  ['green',     s => s.green < 0.2 ? 0.7 : 0, 'green-low'],
  ['solar',     s => s.solar > 0.6 ? s.solar * 0.9 : 0, 'solar-high'],
  ['tech',      s => s.tech > 0.6 ? s.tech * 0.9 : 0, 'tech-high'],
  ['tech',      s => s.tech < 0.15 && s.modern >= 0.9 ? 0.4 : 0, 'tech-low'],
  ['density',   s => s.density > 0.8 ? s.density * 0.7 : 0, 'density-high'],
  ['density',   s => s.density < 0.35 && s.modern >= 0.5 ? 0.45 : 0, 'density-low'],
  ['decay',     s => s.decay > 0.45 && s.modern >= 0.5 ? s.decay + 0.1 : 0, 'decay-high'],
  ['divide',    s => s.divide > 0.6 ? s.divide + 0.05 : 0, 'divide-high'],
  ['divide',    s => s.divide < 0.2 ? 0.45 : 0, 'divide-low'],
  ['community', s => s.community > 0.65 ? s.community : 0, 'community-high'],
  ['community', s => s.community < 0.25 ? 0.6 : 0, 'community-low'],
];

/** 풍경을 묘사할 문장 id들. 가장 두드러진 특징 순으로 최대 4개. */
export function describe(scene) {
  const s = { modern: 1, industry: 0, ...scene };
  const used = new Set();
  const lines = PICTURE
    .map(([key, score, id], order) => ({ key, score: score(s), id, order }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(p => (used.has(p.key) ? false : used.add(p.key)))
    .slice(0, 4)
    .sort((a, b) => a.order - b.order)
    .map(p => p.id);
  return lines.length ? lines : ['neutral'];
}

const HEADLINES = [
  [s => (s.decay > 0.45 && s.modern < 0.5 ? 1.5 + s.decay : 0), 'rebuilding'],
  [s => (s.modern < 0.3 ? 1.6 : 0), 'lowroofs'],
  [s => (s.dome > 0.35 ? 1.4 + s.dome : 0), 'dome'],
  [s => (s.sea > 0.6 ? 0.9 + s.sea : 0), 'flooded'],
  [s => (s.divide > 0.6 && s.tech > 0.55 ? 0.8 + s.divide : 0), 'towers'],
  [s => (s.industry > 0.55 ? 0.75 + s.industry : 0), 'chimneys'],
  [s => (s.decay > 0.5 && s.modern >= 0.5 ? 0.7 + s.decay : 0), 'fading'],
  [s => (s.green > 0.7 && s.community > 0.6 && s.modern >= 0.5 ? 0.8 + s.green : 0), 'forest'],
  [s => (s.divide > 0.65 ? 0.6 + s.divide : 0), 'walled'],
  [s => (s.smog > 0.6 ? 0.6 + s.smog : 0), 'smog'],
  [s => (s.heat > 0.65 ? 0.5 + s.heat : 0), 'summer'],
  [s => (s.solar > 0.65 ? 0.5 + s.solar : 0), 'sunwind'],
  [s => (s.tech > 0.7 ? 0.5 + s.tech : 0), 'skyways'],
  [s => (s.community > 0.7 ? 0.5 + s.community : 0), 'together'],
  [s => (s.green > 0.7 && s.modern >= 0.5 ? 0.4 + s.green : 0), 'green'],
  [() => 0.1, 'quiet'],
];

/** 제목 id. 화면에는 locales/*.json의 "headline.format"과 "headline.<id>"로 보인다. */
export function headline(scene) {
  const s = { modern: 1, industry: 0, ...scene };
  return HEADLINES.map(([f, id]) => [f(s), id]).sort((a, b) => b[0] - a[0])[0][1];
}

export function metrics(scene) {
  const pct = v => Math.round(clamp(v) * 100);
  return [
    { id: 'sustain', value: pct((1 - (scene.heat * 0.4 + scene.smog * 0.3 + scene.sea * 0.3)) * 0.7 + scene.green * 0.3) },
    { id: 'fair', value: pct(1 - scene.divide * 0.8 + scene.community * 0.2 - 0.1) },
    { id: 'life', value: pct(0.3 * scene.community + 0.25 * scene.green + 0.15 * scene.tech + 0.15 * (1 - scene.smog) + 0.15 * (1 - scene.decay) - scene.heat * 0.2 + 0.1) },
  ];
}

/**
 * 전체 계산. model = { year, conditions, futures } (futures에는 역사 조각과 미래 조각이 함께 들어 있다)
 * 과거를 고르면 역사 조각만, 미래를 고르면 미래 조각만 쓴다.
 * 반환: 그림 값, 그 해의 조각들(now), 거기까지의 연표(path), 제목·문장·지표 id.
 */
export function imagine(model, input) {
  const past = isPast(input.year);
  const pool = model.futures.filter(f => isHistory(f) === past);
  const reachable = pool.filter(f => matches(f, input, { ignoreYear: true }));
  const now = reachable
    .filter(f => matches(f, input))
    .sort((a, b) => past
      ? startYear(a) - startYear(b) || a.id.localeCompare(b.id)
      : specificity(b, model) - specificity(a, model) || a.id.localeCompare(b.id));
  const from = past ? input.year - 25 : -Infinity;
  const path = reachable
    .filter(f => startYear(f) <= input.year + (past ? HISTORY_WINDOW : 0) && (!past || f.when.year[1] >= from))
    .map(f => ({ ...f, start: startYear(f), active: now.includes(f) }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const scene = applyNudges(baseScene(input), now);
  const tones = { bright: 0, mixed: 0, dark: 0 };
  for (const f of now) tones[f.tone] = (tones[f.tone] || 0) + 1;

  return {
    past,
    scene,
    now,
    path,
    tones,
    headline: headline(scene),
    sentences: describe(scene),
    metrics: metrics(scene),
  };
}

/**
 * 분야별 연대기: 분야(행) × 시대(열). 조각은 시작하는 해가 속한 시대, 첫 번째 분야의 칸에 한 번만 놓인다.
 * 과거 칸은 역사 조각, 미래 칸은 지금 고른 조건에 맞는 미래 조각이다.
 */
export function chronicle(pieces, input, eras, domains) {
  const eraOf = year => eras.findIndex(([a, b]) => year >= a && year <= b);
  const rows = domains.map(domain => ({ domain, cells: eras.map(() => []) }));
  const rowOf = Object.fromEntries(rows.map(r => [r.domain, r]));
  for (const f of pieces) {
    const row = rowOf[f.domains?.[0]];
    if (!row) continue;
    if (!isHistory(f) && !matches(f, input, { ignoreYear: true })) continue;
    const i = eraOf(isHistory(f) ? f.when.year[0] : Math.max(NOW_YEAR + 1, startYear(f)));
    if (i >= 0) row.cells[i].push(f);
  }
  for (const r of rows) for (const cell of r.cells) cell.sort((a, b) => startYear(a) - startYear(b) || a.id.localeCompare(b.id));
  return rows;
}

/**
 * 두 조건을 축으로 한 "상상의 지도". 나머지 조건은 지금 값 그대로 두고 두 조건만 바꿨을 때,
 * 칸마다 몇 개의 미래 조각이 펼쳐지는지 센다. 0인 칸은 아직 아무도 그리지 않은 미래다.
 */
export function coverageGrid(pieces, xKey, yKey, input, steps = 5) {
  const futures = pieces.filter(f => !isHistory(f));
  const at0 = { ...input, year: Math.max(input.year, NOW_YEAR + 4) };
  const size = 100 / steps;
  const cells = [];
  for (let yi = steps - 1; yi >= 0; yi--) {
    for (let xi = 0; xi < steps; xi++) {
      const x = Math.round(xi * size + size / 2);
      const y = Math.round(yi * size + size / 2);
      const at = { ...at0, [xKey]: x, [yKey]: y };
      cells.push({ x, y, count: futures.filter(f => matches(f, at)).length });
    }
  }
  return cells;
}

/** 지역 고르기: 고른 지역과 그 위(예: 한국 → 동아시아 → 아시아 → 세계), 그 아래 지역의 조각을 보여 준다. */
export function regionFilter(regions, selected) {
  const parent = Object.fromEntries(regions.map(r => [r.id, r.parent]));
  const ancestors = new Set();
  for (let r = selected; r; r = parent[r]) ancestors.add(r);
  const isUnder = id => { for (let r = id; r; r = parent[r]) if (r === selected) return true; return false; };
  return piece => {
    const id = piece.region || 'world';
    return ancestors.has(id) || isUnder(id);
  };
}
