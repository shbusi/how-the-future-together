# 함께 그리는 미래 · How the Future Together

한국어 · [English](#english)

사회의 모든 분야(정치, 경제, 노동, 인권, 기술, 과학, 미디어, 교통, 환경, 에너지, 먹거리, 건강, 복지, 교육, 가족, 인구, 도시, 문화, 평화, 일상)가
1900년부터 2100년까지 어떻게 바뀌어 왔고 바뀌어 갈지를 그리는 웹사이트입니다.
연도를 과거로 옮기면 근거 있는 역사가, 미래로 옮기면 조건(기후 대응, 기술, 연대, 분배, 인구, 국제 관계, 경제 성장)에 따라 갈라지는 미래가 풍경으로 그려집니다.
풍경 속 이야기 하나하나는 사람들이 GitHub로 보탠 **조각**이고, 조각이 쌓일수록 풍경은 더 많은 사람의 상상과 기억을 닮아 갑니다.
화면과 조각은 **한국어, English, 日本語, 简体中文, Español**로 볼 수 있고, 언어는 누구나 늘릴 수 있습니다.

## 어떻게 움직이나요

```
연도 1900 ─────────────── 2026 ──────────────── 2100
      과거: 역사 조각 (하나)   │   미래: 조건에 따라 갈라짐
                                │
 assets/engine.js ──  그 해의 조각을 고르고(futures/*.json, 지역 필터)
        │              과거는 정해진 흐름 + 역사 조각, 미래는 조건 + 미래 조각으로 그림 값을 계산
        ▼
 assets/scene.js  ──  그림 값으로 도시 풍경을 캔버스에 그린다
        │
        ▼
 assets/app.js    ──  제목 · 풍경 묘사 · 조각 카드 · 연표를 locales/<언어>.json으로 보여 준다
```

- **미래 조각**: `futures/` 폴더의 JSON 파일. 누구나 Pull Request로 보탤 수 있습니다. 형식은 [CONTRIBUTING.md](CONTRIBUTING.md).
- **여러 언어**: 브라우저 언어를 따라 자동으로 고르고, 오른쪽 위에서 바꿀 수 있습니다. 조각은 아무 언어로 써도 되고, 번역이 없으면 원문과 **번역하기** 링크가 보입니다.
- **미래 조각 쓰기**: 웹사이트 안의 폼에서 쓰면 바로 풍경에 미리 넣어 볼 수 있고, 버튼 하나로 GitHub Pull Request나 이슈를 엽니다.
- **분야별 연대기**: 20개 분야 × 8개 시대 표. 과거 칸은 실제 역사, 미래 칸은 지금 조건의 미래이고, 빈 칸의 **+**로 바로 조각을 씁니다.
- **지역**: 세계 전체나 한국·일본·유럽·라틴아메리카 같은 지역으로 좁혀 볼 수 있습니다.
- **상상의 지도**와 **언어별 번역 현황**: 아직 비어 있는 미래와 번역을 보여 줘서, 다음 기여자가 빈 곳을 채우게 합니다.
- **채택 자동화**: 아이디어 이슈에 `채택` 라벨을 붙이면 조각 파일이 담긴 Pull Request가 자동으로 열립니다.

## 처음 한 번 해야 하는 설정

1. **`main` 브랜치 만들기**: 웹사이트의 GitHub 링크와 배포가 `main`을 기준으로 합니다.
2. **GitHub Pages 켜기**: Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 바꿉니다.
3. **라벨 만들기**: Issues → Labels에서 `미래 조각 제안`, `의견`, `채택`을 만듭니다.
4. **Actions가 PR을 열 수 있게 하기**: Settings → Actions → General → Workflow permissions에서 **Allow GitHub Actions to create and approve pull requests**를 켭니다.
5. (권장) Settings → Branches에서 `main`에 **미래 조각 검사** 통과를 필수로 겁니다.

## 로컬에서 실행

Node.js 20 이상, 설치할 패키지 없음.

```bash
npm run dev     # 검사 + 빌드 후 http://localhost:4173
npm test        # 엔진, 검사기, 번역 테스트
```

## 폴더 구조

```
index.html                 웹사이트 뼈대 (data-i18n 키로 번역)
assets/engine.js           조건 → 그림 값, 제목·문장 id, 지표, 연표 (Node에서도 테스트)
assets/scene.js            캔버스 풍경 그리기
assets/validate.js         미래 조각 검사기 (빌드, Actions, 웹 폼이 함께 사용)
assets/app.js              화면 연결, 언어 바꾸기, 미래 조각 쓰기 폼, 상상의 지도
config/conditions.json     연도 범위, 시대 구분, 조건 목록, 미리 정해 둔 조건
config/languages.json      지원 언어와 언어별 글꼴
config/domains.json        분야 목록 (번역은 locales/)
config/regions.json        지역 목록과 위아래 관계
locales/<언어>.json         화면 문장, 제목, 풍경 묘사, 오류 문장
futures/*.json             모두가 쓴 미래 조각
scripts/build.mjs          검사 + dist/ 빌드
scripts/issue-to-future.mjs  채택된 이슈 → 조각 파일
.github/                   배포, 검사, 채택 자동화, 이슈·PR 양식
```

---

## English

A website that shows how every field of society has changed since 1900 and could change by 2100.
Move the year into the past to see sourced history; move it into the future and the picture branches with the conditions you choose.
Every story in the picture is a **piece** someone added through GitHub: history pieces with sources, and future pieces that depend on the conditions.
The interface and the pieces are available in **한국어, English, 日本語, 简体中文 and Español**, and anyone can add a language.

- **Future pieces** are JSON files in `futures/`. Anyone can add one by pull request; see [CONTRIBUTING.en.md](CONTRIBUTING.en.md).
- **Languages**: picked from the browser's language and switchable at the top right. Pieces can be written in any language; when a translation is missing, the original text is shown with a **Translate** link.
- **Write a future piece**: a form on the site previews your piece in the picture and opens a GitHub pull request or issue in one click.
- **Chronicle by field**: a table of 20 fields × 8 eras. Past cells hold real history, future cells hold the futures under your conditions, and **+** in an empty cell starts a new piece.
- **Regions**: narrow everything to a region such as Korea, Japan, Europe or Latin America.
- **Map of the imagined** and **Translation progress** show which futures and translations are still empty, so the next contributor can fill them.
- **Accepting ideas**: adding the `채택` label to an idea issue opens a pull request with the piece file automatically.

Setup, local commands and the folder layout are listed in the Korean section above. Run `npm run dev` to try it locally (Node.js 20+, no dependencies).
