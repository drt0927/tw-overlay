# TalesWeaver Companion Browser (TW-Overlay) 최종 프로젝트 가이드

이 문서는 TypeScript 전환 및 4분할 창 시스템이 적용된 v1.0.6 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버(InphaseNXD.exe) 전용 지능형 오버레이 브라우저.
- **최종 빌드:** **TypeScript**, Electron, 윈도우용 NSIS 설치형(.exe).
- **UI/UX:** 1000px 와이드 대시보드, 자석형 사이드바 위젯, 보라색 하이테크 테마.

## 2. 주요 기능 명세
- **Magnet Tracking (Fixed):** 1.0.4의 안정적인 좌표 계산 로직을 TS로 완벽 이식하여 게임 창 우측 바깥에 상시 고정.
- **Independent Windows:** 메인(사이드바), 오버레이, 설정, 갤러리를 각각의 창으로 관리하여 메모리 및 성능 최적화.
- **Smart Notification:** 키워드 필터링이 적용된 갤러리 모니터링 및 실시간 댓글 변화 감지.
- **Advanced Dashboard:** 무한 스크롤 아이콘 피커, 드래그 앤 드롭 퀵슬롯 편집, 자동 실행 설정.
- **Robustness:** PowerShell 프로세스 자동 복구 및 네트워크 상태 실시간 피드백.

## 3. 기술 스택 및 구조
- **Language:** TypeScript (TSConfig 기반 빌드).
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (통합 style.css 관리).
- **Backend:** Node.js (Electron Main), PowerShell (Window Tracking).
- **Storage:** `positions` 객체 중심의 계층형 설정 저장 구조.

## 4. 실행 가이드
1. **빌드:** `npm run build` (TS 컴파일 및 리소스 통합).
2. **실행:** `npm start` (자석 기능 및 전체 모듈 활성화).
3. **디버그:** `npm run dev` (모든 창의 개발자 도구 자동 호출).

## 5. 업데이트 히스토리 (v1.0.6 핵심)
- **배포 프로세스 정상화.**
- **안정화된 TypeScript 빌드 기반.**
- **문서 최신화 및 릴리즈 무결성 확보.**
