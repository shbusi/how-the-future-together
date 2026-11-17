// 미래 조각 파일 검사기. 빌드, GitHub Actions, 웹사이트의 "미래 조각 쓰기" 폼이 함께 쓴다.
// 오류 문장은 처음 기여하는 사람도 바로 고칠 수 있게 한국어로 쓴다.
import { SCENE_KEYS, TONES, NOW_YEAR } from './engine.js';

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AUTHOR_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const isRange = v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));

/**
 * @param {unknown} data  파일 하나의 JSON
 * @param {{conditions: {id:string}[], year: {max:number}}} config
 * @returns {string[]} 오류 목록 (비어 있으면 통과)
 */
export function validateContribution(data, config) {
  const errors = [];
  const condIds = new Set(config.conditions.map(c => c.id));
  const yearMax = config.year.max;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['파일 전체가 { "author": ..., "futures": [...] } 모양의 객체여야 합니다.'];
  }
  for (const key of Object.keys(data)) {
    if (!['author', 'futures', '$schema'].includes(key)) errors.push(`알 수 없는 항목 "${key}"이 있습니다. author와 futures만 쓸 수 있습니다.`);
  }
  if (typeof data.author !== 'string' || !AUTHOR_PATTERN.test(data.author)) {
    errors.push('author에는 GitHub 아이디(영문, 숫자, 하이픈)를 적어 주세요.');
  }
  if (!Array.isArray(data.futures) || data.futures.length === 0) {
    errors.push('futures에는 미래 조각을 하나 이상 넣어 주세요.');
    return errors;
  }

  data.futures.forEach((f, i) => {
    const at = `futures[${i}]${f && typeof f.id === 'string' ? ` (${f.id})` : ''}`;
    if (!f || typeof f !== 'object') {
      errors.push(`${at}: 객체여야 합니다.`);
      return;
    }
    for (const key of Object.keys(f)) {
      if (!['id', 'title', 'story', 'when', 'tone', 'tags', 'scene', 'sources'].includes(key)) {
        errors.push(`${at}: 알 수 없는 항목 "${key}"이 있습니다.`);
      }
    }
    if (typeof f.id !== 'string' || !ID_PATTERN.test(f.id) || f.id.length > 60) {
      errors.push(`${at}: id는 영문 소문자, 숫자, 하이픈으로 60자 이내로 적어 주세요. 예: "sea-wall-cities"`);
    }
    if (typeof f.title !== 'string' || f.title.trim().length < 2 || f.title.length > 40) {
      errors.push(`${at}: title(제목)은 2~40자로 적어 주세요.`);
    }
    if (typeof f.story !== 'string' || f.story.trim().length < 20 || f.story.length > 400) {
      errors.push(`${at}: story(이야기)는 20~400자로 적어 주세요. 그 미래의 한 장면을 구체적으로 보여 주면 좋습니다.`);
    }
    if (!(f.tone in TONES)) {
      errors.push(`${at}: tone은 ${Object.keys(TONES).map(t => `"${t}"`).join(', ')} 중 하나여야 합니다.`);
    }

    if (!f.when || typeof f.when !== 'object' || Array.isArray(f.when) || Object.keys(f.when).length === 0) {
      errors.push(`${at}: when에 이 미래가 펼쳐지는 조건을 하나 이상 적어 주세요. 예: { "climate": [0, 30] }`);
    } else {
      for (const [key, range] of Object.entries(f.when)) {
        if (key === 'year') {
          if (!isRange(range) || range[0] > range[1] || range[0] < NOW_YEAR || range[1] > yearMax) {
            errors.push(`${at}: when.year는 [시작, 끝] 모양이고 ${NOW_YEAR}~${yearMax} 사이여야 합니다.`);
          }
        } else if (!condIds.has(key)) {
          errors.push(`${at}: when에 알 수 없는 조건 "${key}"이 있습니다. 쓸 수 있는 조건: year, ${[...condIds].join(', ')}`);
        } else if (!isRange(range) || range[0] > range[1] || range[0] < 0 || range[1] > 100) {
          errors.push(`${at}: when.${key}는 [최소, 최대] 모양이고 0~100 사이여야 합니다.`);
        }
      }
    }

    if (f.tags !== undefined && (!Array.isArray(f.tags) || f.tags.length > 5 || !f.tags.every(t => typeof t === 'string' && t.length >= 1 && t.length <= 12))) {
      errors.push(`${at}: tags는 12자 이내 낱말을 5개까지 넣을 수 있습니다.`);
    }
    if (f.scene !== undefined) {
      if (!f.scene || typeof f.scene !== 'object' || Array.isArray(f.scene)) {
        errors.push(`${at}: scene은 { "sea": 0.2 } 모양이어야 합니다.`);
      } else {
        for (const [key, v] of Object.entries(f.scene)) {
          if (!(key in SCENE_KEYS)) errors.push(`${at}: scene에 알 수 없는 항목 "${key}"이 있습니다. 쓸 수 있는 항목: ${Object.keys(SCENE_KEYS).join(', ')}`);
          else if (typeof v !== 'number' || v < -0.5 || v > 0.5) errors.push(`${at}: scene.${key} 값은 -0.5~0.5 사이 숫자여야 합니다.`);
        }
      }
    }
    if (f.sources !== undefined && (!Array.isArray(f.sources) || !f.sources.every(s => typeof s === 'string' && /^https?:\/\/\S+$/.test(s)))) {
      errors.push(`${at}: sources에는 http(s)로 시작하는 주소만 넣을 수 있습니다.`);
    }
  });

  const seen = new Set();
  for (const f of data.futures) {
    if (f && typeof f.id === 'string') {
      if (seen.has(f.id)) errors.push(`id "${f.id}"가 한 파일 안에서 두 번 쓰였습니다.`);
      seen.add(f.id);
    }
  }
  return errors;
}
