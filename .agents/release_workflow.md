# 📦 TW-Overlay 릴리즈 워크플로우

이 문서는 새 버전의 검증, Windows 설치 파일 생성, 태그 및 GitHub Release 배포 절차를 정의합니다.

## 1. 버전 결정

Semantic Versioning 형식 `X.Y.Z`를 사용합니다.

- Major: 기존 버전과 호환되지 않는 변경
- Minor: 하위 호환되는 신규 기능
- Patch: 하위 호환되는 버그 수정

## 2. 버전 및 문서 갱신

- [ ] `package.json`의 `version`을 새 버전으로 변경
- [ ] `src/settings.html`의 앱 정보에 하드코딩된 버전이 있다면 함께 변경
- [ ] `README.md`의 버전과 주요 기능 설명 갱신
- [ ] `release-note/CHANGELOG-vX.X.X.md` 작성
  - `Added`, `Changed`, `Fixed` 기준으로 사용자에게 의미 있는 변경 정리
- [ ] 구조, 개발 규칙 또는 배포 방식이 달라졌다면 `.agents/AGENTS.md` 갱신
- [ ] 기술 스택, 디렉터리 역할 또는 핵심 실행 흐름이 달라졌다면 `.agents/PROJECT_GUIDE.md` 갱신
- [ ] UI 토큰이 달라졌다면 `.agents/DESIGN_TOKENS.md` 갱신

## 3. 의존성 및 검증

PowerShell에서는 아래 명령을 각각 한 줄씩 순서대로 실행합니다.

```powershell
npm ci
npm run typecheck
npm test
npm audit --omit=dev
```

검증 범위:

- `npm run typecheck`
  - 앱 소스 `tsconfig.json`
  - 빌드·테스트 도구 `tsconfig.scripts.json`
- `npm test`
  1. 전체 빌드
  2. `check-refactor-regressions.ts` 정적·기능 회귀 검사
  3. `check-renderer-behavior.ts` Electron DOM 통합 검사
- `npm audit --omit=dev`
  - 실제 설치 패키지에 포함되는 프로덕션 의존성의 알려진 취약점 검사

태그를 생성하기 전에 모든 검사가 통과해야 합니다.

## 4. 빌드 구조

`npm run build`는 다음 순서로 실행됩니다.

1. `npm run build-tools`
   - `scripts/**/*.ts`를 `dist-tools/**/*.js`로 컴파일
2. `node dist-tools/copy-resources.js`
   - 이전 `dist`를 정리
   - HTML, CSS, 정적 에셋과 렌더러 리소스를 복사
3. `tsc`
   - 메인 프로세스, preload, 공통 모듈과 렌더러 TypeScript를 `dist`로 컴파일

직접 작성한 원본 JavaScript는 사용하지 않습니다. `scripts`와 `dist-tools`는 빌드 및 테스트 전용이며 설치 패키지에는 포함되지 않습니다.

## 5. 로컬 설치 파일 검증

```powershell
npm run dist
```

`npm run dist`는 전체 빌드 후 `electron-builder --win`을 실행합니다.

- 결과 경로: `dist_electron`
- 설치 형식: NSIS one-click installer
- 파일명: `twOverlay-Setup-X.Y.Z.exe`
- 패키지 포함 대상:
  - `dist/**/*`
  - `package.json`
  - 런타임 `node_modules/**/*`
- `better-sqlite3`, `koffi` 네이티브 모듈은 ASAR 외부로 풀어 패키징

설치 파일로 다음 항목을 확인합니다.

- [ ] 신규 설치 및 앱 실행
- [ ] 기존 설정·DB를 유지한 업데이트 설치
- [ ] preload 로드 오류와 DevTools 콘솔 오류가 없는지 확인
- [ ] 주요 오버레이, 숙제 체크리스트, 채팅 감지와 계산기 화면 확인
- [ ] 앱 종료 및 자동 업데이트 재시작 확인

## 6. 커밋, 병합 및 태그

```powershell
git status
git add .
git commit -m "chore: release vX.Y.Z"
git checkout main
git merge <작업-브랜치명>
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

- 기존 태그를 재사용하거나 덮어쓰지 않습니다.
- 잘못 생성한 로컬 태그만 삭제해야 할 경우 `git tag -d vX.Y.Z`를 사용합니다.
- 원격 태그 삭제나 재작성은 이미 배포된 업데이트에 영향을 줄 수 있으므로 별도 확인 없이 수행하지 않습니다.

## 7. GitHub Actions 배포

`.github/workflows/build.yml`은 `v*` 태그 푸시로 실행됩니다.

1. Windows runner에서 저장소 체크아웃
2. Node.js 24 설치
3. `npm ci`로 잠금 파일 기준 의존성 설치
4. `npm run typecheck`, `npm test`, `npm audit --omit=dev` 검증
5. GitHub Secrets의 Analytics 값을 `dist/env.json`에 주입
6. `electron-builder --publish never`로 Windows 설치 파일만 생성
7. `softprops/action-gh-release`를 한 번 실행하여 Draft Release 하나를 생성
8. 같은 단계에서 다음 자동 업데이트 파일을 해당 Draft에 일괄 업로드
   - `twOverlay-Setup-X.Y.Z.exe`
   - `twOverlay-Setup-X.Y.Z.exe.blockmap`
   - `latest.yml`

Electron Builder의 GitHub Publisher를 직접 사용하지 않습니다. 설치 파일과 blockmap을 병렬 게시할 때 각각 Draft를 생성하는 경쟁 상태를 막기 위해 패키징과 Release 업로드를 분리합니다.

필요한 GitHub Secrets:

- `GA_MEASUREMENT_ID`
- `GA_API_SECRET`
- `GITHUB_TOKEN`은 Actions에서 자동 제공

Actions가 성공한 뒤 Draft Release가 하나만 생성됐는지, 위 세 파일과 릴리즈 노트가 모두 포함됐는지 확인하고 게시합니다.

## 8. 강제 업데이트

보안 패치, 심각한 장애 수정처럼 모든 사용자가 반드시 설치해야 하는 경우에만 사용합니다.

Draft Release의 제목 또는 본문에 다음 문자열을 추가합니다.

```text
[Mandatory Update]
```

동작:

1. 앱이 Mandatory Update 표시 감지
2. 스플래시 화면 잠금
3. 업데이트 자동 다운로드
4. 다운로드 완료 후 자동 설치 및 재시작

Draft Release를 게시해야 사용자에게 실제로 적용됩니다.
