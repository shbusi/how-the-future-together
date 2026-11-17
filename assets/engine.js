// 미래 엔진: 조건 + 모두가 쓴 "미래 조각"을 받아 그 해의 풍경을 계산한다.
// DOM을 쓰지 않으므로 브라우저와 Node(빌드·테스트) 양쪽에서 쓴다.

export const NOW_YEAR = 2026;

// 그림을 움직이는 손잡이들. 미래 조각의 "scene" 항목은 이 이름들만 쓸 수 있다.
export const SCENE_KEYS = {
  sea:       '해수면 (바다가 도시로 올라옴)',
  heat:      '더위 (하늘빛이 뜨거워짐)',
  smog:      '대기 오염 (잿빛 하늘)',
  green:     '초록 (숲, 옥상 정원)',
  solar:     '재생 에너지 (태양광, 풍력)',
  tech:      '첨단 기술 (비행체, 자기부상열차)',
  density:   '도시 밀도 (건물 높이와 수)',
  decay:     '쇠퇴 (빈 건물, 부서진 창)',
  divide:    '격차 (벽, 갈라진 도시)',
  community: '공동체 (텃밭, 마을 식탁, 사람들)',
  dome:      '돔 도시 (도시를 덮는 돔)',
};

export const TONES = {
  bright: '밝은 미래',
  mixed: '양면적인 미래',
  dark: '어두운 미래',
};

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
  // [조건, 점수, 문장]
  ['dome',      s => s.dome > 0.35 ? s.dome + 0.4 : 0,
   '도시 전체가 투명한 돔으로 덮여, 바깥 공기와 떨어진 채 살아갑니다.'],
  ['sea',       s => s.sea > 0.6 ? s.sea : 0,
   '바다가 도시의 아랫부분을 삼켜, 사람들은 높은 층과 다리 위에서 살아갑니다.'],
  ['sea',       s => s.sea > 0.3 && s.sea <= 0.6 ? s.sea * 0.8 : 0,
   '바닷물이 해안 도로까지 올라와, 방파제가 도시의 새 경계가 되었습니다.'],
  ['heat',      s => s.heat > 0.6 ? s.heat : 0,
   '여름은 다섯 달 넘게 이어지고, 한낮의 거리는 텅 비어 있습니다.'],
  ['heat',      s => s.heat < 0.2 ? 0.35 : 0,
   '계절은 아직 제 모습을 지키고 있습니다.'],
  ['smog',      s => s.smog > 0.55 ? s.smog : 0,
   '하늘은 늘 누런 잿빛이라 해를 똑바로 볼 수 있을 정도입니다.'],
  ['smog',      s => s.smog < 0.15 ? 0.5 : 0,
   '하늘이 맑아 멀리 산 능선까지 또렷하게 보입니다.'],
  ['green',     s => s.green > 0.7 ? s.green : 0,
   '건물 벽과 옥상까지 숲이 올라와 도시가 하나의 정원이 되었습니다.'],
  ['green',     s => s.green < 0.2 ? 0.7 : 0,
   '초록은 거의 남지 않았고, 남은 나무는 울타리 안에서 관리됩니다.'],
  ['solar',     s => s.solar > 0.6 ? s.solar * 0.9 : 0,
   '지붕마다 태양광 패널이 깔리고, 언덕마다 풍력 발전기가 돌아갑니다.'],
  ['tech',      s => s.tech > 0.6 ? s.tech * 0.9 : 0,
   '하늘에는 자율 비행체가 오가고, 고가 위로 자기부상열차가 지나갑니다.'],
  ['tech',      s => s.tech < 0.15 ? 0.4 : 0,
   '기술은 지금과 비슷한 수준에서 멈춰 있습니다.'],
  ['density',   s => s.density > 0.8 ? s.density * 0.7 : 0,
   '빽빽하게 솟은 고층 건물들이 하늘을 가립니다.'],
  ['density',   s => s.density < 0.35 ? 0.45 : 0,
   '도시는 낮고 성기게 퍼져 있습니다.'],
  ['decay',     s => s.decay > 0.45 ? s.decay + 0.1 : 0,
   '불 꺼진 창이 늘어나고, 버려진 건물에는 덩굴이 자랍니다.'],
  ['divide',    s => s.divide > 0.6 ? s.divide + 0.05 : 0,
   '높은 벽 너머의 반짝이는 구역과 그 바깥의 낡은 동네가 전혀 다른 시간을 삽니다.'],
  ['divide',    s => s.divide < 0.2 ? 0.45 : 0,
   '동네마다 생활 수준의 차이가 크지 않습니다.'],
  ['community', s => s.community > 0.65 ? s.community : 0,
   '골목마다 공동 텃밭과 마을 식탁이 있고, 중요한 일은 함께 모여 정합니다.'],
  ['community', s => s.community < 0.25 ? 0.6 : 0,
   '사람들은 각자의 문을 닫고 살아갑니다.'],
];

