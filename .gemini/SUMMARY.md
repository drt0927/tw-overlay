# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.1.0)

이 문서는 지능형 버프 매니저 및 사용자 프리셋 기능이 도입된 v1.1.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, GitHub Actions 기반 CI/CD.
- **주요 개선:** 대화면 버프 매니저 구축, 스마트 도핑 계산기, 사용자 정의 프리셋 시스템.

## 2. 주요 기능 명세
- **Buff Manager & Calculator:** 공식 가이드 기반의 버프 백과사전. 선택한 버프들의 대미지, 능력치, 경험치, 레어 확률 등을 실시간으로 합산.
- **Smart Checklist:** 상호 배타적인 버프(중복 사용 불가)를 자동으로 감지하여 비활성화하는 지능형 로직.
- **Custom Presets:** 사용자가 자주 사용하는 도핑 조합을 이름과 함께 저장하고 원클릭으로 불러오는 개인화 기능.
- **Performance Booster:** 게임 프로세스(`InphaseNXD`) 감지 시 CPU 우선순위를 '높음'으로 설정하여 프레임 안정성 확보.
- **Magnet Tracking:** 게임 창 좌표를 실시간 추적하여 사이드바와 오버레이를 유동적으로 동기화.

## 3. 기술 스택 및 구조
- **Language:** TypeScript.
- **Frontend:** HTML5, Tailwind CSS, Local JS Assets (Lucide, Tailwind).
- **Backend:** Node.js (Main), PowerShell (Tracking Service & Process Priority).
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (Node 기반 리소스 통합).
2. **배포:** `npm run dist` (GitHub 배포 설정 및 설치본 생성).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

## 5. 업데이트 히스토리 (v1.1.0 핵심)
- **신규:** 1000px 대화면 기반의 지능형 버프 매니저 창 추가.
- **프리셋:** 기본 국룰 도핑 세트 및 사용자 정의 프리셋 저장 기능 도입.
- **데이터:** 최신 이벤트 버프 및 등급별 버프(스승의 증표 등) 정밀 데이터화.
- **UX:** 폰트 크기 상향 및 드래그 핸들 가시성 개선으로 고해상도 환경 대응.
