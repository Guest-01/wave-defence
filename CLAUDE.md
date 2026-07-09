# Wave Defence

2D 웨이브 디펜스 브라우저 게임. Phaser 4 + TypeScript + Vite.

## 기획 문서

`docs/game-design.md` — 기술 스택, 게임 기획, 수치 테이블, UX, 마일스톤, 용어 사전.
기획이 바뀌면 이 문서를 먼저 갱신한 뒤 코드를 수정한다.

## 명령어

- `npm run dev` — 개발 서버 (실행 검증은 사용자가 직접 한다)
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — 타입체크 + 프로덕션 빌드

## 규칙

- 밸런스 수치는 `src/data/balance.ts`, `src/data/waves.ts`에만 둔다. 씬·엔티티 코드에 하드코딩 금지
- 한글 기획 용어 ↔ 코드 식별자 매핑은 기획 문서 7장(용어 사전)을 따른다
- 기능 구현 후 서버를 직접 실행해 검증하지 않는다. typecheck/build까지만 하고 확인 방법을 안내한다

## 코드 구조

- `src/main.ts` — Phaser Game 설정, 씬 등록
- `src/data/` — 밸런스·웨이브 데이터 테이블
- `src/scenes/` — Boot / Title / Game(BUILD⇄WAVE 상태 머신) / UI(HUD, Game 위 병렬 실행)
- `src/entities/` — Enemy(자폭형/공격형), Placeable(유닛/구조물 공통)
- `src/systems/Grid.ts` — 셀↔월드 좌표, 점유 관리, 레벨 확장
