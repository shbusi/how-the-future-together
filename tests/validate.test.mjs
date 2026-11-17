import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContribution, normalizeContribution, formatError } from '../assets/validate.js';
import { futureFromIssue } from '../scripts/issue-to-future.mjs';
import { loadConfig, validationConfig } from '../scripts/build.mjs';

const cfg = await loadConfig();
const config = validationConfig(cfg);
const good = () => ({
  author: 'someone',
  lang: 'en',
  futures: [{
    id: 'night-markets',
    title: { en: 'Night markets', ko: '밤에 여는 시장' },
    story: { en: 'Markets open after sunset to escape the heat. Children do homework under the stall lights.', ko: '한낮의 더위를 피해 시장은 해가 진 뒤에 문을 연다. 아이들은 밤 시장에서 숙제를 한다.' },
    when: { climate: [0, 40], year: [2050, 2100] },
    tone: 'mixed',
    domains: ['daily', 'environment'],
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
  Object.assign(bad.futures[0], { id: 'Night Markets', tone: 'happy', when: { climate: [50, 10], weather: [0, 1] }, scene: { sea: 2 }, domains: ['nope'], region: 'mars' });
  bad.futures[0].story.en = 'short';
  const errors = validateContribution(bad, config);
  for (const code of ['id', 'story', 'tone', 'range', 'unknownCond', 'sceneValue', 'domainUnknown', 'region']) assert.ok(codes(errors).includes(code), code);
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

test('역사 조각: 연도만, 2026년까지, 근거 자료는 꼭', () => {
  const h = () => ({ author: 'someone', lang: 'ko', futures: [{
    id: 'politics-1948-x', type: 'history', title: { ko: '세계인권선언' }, story: { ko: '1948년 유엔 총회가 세계인권선언을 채택했다.' },
    when: { year: [1948, 1948] }, tone: 'bright', domains: ['rights'], sources: ['https://en.wikipedia.org/wiki/Universal_Declaration_of_Human_Rights'],
  }] });
  assert.deepEqual(validateContribution(h(), config), []);
  const withCond = h(); withCond.futures[0].when.climate = [0, 50];
  assert.ok(codes(validateContribution(withCond, config)).includes('historyWhen'));
  const future = h(); future.futures[0].when.year = [2020, 2030];
  assert.ok(codes(validateContribution(future, config)).includes('historyYear'));
  const tooOld = h(); tooOld.futures[0].when.year = [1850, 1860];
  assert.ok(codes(validateContribution(tooOld, config)).includes('historyYear'));
  const noSource = h(); delete noSource.futures[0].sources;
  assert.ok(codes(validateContribution(noSource, config)).includes('historySources'));
  const pastFuture = good(); pastFuture.futures[0].when.year = [1990, 2000];
  assert.ok(codes(validateContribution(pastFuture, config)).includes('year'), '미래 조각은 과거 연도를 쓸 수 없다');
});

test('분야는 1~3개, 겹치지 않게', () => {
  for (const domains of [[], ['politics', 'economy', 'work', 'rights'], ['politics', 'politics']]) {
    const d = good(); d.futures[0].domains = domains;
    assert.ok(codes(validateContribution(d, config)).includes('domains'), JSON.stringify(domains));
  }
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
