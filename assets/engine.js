// 미래 엔진: 조건 + 모두가 쓴 "미래 조각"을 받아 그 해의 풍경을 계산한다.
// DOM을 쓰지 않으므로 브라우저와 Node(빌드·테스트) 양쪽에서 쓴다.

export const NOW_YEAR = 2026;

// 그림을 움직이는 손잡이들. 미래 조각의 "scene" 항목은 이 이름들만 쓸 수 있다.
// 화면에 보이는 이름은 locales/*.json의 "fx.<이름>"에 있다.
export const SCENE_KEYS = ['sea', 'heat', 'smog', 'green', 'solar', 'tech', 'density', 'decay', 'divide', 'community', 'dome'];

export const TONES = ['bright', 'mixed', 'dark'];

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** 미래 조각 하나가 현재 조건에 해당하는지. ignoreYear면 연도는 보지 않는다. */
export function matches(future, input, { ignoreYear = false } = {}) {
  for (const [key, range] of Object.entries(future.when || {})) {
    if (key === 'year' && ignoreYear) continue;
    const v = input[key];
    if (v === undefined) return false;
    if (v < range[0] || v > range[1]) return false;
  }
  return true;
}

/** 조건을 좁게, 많이 걸수록 더 구체적인 미래로 보고 앞에 보여 준다. */
export function specificity(future, model) {
  let score = 0;
  for (const [key, [lo, hi]] of Object.entries(future.when || {})) {
    const span = key === 'year' ? model.year.max - NOW_YEAR : 100;
    score += 1 - Math.min(1, (hi - lo) / span);
  }
  return score;
}

export function startYear(future) {
  return future.when?.year ? Math.max(NOW_YEAR, future.when.year[0]) : NOW_YEAR;
}

/** 조건만으로 정해지는 기본 풍경. 미래 조각이 그 위에 덧칠한다. */
export function baseScene(input) {
  const c = input.climate / 100;
  const k = input.tech / 100;
  const s = input.solidarity / 100;
  const e = input.equality / 100;
  const p = input.population / 100;
  const t = clamp((input.year - 2025) / 75);

  const heat = clamp((1 - c) * (0.25 + 0.75 * t) * 0.95);
  const divide = clamp((1 - e) * (0.45 + 0.55 * t) * (1 - s * 0.3));
  return {
    sea: clamp((1 - c) * t * 0.85 + t * 0.08),
    heat,
    smog: clamp((1 - c) * (0.35 + 0.45 * t) - k * c * 0.2 + (1 - s) * 0.08),
    green: clamp(0.25 + c * 0.55 + s * 0.15 - heat * 0.35 - p * 0.1),
    solar: clamp(c * (0.3 + 0.7 * Math.min(1, t * 1.6)) * (0.6 + 0.4 * k)),
    tech: clamp(k * (0.25 + 0.75 * t)),
    density: clamp(0.25 + p * 0.45 + k * 0.15 + t * 0.1),
    decay: clamp((1 - p) * t * 0.75 + (1 - s) * (1 - c) * t * 0.35 - k * 0.1),
    divide,
    community: clamp(s * 0.75 + e * 0.25 - divide * 0.15),
    dome: clamp((heat - 0.5) * 2.5 * clamp((k - 0.45) * 2.5)),
  };
}

export function applyNudges(scene, futures) {
  const out = { ...scene };
  for (const f of futures) {
    for (const [key, delta] of Object.entries(f.scene || {})) {
      if (key in out) out[key] += delta;
    }
  }
  for (const key of Object.keys(out)) out[key] = clamp(out[key]);
  return out;
}

const PICTURE = [
  // [그림 값, 점수, 문장 id] — 문장은 locales/*.json의 "picture.<id>"
  ['dome',      s => s.dome > 0.35 ? s.dome + 0.4 : 0, 'dome'],
  ['sea',       s => s.sea > 0.6 ? s.sea : 0, 'sea-high'],
  ['sea',       s => s.sea > 0.3 && s.sea <= 0.6 ? s.sea * 0.8 : 0, 'sea-mid'],
  ['heat',      s => s.heat > 0.6 ? s.heat : 0, 'heat-high'],
  ['heat',      s => s.heat < 0.2 ? 0.35 : 0, 'heat-low'],
  ['smog',      s => s.smog > 0.55 ? s.smog : 0, 'smog-high'],
  ['smog',      s => s.smog < 0.15 ? 0.5 : 0, 'smog-low'],
  ['green',     s => s.green > 0.7 ? s.green : 0, 'green-high'],
  ['green',     s => s.green < 0.2 ? 0.7 : 0, 'green-low'],
  ['solar',     s => s.solar > 0.6 ? s.solar * 0.9 : 0, 'solar-high'],
  ['tech',      s => s.tech > 0.6 ? s.tech * 0.9 : 0, 'tech-high'],
  ['tech',      s => s.tech < 0.15 ? 0.4 : 0, 'tech-low'],
  ['density',   s => s.density > 0.8 ? s.density * 0.7 : 0, 'density-high'],
  ['density',   s => s.density < 0.35 ? 0.45 : 0, 'density-low'],
  ['decay',     s => s.decay > 0.45 ? s.decay + 0.1 : 0, 'decay-high'],
  ['divide',    s => s.divide > 0.6 ? s.divide + 0.05 : 0, 'divide-high'],
  ['divide',    s => s.divide < 0.2 ? 0.45 : 0, 'divide-low'],
  ['community', s => s.community > 0.65 ? s.community : 0, 'community-high'],
  ['community', s => s.community < 0.25 ? 0.6 : 0, 'community-low'],
];

