import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContribution } from '../assets/validate.js';
import { futureFromIssue } from '../scripts/issue-to-future.mjs';

const config = JSON.parse(await readFile(new URL('../config/conditions.json', import.meta.url), 'utf8'));
const good = () => ({
  author: 'someone',
  futures: [{
    id: 'night-markets',
    title: '밤에 여는 시장',
    story: '한낮의 더위를 피해 시장은 해가 진 뒤에 문을 연다. 아이들은 밤 시장에서 숙제를 한다.',
    when: { climate: [0, 40], year: [2050, 2100] },
    tone: 'mixed',
    tags: ['일상'],
    scene: { heat: 0.1 },
  }],
});

test('올바른 조각은 통과한다', () => {
  assert.deepEqual(validateContribution(good(), config), []);
});

test('흔한 실수를 한국어로 알려 준다', () => {
  const bad = good();
  Object.assign(bad.futures[0], { id: 'Night Markets', story: '짧음', tone: 'happy', when: { climate: [50, 10], weather: [0, 1] }, scene: { sea: 2 } });
  const errors = validateContribution(bad, config).join('\n');
  for (const word of ['id는', 'story', 'tone', 'when.climate', '"weather"', 'scene.sea']) assert.ok(errors.includes(word), word);
});

test('조건이 하나도 없으면 거절한다', () => {
  const bad = good();
  bad.futures[0].when = {};
  assert.ok(validateContribution(bad, config).some(e => e.includes('when')));
});

test('이슈 본문에서 미래 조각을 꺼낸다', () => {
  const body = `### 이야기\n\n밤 시장 이야기\n\n### 미래 조각 JSON\n\n\`\`\`json\n${JSON.stringify(good(), null, 2)}\n\`\`\`\n`;
  const { contribution, errors } = futureFromIssue(body, 'real-author', config);
  assert.deepEqual(errors, []);
  assert.equal(contribution.author, 'real-author');
  assert.equal(contribution.futures[0].id, 'night-markets');
});

test('이슈에 JSON이 없으면 이유를 알려 준다', () => {
  const { errors } = futureFromIssue('### 이야기\n\n그냥 아이디어', 'someone', config);
  assert.ok(errors[0].includes('JSON'));
});
