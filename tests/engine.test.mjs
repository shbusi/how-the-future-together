import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagine, matches, baseScene, historyScene, coverageGrid, chronicle, regionFilter, SCENE_KEYS, NOW_YEAR, describe as describeScene } from '../assets/engine.js';
import { loadModel } from '../scripts/build.mjs';

const { bundle, problems } = await loadModel();
const model = { year: bundle.year, conditions: bundle.conditions, futures: bundle.futures };
const input = (over = {}) => ({ year: 2060, climate: 40, tech: 70, solidarity: 45, equality: 35, population: 30, peace: 50, growth: 50, ...over });
const hist = (id, y0, y1, over = {}) => ({ id, type: 'history', title: { ko: id }, story: { ko: id }, tone: 'mixed', when: { year: [y0, y1] }, domains: ['politics'], sources: ['https://x'], ...over });

test('저장소의 모든 조각이 검사를 통과한다', () => {
  assert.deepEqual(problems, []);
  assert.ok(bundle.futures.length >= 40);
});

test('모든 분야에 과거와 미래 조각이 있다', () => {
  const history = bundle.futures.filter(f => f.type === 'history');
  if (!history.length) return; // 연대기 조각이 아직 없는 상태
  for (const d of bundle.domains) {
    assert.ok(history.some(f => f.domains[0] === d), `역사 조각 없음: ${d}`);
    assert.ok(bundle.futures.some(f => f.type !== 'history' && f.domains.includes(d)), `미래 조각 없음: ${d}`);
  }
  for (const f of history) assert.ok(f.when.year[1] <= NOW_YEAR && f.sources.length, f.id);
});

test('조건 범위로 조각을 고른다', () => {
  const f = { when: { climate: [0, 30], year: [2050, 2100] } };
  assert.equal(matches(f, input({ climate: 20 })), true);
  assert.equal(matches(f, input({ climate: 31 })), false);
  assert.equal(matches(f, input({ climate: 20, year: 2040 })), false);
  assert.equal(matches(f, input({ climate: 20, year: 2040 }), { ignoreYear: true }), true);
});

test('조각은 첫 번째 분야, 시작하는 해의 시대 칸에 한 번만 놓인다', () => {
  const pieces = [hist('a', 1948, 1948), hist('b', 1988, 2005, { domains: ['economy', 'politics'] }),
    { id: 'c', title: { ko: 'c' }, story: { ko: 'c' }, tone: 'dark', when: { year: [2040, 2100], climate: [0, 50] }, domains: ['politics'] },
    { id: 'd', title: { ko: 'd' }, story: { ko: 'd' }, tone: 'dark', when: { year: [2040, 2100], climate: [80, 100] }, domains: ['politics'] }];
  const rows = chronicle(pieces, input({ climate: 40 }), bundle.eras, ['politics', 'economy']);
  const politics = rows[0].cells.map(c => c.map(f => f.id));
  assert.deepEqual(politics[1], ['a']);
  assert.deepEqual(rows[1].cells[2].map(f => f.id), ['b']);
  assert.deepEqual(politics[5], ['c'], '조건에 맞는 미래만');
  assert.equal(politics.flat().length, 2);
});

test('과거를 고르면 조건과 상관없이 역사 조각만, 근처 해(±2년)의 것이 보인다', () => {
  const pieces = [hist('a', 1969, 1969), hist('b', 1950, 1953), ...model.futures.filter(f => f.type !== 'history')];
  const r = imagine({ ...model, futures: pieces }, input({ year: 1970, climate: 0 }));
  assert.equal(r.past, true);
  assert.deepEqual(r.now.map(f => f.id), ['a']);
  assert.ok(r.path.some(f => f.id === 'b'));
  const r2 = imagine({ ...model, futures: pieces }, input({ year: 1970, climate: 100 }));
  assert.deepEqual(r2.scene, r.scene, '과거의 풍경은 조건으로 바뀌지 않는다');
});

test('과거의 풍경: 1900년은 낮은 옛 도시, 1975년은 산업화, 2025년은 오늘', () => {
  assert.ok(historyScene(1900).modern < 0.05 && historyScene(1900).density < 0.2);
  assert.ok(historyScene(1975).industry > 0.6);
  assert.equal(historyScene(2025).modern, 1);
  assert.equal(imagine(model, input({ year: 1900 })).headline, 'lowroofs');
});

test('미래는 지금에서 서서히 갈라진다: 2030년은 조건이 달라도 비슷하고, 2100년은 크게 다르다', () => {
  const gap = year => Math.abs(baseScene(input({ year, climate: 0 })).sea - baseScene(input({ year, climate: 100 })).sea);
  assert.ok(gap(2030) < 0.05);
  assert.ok(gap(2100) > 0.5);
  assert.ok(Math.abs(baseScene(input({ year: 2030 })).density - historyScene(2025).density) < 0.05);
});

