import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContribution, normalizeContribution, formatError } from '../assets/validate.js';
import { futureFromIssue } from '../scripts/issue-to-future.mjs';
import { loadConfig } from '../scripts/build.mjs';

const cfg = await loadConfig();
const config = { conditions: cfg.conditions.conditions, year: cfg.conditions.year, languages: cfg.languages.map(l => l.code), tags: cfg.tags };
const good = () => ({
  author: 'someone',
  lang: 'en',
  futures: [{
    id: 'night-markets',
    title: { en: 'Night markets', ko: '밤에 여는 시장' },
    story: { en: 'Markets open after sunset to escape the heat. Children do homework under the stall lights.', ko: '한낮의 더위를 피해 시장은 해가 진 뒤에 문을 연다. 아이들은 밤 시장에서 숙제를 한다.' },
    when: { climate: [0, 40], year: [2050, 2100] },
    tone: 'mixed',
    tags: ['daily-life', 'climate'],
    scene: { heat: 0.1 },
  }],
});
const codes = errors => errors.map(e => e.code);

test('올바른 조각은 통과한다', () => {
  assert.deepEqual(validateContribution(good(), config), []);
});

test('제목·이야기를 글 하나로만 써도 파일의 lang으로 읽는다', () => {
  const data = good();
  data.futures[0].title = 'Night markets';
  data.futures[0].story = 'Markets open after sunset to escape the heat of the day.';
  assert.deepEqual(validateContribution(data, config), []);
  const [f] = normalizeContribution(data, 'x.json');
  assert.deepEqual(f.title, { en: 'Night markets' });
  assert.equal(f.lang, 'en');
  assert.equal(f.file, 'x.json');
});

test('흔한 실수를 코드로 알려 주고, 모든 언어로 문장이 된다', () => {
  const bad = good();
  Object.assign(bad.futures[0], { id: 'Night Markets', tone: 'happy', when: { climate: [50, 10], weather: [0, 1] }, scene: { sea: 2 }, tags: ['nope'] });
  bad.futures[0].story.en = 'short';
  const errors = validateContribution(bad, config);
  for (const code of ['id', 'story', 'tone', 'range', 'unknownCond', 'sceneValue', 'tagUnknown']) assert.ok(codes(errors).includes(code), code);
  for (const [lang, dict] of Object.entries(cfg.locales)) {
    for (const e of errors) assert.ok(!formatError(e, dict).includes('err.'), `${lang}: ${e.code}`);
  }
});

test('번역은 제목과 이야기가 짝을 이뤄야 하고, 원래 언어가 있어야 한다', () => {
  const half = good();
  half.futures[0].title.ja = '夜市';
  assert.ok(codes(validateContribution(half, config)).includes('textPair'));
  const noOriginal = good();
  noOriginal.lang = 'es';
  assert.ok(codes(validateContribution(noOriginal, config)).includes('textOriginal'));
  const unknown = good();
  unknown.futures[0].title.xx = 'abc';
  unknown.futures[0].story.xx = 'abcdefghijklmnopqrstuvwxyz';
  assert.ok(codes(validateContribution(unknown, config)).includes('textLang'));
});

test('lang이 없거나 조건이 없으면 거절한다', () => {
  const noLang = good();
  delete noLang.lang;
  assert.ok(codes(validateContribution(noLang, config)).includes('lang'));
  const noWhen = good();
  noWhen.futures[0].when = {};
  assert.ok(codes(validateContribution(noWhen, config)).includes('when'));
});

test('이슈 본문에서 미래 조각을 꺼내고, 이슈를 연 사람을 작성자로 쓴다', () => {
  const body = `### 이야기 · Story\n\n밤 시장 이야기\n\n### 미래 조각 JSON · Future piece JSON\n\n\`\`\`json\n${JSON.stringify(good(), null, 2)}\n\`\`\`\n`;
  const { contribution, errors } = futureFromIssue(body, 'real-author', config);
  assert.deepEqual(errors, []);
  assert.equal(contribution.author, 'real-author');
  assert.equal(contribution.lang, 'en');
});

test('이슈에 JSON이 없으면 이유를 알려 준다', () => {
  const { errors } = futureFromIssue('### 이야기\n\n그냥 아이디어', 'someone', config);
  assert.equal(errors[0].code, 'issueNoJson');
});