/** 풍경을 묘사할 문장 id들. 가장 두드러진 특징 순으로 최대 4개. */
export function describe(scene) {
  const used = new Set();
  const lines = PICTURE
    .map(([key, score, id], order) => ({ key, score: score(scene), id, order }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(p => (used.has(p.key) ? false : used.add(p.key)))
    .slice(0, 4)
    .sort((a, b) => a.order - b.order)
    .map(p => p.id);
  return lines.length ? lines : ['neutral'];
}

const HEADLINES = [
  [s => (s.dome > 0.35 ? 1.4 + s.dome : 0), 'dome'],
  [s => (s.sea > 0.6 ? 0.9 + s.sea : 0), 'flooded'],
  [s => (s.divide > 0.6 && s.tech > 0.55 ? 0.8 + s.divide : 0), 'towers'],
  [s => (s.decay > 0.5 ? 0.7 + s.decay : 0), 'fading'],
  [s => (s.green > 0.7 && s.community > 0.6 ? 0.8 + s.green : 0), 'forest'],
  [s => (s.divide > 0.65 ? 0.6 + s.divide : 0), 'walled'],
  [s => (s.smog > 0.6 ? 0.6 + s.smog : 0), 'smog'],
  [s => (s.heat > 0.65 ? 0.5 + s.heat : 0), 'summer'],
  [s => (s.solar > 0.65 ? 0.5 + s.solar : 0), 'sunwind'],
  [s => (s.tech > 0.7 ? 0.5 + s.tech : 0), 'skyways'],
  [s => (s.community > 0.7 ? 0.5 + s.community : 0), 'together'],
  [s => (s.green > 0.7 ? 0.4 + s.green : 0), 'green'],
  [() => 0.1, 'quiet'],
];

/** 제목 id. 화면에는 locales/*.json의 "headline.format"과 "headline.<id>"로 보인다. */
export function headline(scene) {
  return HEADLINES.map(([f, id]) => [f(scene), id]).sort((a, b) => b[0] - a[0])[0][1];
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
 * 전체 계산. model = { year, conditions, futures }
 * 반환: 그림 값, 그 해에 펼쳐진 조각들(now), 거기까지의 연표(path), 제목·문장·지표 id.
 */
export function imagine(model, input) {
  const reachable = model.futures.filter(f => matches(f, input, { ignoreYear: true }));
  const now = reachable
    .filter(f => matches(f, input))
    .sort((a, b) => specificity(b, model) - specificity(a, model) || a.id.localeCompare(b.id));
  const path = reachable
    .filter(f => !f.when?.year || f.when.year[0] <= input.year)
    .map(f => ({ ...f, start: startYear(f), active: now.includes(f) }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const scene = applyNudges(baseScene(input), now);
  const tones = { bright: 0, mixed: 0, dark: 0 };
  for (const f of now) tones[f.tone] = (tones[f.tone] || 0) + 1;

  return {
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
 * 두 조건을 축으로 한 "상상의 지도". 나머지 조건은 지금 값 그대로 두고 두 조건만 바꿨을 때,
 * 칸마다 몇 개의 조각이 펼쳐지는지 센다. 0인 칸은 아직 아무도 그리지 않은 미래다.
 */
export function coverageGrid(futures, xKey, yKey, input, steps = 5) {
  const size = 100 / steps;
  const cells = [];
  for (let yi = steps - 1; yi >= 0; yi--) {
    for (let xi = 0; xi < steps; xi++) {
      const x = Math.round(xi * size + size / 2);
      const y = Math.round(yi * size + size / 2);
      const at = { ...input, [xKey]: x, [yKey]: y };
      cells.push({ x, y, count: futures.filter(f => matches(f, at)).length });
    }
  }
  return cells;
}
