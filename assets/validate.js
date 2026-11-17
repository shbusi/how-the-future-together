// 미래 조각 파일 검사기. 빌드, GitHub Actions, 웹사이트의 "미래 조각 쓰기" 폼이 함께 쓴다.
// 오류는 { code, params, at } 모양으로 돌려주고, 문장은 locales/*.json의 "err.<code>"에서 고른다.
import { SCENE_KEYS, TONES, NOW_YEAR } from './engine.js';

export const TYPES = ['future', 'history'];

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const AUTHOR_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const isRange = v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && Number.isFinite(n));
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const err = (code, params = {}, at) => ({ code, params, at });

/** "글" 또는 { "ko": "글", "en": "text" } → 언어별 객체. 글 하나만 쓰면 파일의 lang으로 본다. */
export function textMap(value, lang) {
  if (typeof value === 'string') return lang ? { [lang]: value } : null;
  return isObject(value) ? value : null;
}

/** 검사를 통과한 파일을 웹사이트가 쓰는 모양으로 편다. */
export function normalizeContribution(data, file) {
  return data.futures.map(f => ({
    ...f,
    title: textMap(f.title, data.lang),
    story: textMap(f.story, data.lang),
    lang: data.lang,
    author: data.author,
    file,
  }));
}

/**
 * @param {unknown} data  파일 하나의 JSON
 * @param {{conditions: {id:string}[], year: {min:number, max:number}, languages: string[], domains: string[], regions: {id:string}[]}} config
 * @returns {{code:string, params:object, at?:string}[]} 오류 목록 (비어 있으면 통과)
 */
