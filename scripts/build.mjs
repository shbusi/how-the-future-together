// 미래 조각(futures/*.json)을 검사하고, 웹사이트를 dist/로 묶는다.
//   node scripts/build.mjs          검사 + 빌드
//   node scripts/build.mjs --check  검사만
import { readFile, readdir, writeFile, mkdir, rm, cp, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContribution } from '../assets/validate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

export async function loadModel() {
  const site = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
  const config = JSON.parse(await readFile(join(root, 'config/conditions.json'), 'utf8'));
  const files = (await readdir(join(root, 'futures'))).filter(f => f.endsWith('.json')).sort();

  const problems = [];
  const futures = [];
  const owner = new Map();

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await readFile(join(root, 'futures', file), 'utf8'));
    } catch (err) {
      problems.push({ file, errors: [`JSON 문법 오류: ${err.message}. 쉼표나 따옴표가 빠지지 않았는지 확인해 주세요.`] });
      continue;
    }
    const errors = validateContribution(data, config);
    for (const f of data.futures || []) {
      if (!f || typeof f.id !== 'string') continue;
      if (owner.has(f.id)) errors.push(`id "${f.id}"는 이미 ${owner.get(f.id)}에서 쓰고 있습니다. 다른 id를 골라 주세요.`);
      else owner.set(f.id, file);
    }
    if (errors.length) problems.push({ file, errors });
    else for (const f of data.futures) futures.push({ ...f, author: data.author, file });
  }

  const contributors = [...futures.reduce((m, f) => m.set(f.author, (m.get(f.author) || 0) + 1), new Map())]
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count || a.author.localeCompare(b.author));

  return {
    problems,
    bundle: {
      site: {
        title: site.title,
        repo: process.env.GITHUB_REPOSITORY || site.repo,
        branch: process.env.SITE_BRANCH || site.branch,
      },
      generatedAt: new Date().toISOString(),
      year: config.year,
      conditions: config.conditions,
      presets: config.presets,
      futures,
      contributors,
    },
    fileCount: files.length,
  };
}

async function report(problems) {
  const lines = problems.flatMap(p => [`✖ futures/${p.file}`, ...p.errors.map(e => `   - ${e}`)]);
  console.error(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = ['## 미래 조각 검사에서 고칠 점이 있어요', '',
      ...problems.flatMap(p => [`### \`futures/${p.file}\``, ...p.errors.map(e => `- ${e}`), '']),
      '고친 뒤 다시 커밋하면 검사가 자동으로 다시 돌아갑니다. 형식은 CONTRIBUTING.md를 참고해 주세요.'];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }
}

async function main() {
  const { problems, bundle, fileCount } = await loadModel();
  if (problems.length) {
    await report(problems);
    process.exit(1);
  }
  const summary = `✔ 파일 ${fileCount}개, 미래 조각 ${bundle.futures.length}개, 기여자 ${bundle.contributors.length}명 — 모두 통과`;
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
