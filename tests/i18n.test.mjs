import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/build.mjs';
import { SCENE_KEYS, TONES } from '../assets/engine.js';

const cfg = await loadConfig();
const ko = cfg.locales.ko;
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('한국어와 영어 번역은 빠진 문장이 없다', () => {
  for (const code of ['ko', 'en']) {
    const missing = Object.keys(ko).filter(k => !(k in cfg.locales[code]));
    assert.deepEqual(missing, [], code);
  }
});

test('어느 번역 파일에도 모르는 키가 없고, {자리표시}가 한국어와 같다', () => {
  for (const [code, dict] of Object.entries(cfg.locales)) {
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(k in ko, `${code}: 모르는 키 ${k}`);
      assert.equal(placeholders(v), placeholders(ko[k]), `${code}: ${k}`);
    }
  }
});

test('조건, 분야, 지역, 그림 항목, 분위기는 기준 번역에 이름이 있다', () => {
  for (const c of cfg.conditions.conditions) for (const part of ['label', 'low', 'high']) assert.ok(`cond.${c.id}.${part}` in ko, `cond.${c.id}.${part}`);
  for (const d of cfg.domains) assert.ok(`domain.${d}` in ko && `domain.${d}` in cfg.locales.en, `domain.${d}`);
  for (const r of cfg.regions) assert.ok(`region.${r.id}` in ko && `region.${r.id}` in cfg.locales.en, `region.${r.id}`);
  for (const p of cfg.conditions.presets) assert.ok(`preset.${p.id}` in ko, `preset.${p.id}`);
  for (const key of SCENE_KEYS) assert.ok(`fx.${key}` in ko, `fx.${key}`);
  for (const tone of TONES) assert.ok(`tone.${tone}` in ko, `tone.${tone}`);
});

test('언어 목록의 코드마다 번역 파일과 HTML 언어 코드가 있다', () => {
  for (const l of cfg.languages) {
    assert.ok(cfg.locales[l.code], l.code);
    assert.match(l.html, /^[a-z]{2,3}(-[A-Za-z]+)?$/);
    assert.ok(l.name);
  }
});
