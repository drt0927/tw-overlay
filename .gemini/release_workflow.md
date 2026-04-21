# 📦 TW-Overlay 릴리즈 워크플로우 가이드

이 문서는 새로운 버전을 배포할 때 수행해야 하는 모든 단계(문서 업데이트, 코드 수정, 빌드 및 배포)를 정의합니다.

## 주요 버저닝(Semantic Versioning) 규칙 (X.Y.Z)

### Major(X)
- 기존 버전과 호환되지 않는 수준의 큰 변화, API가 변경될 때 숫자를 올립니다.

### Minor(Y)
- 기존 버전과 호환되면서 새로운 기능이 추가되거나, 하나 이상의 기능이 deprecated(사용 중단)될 때 올립니다.

### Patch(Z)
- 기존 버전과 호환되며 사소한 버그 수정이 있을 때 올립니다.

## 🏁 릴리즈 체크리스트

### 1. 코드 및 버전 정보 수정
- [ ] **package.json**: `version` 필드를 새 버전으로 업데이트.
- [ ] **src/settings.html**: '앱 정보' 섹션의 `현재 버전` 텍스트 업데이트.
- [ ] **빌드 확인**: `npm run build`를 실행하여 컴파일 오류가 없는지 확인.

### 2. 프로젝트 문서 업데이트
- [ ] **.gemini/GEMINI.md**:
    - 새롭게 추가된 주요 로직이나 아키텍처 변경 사항 반영 (예: 빌드 시스템 변경, 스플래시 추가 등).
- [ ] **.gemini/SUMMARY.md**:
    - 프로젝트 요약 정보 최신화.
    - 기능 목록에 새로 추가된 기능 추가.
- [ ] **README.md**:
    - 메인 페이지의 버전 정보 및 최신 기능 소개 업데이트.

### 3. 릴리즈 노트 작성
- [ ] **release-note/CHANGELOG-vX.X.X.md**:
    - 신규 버전 전용 릴리즈 노트 파일 생성.
    - **Added**: 신규 기능.
    - **Changed**: 변경 및 개선 사항.
    - **Fixed**: 버그 수정 내역.

### 4. 배포 및 태깅 (GitHub)
> **⚠️ 주의**: Windows PowerShell 환경에서는 `&&` 연산자가 오류를 발생시킬 수 있으므로, 아래 명령어들을 반드시 **한 줄씩 순차적으로** 실행하세요.

- [ ] **로컬 테스트**: `npm run dist`를 실행하여 생성된 `.exe` 설치 파일로 최종 검증.
- [ ] **Git 스테이징**: `git add .`
- [ ] **Git 커밋**: `git commit -m "chore: release vX.X.X"` (이미 작업 브랜치에서 완료했다면 생략 가능)
- [ ] **Main 브랜치 병합**:
    1. `git checkout main`
    2. `git merge <작업-브랜치명>` (예: `git merge feature/chat-log`)
- [ ] **버전 태그 생성**:
    - 만약 기존에 잘못 생성된 태그가 있다면 삭제: `git tag -d vX.X.X`
    - 신규 태그 생성: `git tag vX.X.X`
- [ ] **원격 푸시**: `git push origin main --tags`
    - 이 명령이 실행되면 GitHub Actions가 자동으로 빌드 및 드래프트 릴리즈를 생성합니다.

---