/** 풍경을 몇 문장으로 묘사한다. 가장 두드러진 특징 순으로 최대 4문장. */
export function describe(scene) {
  const used = new Set();
  const lines = PICTURE
    .map(([key, score, text], order) => ({ key, score: score(scene), text, order }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter(p => (used.has(p.key) ? false : used.add(p.key)))
    .slice(0, 4)
    .sort((a, b) => a.order - b.order)
    .map(p => p.text);
  return lines.length ? lines : ['어느 쪽으로도 크게 기울지 않은 채, 도시는 조금씩 지금과 달라지고 있습니다.'];
}

const HEADLINES = [
  [s => (s.dome > 0.35 ? 1.4 + s.dome : 0), '거대한 돔 아래의 도시'],
  [s => (s.sea > 0.6 ? 0.9 + s.sea : 0), '바다가 차오른 도시'],
  [s => (s.divide > 0.6 && s.tech > 0.55 ? 0.8 + s.divide : 0), '빛나는 탑과 그늘진 골목'],
  [s => (s.decay > 0.5 ? 0.7 + s.decay : 0), '불이 하나둘 꺼져 가는 도시'],
  [s => (s.green > 0.7 && s.community > 0.6 ? 0.8 + s.green : 0), '숲과 이웃이 함께 사는 도시'],
  [s => (s.divide > 0.65 ? 0.6 + s.divide : 0), '벽으로 나뉜 도시'],
  [s => (s.smog > 0.6 ? 0.6 + s.smog : 0), '잿빛 하늘 아래의 도시'],
  [s => (s.heat > 0.65 ? 0.5 + s.heat : 0), '여름이 끝나지 않는 도시'],
  [s => (s.solar > 0.65 ? 0.5 + s.solar : 0), '햇빛과 바람으로 움직이는 도시'],
  [s => (s.tech > 0.7 ? 0.5 + s.tech : 0), '하늘길이 열린 도시'],
  [s => (s.community > 0.7 ? 0.5 + s.community : 0), '함께 결정하는 도시'],
  [s => (s.green > 0.7 ? 0.4 + s.green : 0), '초록이 돌아온 도시'],
  [() => 0.1, '조용히 변해 가는 도시'],
];

export function headline(scene, year) {
  const [, text] = HEADLINES.map(([f, t]) => [f(scene), t]).sort((a, b) => b[0] - a[0])[0];
  return `${year}년, ${text}`;
}

export function metrics(scene) {
  const pct = v => Math.round(clamp(v) * 100);
  return [
    { id: 'sustain', label: '지속가능성', value: pct((1 - (scene.heat * 0.4 + scene.smog * 0.3 + scene.sea * 0.3)) * 0.7 + scene.green * 0.3) },
    { id: 'fair', label: '공정함', value: pct(1 - scene.divide * 0.8 + scene.community * 0.2 - 0.1) },
    { id: 'life', label: '삶의 질', value: pct(0.3 * scene.community + 0.25 * scene.green + 0.15 * scene.tech + 0.15 * (1 - scene.smog) + 0.15 * (1 - scene.decay) - scene.heat * 0.2 + 0.1) },
  ];
}

/**
 * 전체 계산. model = { year, conditions, futures }
 * 반환: 그림 파라미터, 그 해에 펼쳐진 조각들(now), 거기까지의 연표(path), 문장들.
 */
export function imagine(model, input) {
  const reachable = model.futures.filter(f => matches(f, input, { ignoreYear: true }));
  const now = reachable
    .filter(f => matches(f, input))
    .sort((a, b) => specificity(b, model) - specificity(a, model) || a.title.localeCompare(b.title, 'ko'));
  const path = reachable
    .filter(f => !f.when?.year || f.when.year[0] <= input.year)
    .map(f => ({ ...f, start: startYear(f), active: now.includes(f) }))
    .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title, 'ko'));

  const scene = applyNudges(baseScene(input), now);
  const tones = { bright: 0, mixed: 0, dark: 0 };
  for (const f of now) tones[f.tone] = (tones[f.tone] || 0) + 1;

  return {
    scene,
    now,
    path,
    tones,
    headline: headline(scene, input.year),
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
