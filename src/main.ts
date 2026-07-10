import Phaser from 'phaser';
import { WORLD, PLACEABLES, type PlaceableKey } from './data/balance';
import { WAVES } from './data/waves';
import { Placeable } from './entities/Placeable';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { DraftScene } from './scenes/DraftScene';
import { PauseScene } from './scenes/PauseScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: WORLD.width,
  height: WORLD.height,
  backgroundColor: '#060912',
  // 네온 아레나 아트는 코드 생성 벡터 도형 → 매끈한 안티에일리어싱으로 렌더
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, GameScene, UIScene, DraftScene, PauseScene],
});

// 개발용 디버그 훅 — Chrome DevTools/브라우저 자동화에서 게임 상태를 검사·조작한다.
// getState()로 스냅샷을 읽고, 액션으로 원하는 테스트 상황(자원·웨이브·배치·배속)을 만든다.
// 브라우저 콘솔/자동화 예:
//   __game.addGold(500); __game.place('archer', 1, 0); __game.setWave(5); __game.startWave()
declare global {
  interface Window {
    __game?: {
      game: Phaser.Game;
      /** 현재 GameScene 스냅샷 (없으면 null) */
      getState: () => Record<string, unknown> | null;
      /** 골드 지급 후 잔액 반환 (기본 1000) */
      addGold: (amount?: number) => number | null;
      /** 웨이브 번호(1-based)로 점프 → 새 번호 반환. BUILD 스폰 예고도 갱신 */
      setWave: (n: number) => number | null;
      /** 현재 웨이브 시작 (BUILD에서만) → WAVE 진입 성공 여부 */
      startWave: () => boolean;
      /** 셀(col,row: 코어 기준 오프셋)에 유닛/구조물 무료 배치 → 성공 여부 */
      place: (key: PlaceableKey, col: number, row: number) => boolean;
      /** 전투 배속 설정 (1|2|3) → 적용값 반환 */
      speed: (mult: number) => number | null;
      /** 코어에 피해 → 남은 코어 HP 반환 */
      damageCore: (amount: number) => number | null;
      /** GameScene 재시작 (상태 초기화) */
      restart: () => void;
    };
  }
}

if (import.meta.env.DEV) {
  const scene = () => game.scene.getScene('Game') as GameScene | undefined;
  window.__game = {
    game,
    getState() {
      const s = scene();
      if (!s) return null;
      return {
        phase: s.phase,
        gold: s.gold,
        xp: s.xp,
        wave: s.waveIndex + 1,
        coreHp: Math.ceil(s.coreHp),
        coreMaxHp: s.coreMaxHp,
        gridLevel: s.grid.level,
        placeables: s.placeables.length,
        enemies: s.enemies.length,
        projectiles: s.projectiles.length,
        victory: s.victory,
      };
    },
    addGold(amount = 1000) {
      const s = scene();
      if (!s) return null;
      s.gold += amount;
      return s.gold;
    },
    setWave(n) {
      const s = scene();
      if (!s) return null;
      s.waveIndex = Math.max(0, Math.min(Math.floor(n) - 1, WAVES.length - 1));
      // BUILD 스폰 방향 예고 화살표를 새 웨이브 기준으로 다시 그리게 한다
      (s as unknown as { previewDirty: boolean }).previewDirty = true;
      return s.waveIndex + 1;
    },
    startWave() {
      const s = scene();
      if (!s) return false;
      s.startWave();
      return s.phase === 'WAVE';
    },
    place(key, col, row) {
      const s = scene();
      if (!s || s.phase !== 'BUILD') return false;
      if (!(key in PLACEABLES) || !s.grid.isFree(col, row)) return false;
      // onPointerDown의 배치 로직과 동일 (비용 차감·고스트 UI만 생략)
      const p = new Placeable(s, key, col, row);
      s.grid.occupy(col, row);
      s.placeables.push(p);
      return true;
    },
    speed(mult) {
      const s = scene();
      if (!s) return null;
      // gameSpeed는 update()의 시뮬레이션 dt에 곱해져 전투 진행을 배속한다
      s.gameSpeed = Math.max(1, Math.min(3, Math.round(mult)));
      return s.gameSpeed;
    },
    damageCore(amount) {
      const s = scene();
      if (!s) return null;
      s.damageCore(amount);
      return Math.ceil(s.coreHp);
    },
    restart() {
      scene()?.scene.restart();
    },
  };
}
