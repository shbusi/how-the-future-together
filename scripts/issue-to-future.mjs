// "채택" 라벨이 붙은 이슈의 본문에서 미래 조각 JSON을 꺼내 futures/ 파일로 만든다.
// GitHub Actions(.github/workflows/issue-to-pr.yml)가 실행한다.
//   ISSUE_BODY, ISSUE_NUMBER, ISSUE_AUTHOR 환경 변수를 읽는다.
import { readFile, writeFile, appendFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContribution } from '../assets/validate.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function futureFromIssue(body, author, config) {
  const section = body.split(/^###\s+/m).find(s => s.startsWith('미래 조각 JSON'));
  const raw = section?.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? section?.replace(/^미래 조각 JSON\s*/, '');
  if (!raw || !raw.trim() || raw.trim() === '_No response_') {
    return { errors: ['이슈에 "미래 조각 JSON"이 없습니다. 웹사이트의 "미래 조각 쓰기"에서 만든 JSON을 붙여 주세요.'] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { errors: [`JSON을 읽지 못했습니다: ${err.message}`] };
  }
  // 이슈를 연 사람을 작성자로 기록한다.
  const contribution = { author, futures: data.futures };
  return { contribution, errors: validateContribution(contribution, config) };
}

async function main() {
  const { ISSUE_BODY = '', ISSUE_NUMBER, ISSUE_AUTHOR } = process.env;
  const config = JSON.parse(await readFile(join(root, 'config/conditions.json'), 'utf8'));
  const { contribution, errors } = futureFromIssue(ISSUE_BODY, ISSUE_AUTHOR, config);

  if (contribution && !errors.length) {
    const taken = new Set();
    for (const file of (await readdir(join(root, 'futures'))).filter(f => f.endsWith('.json'))) {
      const data = JSON.parse(await readFile(join(root, 'futures', file), 'utf8'));
      for (const f of data.futures || []) taken.add(f.id);
    }
    for (const f of contribution.futures) if (taken.has(f.id)) errors.push(`id "${f.id}"는 이미 쓰이고 있습니다.`);
  }
  if (errors.length) {
    const msg = errors.map(e => `- ${e}`).join('\n');
    console.error(msg);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `errors<<EOF\n${msg}\nEOF\n`);
    process.exit(1);
  }
  const file = `futures/issue-${ISSUE_NUMBER}-${ISSUE_AUTHOR.toLowerCase()}.json`;
  await writeFile(join(root, file), `${JSON.stringify(contribution, null, 2)}\n`);
  console.log(`✔ ${file}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `file=${file}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
