import Phaser from 'phaser';
import { WAVES } from '../data/waves';
import { WORLD } from '../data/balance';
import { TextButton, UI, panel } from '../systems/ui';
import type { GameScene } from './GameScene';

/** 일시정지 오버레이. Game 씬을 멈추고 메뉴를 띄운다. */
export class PauseScene extends Phaser.Scene {
  private soundBtn!: TextButton;

  constructor() {
    super('Pause');
  }

  private get game_(): GameScene {
    return this.scene.get('Game') as GameScene;
  }

  create(): void {
    // Game 정지 + 아래 HUD 입력 차단
    this.scene.pause('Game');
    this.scene.get('UI').input.enabled = false;

    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    // 오버레이 전체 페이드인
    this.cameras.main.setAlpha(0);
    this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 160, ease: 'Sine.easeOut' });

    // 딤 배경 (클릭 차단)
    this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x05070e, 0.72).setInteractive();

    const pw = 400;
    const ph = 360;
    const g = this.add.graphics();
    panel(g, cx - pw / 2, cy - ph / 2, pw, ph, { fill: UI.panelFill, fillAlpha: 0.98, border: UI.accent, lineWidth: 2, cut: 20, bracket: true, bracketColor: UI.accent, bracketLen: 24 });
    // 상단 청록 액센트 라인
    g.fillStyle(UI.accent, 0.9);
    g.fillRect(cx - pw / 2 + 26, cy - ph / 2 + 14, pw - 52, 2);

    this.add
      .text(cx, cy - ph / 2 + 44, '일시정지', { fontSize: '32px', color: '#eaf6ff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3ff0e0', 10);

    const g_ = this.game_;
    const wave = Math.min(g_.waveIndex + 1, WAVES.length);
    this.add
      .text(cx, cy - ph / 2 + 84, `웨이브 ${wave}/${WAVES.length}   ·   골드 ${g_.gold}   ·   코어 ${Math.ceil(g_.coreHp)}/${g_.coreMaxHp}`, {
        fontSize: '15px',
        color: UI.textDim,
        fontFamily: UI.FONT,
      })
      .setOrigin(0.5);

    const bx = cx;
    let by = cy - 24;
    new TextButton(this, bx, by, 260, 52, '계속하기', { variant: 'primary', fontSize: 20, onClick: () => this.resumeGame() });
    by += 66;
    this.soundBtn = new TextButton(this, bx, by, 260, 52, this.soundLabel(), {
      variant: 'default',
      fontSize: 18,
      onClick: () => {
        this.game_.sfx.toggleMuted();
        this.game_.sfx.play('place');
        this.soundBtn.setText(this.soundLabel());
      },
    });
    by += 66;
    new TextButton(this, bx, by, 260, 52, '타이틀로 나가기', { variant: 'danger', fontSize: 18, onClick: () => this.quitToTitle() });

    this.add
      .text(cx, cy + ph / 2 - 26, 'ESC · P 로 계속하기', { fontSize: '13px', color: UI.textDim, fontFamily: UI.FONT })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());
  }

  private soundLabel(): string {
    return this.game_.sfx.isMuted() ? '사운드: 꺼짐' : '사운드: 켜짐';
  }

  private resumeGame(): void {
    this.scene.get('UI').input.enabled = true;
    this.scene.resume('Game');
    this.scene.stop();
  }

  private quitToTitle(): void {
    this.cameras.main.fadeOut(260, 4, 7, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.get('UI').input.enabled = true;
      this.scene.stop('Game');
      this.scene.stop('UI');
      this.scene.start('Title');
      this.scene.stop();
    });
  }
}
