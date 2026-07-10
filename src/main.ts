import Phaser from 'phaser';
import { WORLD } from './data/balance';
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

// 개발용 디버그 훅 — Chrome DevTools/자동화에서 게임 상태를 프로그램적으로 검사한다.
// window.__game.getState() 로 현재 GameScene 스냅샷을, window.__game.game 으로 인스턴스에 접근.
declare global {
  interface Window {
    __game?: {
      game: Phaser.Game;
      getState: () => Record<string, unknown> | null;
    };
  }
}

if (import.meta.env.DEV) {
  window.__game = {
    game,
    getState() {
      const s = game.scene.getScene('Game') as GameScene | undefined;
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
  };
}
