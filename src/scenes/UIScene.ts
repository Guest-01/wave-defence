import Phaser from 'phaser';
import { ENEMIES, PLACEABLES, PLACEABLE_ORDER, WORLD, type PlaceableKey } from '../data/balance';
import { DIRECTION_KO, WAVES } from '../data/waves';
import type { GameScene } from './GameScene';

interface BarButton {
  key: PlaceableKey;
  bg: Phaser.GameObjects.Rectangle;
  txt: Phaser.GameObjects.Text;
}

const TEXT_STYLE = { fontSize: '16px', color: '#e8e8e8', fontFamily: 'sans-serif' };

/** HUD. GameScene 위에 병렬 실행되며 매 프레임 GameScene 상태를 읽어 갱신한다. */
export class UIScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private previewText!: Phaser.GameObjects.Text;
  private buttons: BarButton[] = [];
  private startBg!: Phaser.GameObjects.Rectangle;
  private startTxt!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private ended = false;

  constructor() {
    super('UI');
  }

  private get game_(): GameScene {
    return this.scene.get('Game') as GameScene;
  }

  create(): void {
    this.buttons = [];
    this.overlay = [];
    this.ended = false;

    // 상단 바
    this.add.rectangle(WORLD.width / 2, 26, WORLD.width, 52, 0x000000, 0.45);
    this.hpText = this.add.text(16, 8, '', TEXT_STYLE);
    this.levelText = this.add.text(16, 30, '', TEXT_STYLE);
    this.waveText = this.add.text(WORLD.width / 2, 8, '', TEXT_STYLE).setOrigin(0.5, 0);
    this.goldText = this.add.text(WORLD.width - 16, 8, '', TEXT_STYLE).setOrigin(1, 0);
    this.previewText = this.add
      .text(WORLD.width / 2, 30, '', { ...TEXT_STYLE, color: '#f0c674' })
      .setOrigin(0.5, 0);

    // 하단 배치 바
    const barY = WORLD.height - 34;
    let x = 16;
    for (const key of PLACEABLE_ORDER) {
      const def = PLACEABLES[key];
      const w = 120;
      const bg = this.add
        .rectangle(x, barY, w, 48, 0x222833, 0.9)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, def.color, 0.9)
        .setInteractive({ useHandCursor: true });
      const txt = this.add
        .text(x + w / 2, barY, `${def.name}\n${def.cost}G`, { ...TEXT_STYLE, fontSize: '14px', align: 'center' })
        .setOrigin(0.5);
      bg.on('pointerdown', () => this.game_.enterPlacement(key));
      this.buttons.push({ key, bg, txt });
      x += w + 10;
    }

    // 웨이브 시작 버튼
    this.startBg = this.add
      .rectangle(WORLD.width - 16, barY, 170, 48, 0x2f6b3a, 1)
      .setOrigin(1, 0.5)
      .setStrokeStyle(2, 0x7ee0a3, 1)
      .setInteractive({ useHandCursor: true });
    this.startTxt = this.add
      .text(WORLD.width - 16 - 85, barY, '▶ 웨이브 시작', { ...TEXT_STYLE, fontSize: '18px' })
      .setOrigin(0.5);
    this.startBg.on('pointerdown', () => this.game_.startWave());
  }

  update(): void {
    const g = this.game_;
    if (!g || !g.scene.isActive()) return;

    this.hpText.setText(`♥ 코어 ${Math.ceil(g.coreHp)}/${g.coreMaxHp}`);
    this.goldText.setText(`골드 ${g.gold}G`);
    this.waveText.setText(`웨이브 ${Math.min(g.waveIndex + 1, WAVES.length)}/${WAVES.length}`);

    const next = g.nextXpThreshold();
    this.levelText.setText(next === null ? `Lv.${g.grid.level} (최대)` : `Lv.${g.grid.level}  XP ${g.xp}/${next}`);

    const isBuild = g.phase === 'BUILD';
    for (const b of this.buttons) {
      const affordable = g.gold >= PLACEABLES[b.key].cost;
      b.bg.setVisible(isBuild).setAlpha(affordable ? 1 : 0.4);
      b.txt.setVisible(isBuild).setAlpha(affordable ? 1 : 0.4);
    }
    this.startBg.setVisible(isBuild);
    this.startTxt.setVisible(isBuild);

    // 다음 웨이브 예고 (완전 정보 공개)
    const wave = WAVES[g.waveIndex];
    if (isBuild && wave) {
      const parts = wave.groups.map(
        (gr) => `${ENEMIES[gr.enemy].name}×${gr.count} (${DIRECTION_KO[gr.direction]})`,
      );
      this.previewText.setText(`다음 웨이브: ${parts.join(' · ')}`);
    } else {
      this.previewText.setText('');
    }

    if (g.phase === 'END' && !this.ended) {
      this.ended = true;
      this.showResult(g.victory);
    }
  }

  private showResult(victory: boolean): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    this.overlay.push(this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x000000, 0.65));
    this.overlay.push(
      this.add
        .text(cx, cy - 60, victory ? '승리!' : '코어 파괴됨…', {
          fontSize: '48px',
          color: victory ? '#7ee0a3' : '#e05555',
          fontFamily: 'sans-serif',
        })
        .setOrigin(0.5),
    );
    this.overlay.push(
      this.add
        .text(cx, cy - 10, victory ? '20번의 웨이브를 모두 막아내고 코어를 지켜냈습니다!' : '다시 도전해 보세요.', {
          ...TEXT_STYLE,
          fontSize: '18px',
        })
        .setOrigin(0.5),
    );
    const btn = this.add
      .rectangle(cx, cy + 60, 200, 52, 0x2f6b3a, 1)
      .setStrokeStyle(2, 0x7ee0a3, 1)
      .setInteractive({ useHandCursor: true });
    this.overlay.push(btn);
    this.overlay.push(
      this.add.text(cx, cy + 60, '타이틀로', { ...TEXT_STYLE, fontSize: '20px' }).setOrigin(0.5),
    );
    btn.on('pointerdown', () => {
      this.scene.stop('Game');
      this.scene.start('Title');
    });
  }
}
