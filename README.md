# 함께 그리는 미래 · How the Future Together

조건을 고르면 그 미래의 풍경이 자동으로 그려지는 웹사이트입니다.
풍경 속 이야기 하나하나는 사람들이 GitHub로 보탠 **미래 조각**이고, 조각이 쌓일수록 풍경은 더 많은 사람의 상상을 닮아 갑니다.

## 어떻게 움직이나요

```
조건 (연도, 기후 대응, 기술 발전, 사회적 연대, 부의 분배, 인구 변화)
        │
        ▼
 assets/engine.js ──  조건에 맞는 미래 조각을 고르고(futures/*.json)
        │              조건 + 조각으로 그림 값(해수면, 초록, 격차 ...)을 계산
        ▼
 assets/scene.js  ──  그림 값으로 도시 풍경을 캔버스에 그린다
        │
        ▼
 제목 · 풍경 묘사 · 지표 · 조각 카드 · 연표 · 상상의 지도
```

- **미래 조각**: `futures/` 폴더의 JSON 파일. 누구나 Pull Request로 보탤 수 있습니다. 형식은 [CONTRIBUTING.md](CONTRIBUTING.md).
- **미래 조각 쓰기**: 웹사이트 안의 폼에서 조각을 쓰면 바로 풍경에 미리 넣어 볼 수 있고, 버튼 하나로 GitHub Pull Request나 이슈를 엽니다.
- **상상의 지도**: 아직 아무도 그리지 않은 조건 조합을 보여 줘서, 다음 기여자가 빈 곳을 채우게 합니다.
- **채택 자동화**: 아이디어 이슈에 `채택` 라벨을 붙이면 조각 파일이 담긴 Pull Request가 자동으로 열립니다.

## 처음 한 번 해야 하는 설정

1. **`main` 브랜치 만들기**: 웹사이트의 GitHub 링크와 배포가 `main`을 기준으로 합니다.
2. **GitHub Pages 켜기**: Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 바꿉니다.
   이후 `main`에 합쳐질 때마다 자동으로 배포됩니다. 주소는 `https://<아이디>.github.io/how-the-future-together/` 입니다.
3. **라벨 만들기**: Issues → Labels에서 `미래 조각 제안`, `의견`, `채택`을 만듭니다.
4. **Actions가 PR을 열 수 있게 하기**: Settings → Actions → General → Workflow permissions에서
   **Allow GitHub Actions to create and approve pull requests**를 켭니다. (채택 자동화용)
5. (권장) Settings → Branches에서 `main`에 규칙을 걸어 **미래 조각 검사** 통과를 필수로 합니다.

## 로컬에서 실행

Node.js 20 이상, 설치할 패키지 없음.

```bash
npm run dev     # 검사 + 빌드 후 http://localhost:4173
npm test        # 엔진·검사기 테스트
```

## 폴더 구조

```
index.html               웹사이트 뼈대
assets/engine.js         조건 → 그림 값, 풍경 묘사, 지표, 연표 (DOM 없음, Node에서도 테스트)
assets/scene.js          캔버스 풍경 그리기
assets/validate.js       미래 조각 검사기 (빌드, Actions, 웹 폼이 함께 사용)
assets/app.js            화면 연결, 미래 조각 쓰기 폼, 상상의 지도
config/conditions.json   조건 목록과 미리 정해 둔 조건
futures/*.json           모두가 쓴 미래 조각
scripts/build.mjs        검사 + dist/ 빌드
scripts/issue-to-future.mjs  채택된 이슈 → 조각 파일
.github/                 배포, 검사, 채택 자동화, 이슈·PR 양식
```