test('지역 고르기: 한국을 고르면 세계·아시아·동아시아·한국 조각이 보이고 유럽 조각은 숨는다', () => {
  const keep = regionFilter(bundle.regions, 'korea');
  assert.ok(keep({}));
  assert.ok(keep({ region: 'east-asia' }));
  assert.ok(keep({ region: 'korea' }));
  assert.ok(!keep({ region: 'europe' }));
  assert.ok(!keep({ region: 'japan' }));
  const asia = regionFilter(bundle.regions, 'asia');
  assert.ok(asia({ region: 'korea' }) && asia({ region: 'japan' }) && !asia({ region: 'spain' }));
  const all = regionFilter(bundle.regions, 'world');
  assert.ok(all({ region: 'spain' }) && all({ region: 'korea' }));
});

test('그림 값은 모든 조건 조합에서 0~1 사이이고, 제목·문장 id는 모두 번역이 있다', () => {
  for (const v of [0, 50, 100]) for (const year of [1900, 1950, 1975, 2025, 2030, 2100]) {
    const r = imagine(model, input({ climate: v, tech: 100 - v, solidarity: v, equality: 100 - v, population: v, peace: v, growth: 100 - v, year }));
    for (const key of SCENE_KEYS) assert.ok(r.scene[key] >= 0 && r.scene[key] <= 1, `${key}=${r.scene[key]}`);
    for (const { code } of bundle.languages) {
      assert.ok(`headline.${r.headline}` in bundle.locales[code], `${code}: headline.${r.headline}`);
      for (const id of r.sentences) assert.ok(`picture.${id}` in bundle.locales[code], `${code}: picture.${id}`);
      for (const m of r.metrics) assert.ok(`metric.${m.id}` in bundle.locales[code]);
    }
  }
});

test('기후 대응을 포기하면 바다가 차오르고, 총력 대응하면 하늘이 맑다', () => {
  const bad = baseScene(input({ climate: 0, year: 2100 }));
  const good = baseScene(input({ climate: 100, year: 2100 }));
  assert.ok(bad.sea > good.sea + 0.5);
  assert.ok(bad.smog > good.smog + 0.4);
  assert.ok(good.solar > 0.6);
});

test('기술이 낮으면 돔 도시는 나타나지 않는다', () => {
  assert.equal(baseScene(input({ climate: 0, tech: 30, year: 2100 })).dome, 0);
  assert.ok(baseScene(input({ climate: 0, tech: 95, year: 2100 })).dome > 0.5);
});

test('연표에는 고른 해까지 시작된 조각만, 지금 풍경에는 그 해에 해당하는 조각만', () => {
  const r = imagine(model, input({ year: 2040 }));
  assert.ok(r.path.every(f => f.start <= 2040 && f.type !== 'history'));
  assert.ok(r.now.every(f => matches(f, input({ year: 2040 }))));
  assert.ok(r.now.length > 0);
});

test('미래 조각의 scene 값이 풍경을 바꾼다', () => {
  const extra = { id: 'x', title: { ko: '시험' }, story: { ko: '시험용 조각' }, tone: 'dark', when: { climate: [0, 100] }, domains: ['environment'], scene: { sea: 0.5 } };
  const without = imagine({ ...model, futures: [] }, input());
  const withIt = imagine({ ...model, futures: [extra] }, input());
  assert.ok(withIt.scene.sea > without.scene.sea + 0.3);
  assert.deepEqual(withIt.now.map(f => f.id), ['x']);
});

test('풍경 묘사는 1~4문장', () => {
  for (const v of [0, 50, 100]) {
    const s = describeScene(baseScene(input({ climate: v, solidarity: v })));
    assert.ok(s.length >= 1 && s.length <= 4);
  }
});

test('상상의 지도는 지금 조건에서 실제로 보일 조각 수를 센다', () => {
  const cells = coverageGrid(model.futures, 'climate', 'tech', input(), 5);
  assert.equal(cells.length, 25);
  const here = cells.find(c => c.x === 50 && c.y === 70);
  assert.equal(here.count, imagine(model, input({ climate: 50, tech: 70 })).now.length);
});

test('프리셋은 정의된 조건만 쓰고, 모든 언어에 이름이 있다', () => {
  const ids = new Set(['year', ...bundle.conditions.map(c => c.id)]);
  for (const p of bundle.presets) {
    for (const k of Object.keys(p.values)) assert.ok(ids.has(k), `${p.id}: ${k}`);
    for (const { code } of bundle.languages) assert.ok(`preset.${p.id}` in bundle.locales[code], `${code}: preset.${p.id}`);
  }
});
