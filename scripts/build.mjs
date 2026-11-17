// 미래 조각(futures/*.json)과 번역(locales/*.json)을 검사하고, 웹사이트를 dist/로 묶는다.
//   node scripts/build.mjs          검사 + 빌드
//   node scripts/build.mjs --check  검사만
import { readFile, readdir, writeFile, mkdir, rm, cp, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContribution, normalizeContribution, formatError } from '../assets/validate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const readJson = async path => JSON.parse(await readFile(join(root, path), 'utf8'));

export async function loadConfig() {
  const languages = await readJson('config/languages.json');
  const locales = {};
  for (const { code } of languages) locales[code] = await readJson(`locales/${code}.json`);
  return {
    site: await readJson('site.config.json'),
    conditions: await readJson('config/conditions.json'),
    domains: await readJson('config/domains.json'),
    regions: await readJson('config/regions.json'),
    languages,
    locales,
  };
}

/** 검사기에 넘길 설정. */
export function validationConfig(cfg) {
  const c = cfg.conditions;
  return { conditions: c.conditions, year: c.year, languages: cfg.languages.map(l => l.code), domains: cfg.domains, regions: cfg.regions };
}

/** 오류를 한국어와 영어로 함께 적는다. CI 기록은 여러 나라 기여자가 함께 본다. */
export function describeError(e, locales) {
  const ko = formatError(e, locales.ko);
  const en = formatError(e, locales.en, { withAt: false });
  return ko === en ? ko : `${ko}\n     ${en}`;
}

export async function loadModel() {
  const cfg = await loadConfig();
  const { conditions: c } = cfg;
  const config = validationConfig(cfg);
  const files = (await readdir(join(root, 'futures'))).filter(f => f.endsWith('.json')).sort();

  const problems = [];
  const futures = [];
  const owner = new Map();

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await readFile(join(root, 'futures', file), 'utf8'));
    } catch (e) {
      problems.push({ file, errors: [{ code: 'json', params: { message: e.message } }] });
      continue;
    }
    const errors = validateContribution(data, config);
    for (const f of data.futures || []) {
      if (!f || typeof f.id !== 'string') continue;
      if (owner.has(f.id)) errors.push({ code: 'dupGlobal', params: { id: f.id, file: owner.get(f.id) } });
      else owner.set(f.id, file);
    }
    if (errors.length) problems.push({ file, errors });
    else futures.push(...normalizeContribution(data, file));
  }

  // 번역 파일: 한국어를 기준으로 빠진 문장을 찾는다 (빠지면 화면에서 영어 → 한국어 순으로 대신 보인다)
  const base = Object.keys(cfg.locales.ko);
  const missing = Object.fromEntries(cfg.languages.map(({ code }) => [code, base.filter(k => !(k in cfg.locales[code]))]));

  const contributors = [...futures.reduce((m, f) => m.set(f.author, (m.get(f.author) || 0) + 1), new Map())]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));

  return {
    problems,
    missing,
    locales: cfg.locales,
    bundle: {
      site: {
        repo: process.env.GITHUB_REPOSITORY || cfg.site.repo,
        branch: process.env.SITE_BRANCH || cfg.site.branch,
      },
      generatedAt: new Date().toISOString(),
      year: c.year,
      conditions: c.conditions,
      presets: c.presets,
      languages: cfg.languages,
      eras: c.eras,
      domains: cfg.domains,
      regions: cfg.regions,
      locales: cfg.locales,
      futures,
      contributors,
    },
    fileCount: files.length,
  };
}

async function report(problems, locales) {
  console.error(problems.flatMap(p => [`✖ futures/${p.file}`, ...p.errors.map(e => `   - ${describeError(e, locales)}`)]).join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = ['## 미래 조각 검사에서 고칠 점이 있어요 · Some future pieces need fixing', '',
      ...problems.flatMap(p => [`### \`futures/${p.file}\``,
        ...p.errors.map(e => `- ${formatError(e, locales.ko)}<br>${formatError(e, locales.en, { withAt: false })}`), '']),
      '고친 뒤 다시 커밋하면 검사가 다시 돌아갑니다. Push a fix and the check runs again. → CONTRIBUTING.md'];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }
}

async function main() {
  const { problems, missing, locales, bundle, fileCount } = await loadModel();
  if (problems.length) {
    await report(problems, locales);
    process.exit(1);
  }
  for (const [code, keys] of Object.entries(missing)) {
    if (keys.length) console.warn(`! locales/${code}.json: 번역이 빠진 문장 ${keys.length}개 (${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''})`);
  }
  const translated = bundle.languages.map(({ code }) => `${code} ${bundle.futures.filter(f => f.title[code]).length}`).join(' · ');
  const history = bundle.futures.filter(f => f.type === 'history').length;
  const summary = `✔ 파일 ${fileCount}개, 조각 ${bundle.futures.length}개 (역사 ${history} · 미래 ${bundle.futures.length - history}), 기여자 ${bundle.contributors.length}명 — 모두 통과 (언어별: ${translated})`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (checkOnly) return;

  const dist = join(root, 'dist');
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'data'), { recursive: true });
  await cp(join(root, 'index.html'), join(dist, 'index.html'));
  await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'data/futures.json'), JSON.stringify(bundle));
  await writeFile(join(dist, '.nojekyll'), '');
  console.log('✔ dist/ 에 웹사이트를 만들었습니다.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