export function validateContribution(data, config) {
  const errors = [];
  const condIds = new Set(config.conditions.map(c => c.id));
  const langs = new Set(config.languages);
  const domainSet = new Set(config.domains);
  const regionSet = new Set(config.regions.map(r => r.id));
  const langList = [...langs].join(', ');

  if (!isObject(data)) return [err('shape')];
  for (const key of Object.keys(data)) {
    if (!['author', 'lang', 'futures', '$schema'].includes(key)) errors.push(err('unknownTop', { key }));
  }
  if (typeof data.author !== 'string' || !AUTHOR_PATTERN.test(data.author)) errors.push(err('author'));
  if (!langs.has(data.lang)) errors.push(err('lang', { langs: langList }));
  if (!Array.isArray(data.futures) || data.futures.length === 0) {
    errors.push(err('futures'));
    return errors;
  }

  data.futures.forEach((f, i) => {
    const at = `futures[${i}]${f && typeof f.id === 'string' ? ` (${f.id})` : ''}`;
    if (!isObject(f)) {
      errors.push(err('item', {}, at));
      return;
    }
    for (const key of Object.keys(f)) {
      if (!['id', 'type', 'title', 'story', 'when', 'tone', 'domains', 'region', 'scene', 'sources'].includes(key)) errors.push(err('unknownKey', { key }, at));
    }
    if (f.type !== undefined && !TYPES.includes(f.type)) errors.push(err('type', { types: TYPES.join(', ') }, at));
    const history = f.type === 'history';
    if (typeof f.id !== 'string' || !ID_PATTERN.test(f.id) || f.id.length > 60) errors.push(err('id', {}, at));

    const title = textMap(f.title, data.lang);
    const story = textMap(f.story, data.lang);
    if (!title || !story) {
      errors.push(err('textShape', {}, at));
    } else {
      for (const l of new Set([...Object.keys(title), ...Object.keys(story)])) {
        if (!langs.has(l)) { errors.push(err('textLang', { lang: l, langs: langList }, at)); continue; }
        if (!(l in title) || !(l in story)) { errors.push(err('textPair', { lang: l }, at)); continue; }
        if (typeof title[l] !== 'string' || title[l].trim().length < 2 || title[l].length > 40) errors.push(err('title', { lang: l }, at));
        if (typeof story[l] !== 'string' || story[l].trim().length < 20 || story[l].length > 400) errors.push(err('story', { lang: l }, at));
      }
      if (langs.has(data.lang) && !(data.lang in title && data.lang in story)) errors.push(err('textOriginal', { lang: data.lang }, at));
    }

    if (!TONES.includes(f.tone)) errors.push(err('tone', { tones: TONES.join(', ') }, at));

    if (history) {
      // 역사 조각: 실제로 있었던 일. 조건 없이 연도만, 근거 자료는 꼭.
      if (!isObject(f.when) || Object.keys(f.when).some(k => k !== 'year') || !f.when.year) errors.push(err('historyWhen', {}, at));
      else if (!isRange(f.when.year) || f.when.year[0] > f.when.year[1] || f.when.year[0] < config.year.min || f.when.year[1] > NOW_YEAR) {
        errors.push(err('historyYear', { min: config.year.min, max: NOW_YEAR }, at));
      }
      if (!Array.isArray(f.sources) || f.sources.length === 0) errors.push(err('historySources', {}, at));
    } else if (!isObject(f.when) || Object.keys(f.when).length === 0) {
      errors.push(err('when', {}, at));
    } else {
      for (const [key, range] of Object.entries(f.when)) {
        if (key === 'year') {
          if (!isRange(range) || range[0] > range[1] || range[0] < NOW_YEAR || range[1] > config.year.max) {
            errors.push(err('year', { min: NOW_YEAR, max: config.year.max }, at));
          }
        } else if (!condIds.has(key)) {
          errors.push(err('unknownCond', { key, keys: ['year', ...condIds].join(', ') }, at));
        } else if (!isRange(range) || range[0] > range[1] || range[0] < 0 || range[1] > 100) {
          errors.push(err('range', { key }, at));
        }
      }
    }

    if (!Array.isArray(f.domains) || f.domains.length < 1 || f.domains.length > 3 || !f.domains.every(d => typeof d === 'string') || new Set(f.domains).size !== f.domains.length) {
      errors.push(err('domains', {}, at));
    } else {
      for (const d of f.domains) if (!domainSet.has(d)) errors.push(err('domainUnknown', { domain: d, domains: config.domains.join(', ') }, at));
    }
    if (f.region !== undefined && !regionSet.has(f.region)) errors.push(err('region', { region: f.region, regions: [...regionSet].join(', ') }, at));
    if (f.scene !== undefined) {
      if (!isObject(f.scene)) {
        errors.push(err('sceneShape', {}, at));
      } else {
        for (const [key, v] of Object.entries(f.scene)) {
          if (!SCENE_KEYS.includes(key)) errors.push(err('sceneKey', { key, keys: SCENE_KEYS.join(', ') }, at));
          else if (typeof v !== 'number' || v < -0.5 || v > 0.5) errors.push(err('sceneValue', { key }, at));
        }
      }
    }
    if (f.sources !== undefined && (!Array.isArray(f.sources) || !f.sources.every(s => typeof s === 'string' && /^https?:\/\/\S+$/.test(s)))) {
      errors.push(err('sources', {}, at));
    }
  });

  const seen = new Set();
  for (const f of data.futures) {
    if (f && typeof f.id === 'string') {
      if (seen.has(f.id)) errors.push(err('dupInFile', { id: f.id }));
      seen.add(f.id);
    }
  }
  return errors;
}

/**
 * "{n}" 자리에 값을 넣는다. "{n|piece|pieces}"는 n이 1이면 앞, 아니면 뒤를 고른다 (영어, 스페인어처럼 단수·복수가 있는 언어용).
 */
export function interpolate(str, params = {}) {
  return str
    .replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (m, k, one, other) => (k in params ? (Number(params[k]) === 1 ? one : other) : m))
    .replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

/**
 * 오류 하나를 문장으로. lookup은 locale 객체이거나 (key) => 문장 함수.
 */
export function formatError(e, lookup, { withAt = true } = {}) {
  const key = `err.${e.code}`;
  const raw = (typeof lookup === 'function' ? lookup(key) : lookup[key]) ?? key;
  const msg = interpolate(raw, e.params);
  return withAt && e.at ? `${e.at}: ${msg}` : msg;
}
