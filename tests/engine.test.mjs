import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imagine, matches, baseScene, coverageGrid, SCENE_KEYS, describe as describeScene } from '../assets/engine.js';
import { loadModel } from '../scripts/build.mjs';

const { bundle, problems } = await loadModel();
const model = { year: bundle.year, conditions: bundle.conditions, futures: bundle.futures };
const input = (over = {}) => ({ year: 2060, climate: 40, tech: 70, solidarity: 45, equality: 35, population: 30, ...over });

test('저장소의 모든 미래 조각이 검사를 통과한다', () => {
  assert.deepEqual(problems, []);
  assert.ok(bundle.futures.length >= 40);
});

test('조건 범위로 조각을 고른다', () => {
  const f = { when: { climate: [0, 30], year: [2050, 2100] } };
  assert.equal(matches(f, input({ climate: 20 })), true);
  assert.equal(matches(f, input({ climate: 31 })), false);
  assert.equal(matches(f, input({ climate: 20, year: 2040 })), false);
  assert.equal(matches(f, input({ climate: 20, year: 2040 }), { ignoreYear: true }), true);
});

test('그림 값은 모든 조건 조합에서 0~1 사이이고, 제목·문장 id는 모두 번역이 있다', () => {
  for (const v of [0, 50, 100]) for (const year of [2030, 2100]) {
    const r = imagine(model, input({ climate: v, tech: 100 - v, solidarity: v, equality: 100 - v, population: v, year }));
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
  assert.ok(r.path.every(f => f.start <= 2040));
  assert.ok(r.now.every(f => matches(f, input({ year: 2040 }))));
  assert.ok(r.now.length > 0);
});

test('미래 조각의 scene 값이 풍경을 바꾼다', () => {
  const extra = { id: 'x', title: { ko: '시험' }, story: { ko: '시험용 조각' }, tone: 'dark', when: { climate: [0, 100] }, scene: { sea: 0.5 } };
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
