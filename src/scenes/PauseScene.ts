import Phaser from 'phaser';
import { WAVES } from '../data/waves';
import { PLACEABLE_ORDER, WORLD } from '../data/balance';
import { clearRun } from '../systems/SaveGame';
import { setShakeEnabled, shakeEnabled } from '../systems/Settings';
import { TextButton, UI, panel } from '../systems/ui';
import type { GameScene } from './GameScene';

/** 일시정지 오버레이. Game 씬을 멈추고 메뉴(설정·다시 시작·조작법)를 띄운다. */
export class PauseScene extends Phaser.Scene {
  private soundBtn!: TextButton;
  private shakeBtn!: TextButton;

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

    const pw = 440;
    const ph = 500;
    const top = cy - ph / 2;
    const g = this.add.graphics();
    panel(g, cx - pw / 2, top, pw, ph, { fill: UI.panelFill, fillAlpha: 0.98, border: UI.accent, lineWidth: 2, cut: 20, bracket: true, bracketColor: UI.accent, bracketLen: 24 });
    // 상단 청록 액센트 라인
    g.fillStyle(UI.accent, 0.9);
    g.fillRect(cx - pw / 2 + 26, top + 14, pw - 52, 2);

    this.add
      .text(cx, top + 42, '일시정지', { fontSize: '30px', color: '#eaf6ff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3ff0e0', 10);

    const g_ = this.game_;
    const wave = Math.min(g_.waveIndex + 1, WAVES.length);
    this.add
      .text(cx, top + 78, `웨이브 ${wave}/${WAVES.length}   ·   골드 ${g_.gold}   ·   코어 ${Math.ceil(g_.coreHp)}/${g_.coreMaxHp}`, {
        fontSize: '14px',
        color: UI.textDim,
        fontFamily: UI.FONT,
      })
      .setOrigin(0.5);

    new TextButton(this, cx, top + 124, 300, 50, '계속하기', { variant: 'primary', fontSize: 19, onClick: () => this.resumeGame() });
    new TextButton(this, cx, top + 182, 300, 46, '다시 시작 (새 런)', { variant: 'default', fontSize: 16, onClick: () => this.restartRun() });

    // 설정 토글 — 사운드 · 화면 흔들림 (접근성)
    this.soundBtn = new TextButton(this, cx - 77.5, top + 238, 145, 44, this.soundLabel(), {
      variant: 'default',
      fontSize: 14,
      onClick: () => {
        this.game_.sfx.toggleMuted();
        this.game_.sfx.play('place');
        this.soundBtn.setText(this.soundLabel());
      },
    });
    this.shakeBtn = new TextButton(this, cx + 77.5, top + 238, 145, 44, this.shakeLabel(), {
      variant: 'default',
      fontSize: 14,
      onClick: () => {
        setShakeEnabled(!shakeEnabled());
        this.game_.sfx.play('place');
        this.shakeBtn.setText(this.shakeLabel());
      },
    });

    this.buildVolumeSlider(cx, top + 296);

    new TextButton(this, cx, top + 352, 300, 46, '타이틀로 나가기', { variant: 'danger', fontSize: 16, onClick: () => this.quitToTitle() });

    // 조작법 요약 (온보딩 칩은 첫 웨이브 후 사라지므로 여기서 다시 볼 수 있게)
    g.fillStyle(UI.panelBorder, 0.5);
    g.fillRect(cx - pw / 2 + 40, top + 392, pw - 80, 1);
    this.add
      .text(
        cx,
        top + 428,
        [
          `Space 웨이브 시작  ·  1~${PLACEABLE_ORDER.length} 배치  ·  R 사거리  ·  F 배속`,
          '드래그로 유닛 재배치 (웨이브 사이)  ·  우클릭/ESC 배치 취소',
        ].join('\n'),
        { fontSize: '12.5px', color: UI.textDim, fontFamily: UI.FONT, align: 'center', lineSpacing: 7 },
      )
      .setOrigin(0.5);

    this.add
      .text(cx, top + ph - 26, 'ESC · P 로 계속하기', { fontSize: '13px', color: UI.textDim, fontFamily: UI.FONT })
      .setOrigin(0.5);

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());
  }

  private soundLabel(): string {
    return this.game_.sfx.isMuted() ? '사운드 꺼짐' : '사운드 켜짐';
  }

  private shakeLabel(): string {
    return shakeEnabled() ? '흔들림 켜짐' : '흔들림 꺼짐';
  }

  /** 볼륨 슬라이더 — 드래그로 조절, 놓는 순간 미리듣기. 값은 Sfx가 localStorage에 저장 */
  private buildVolumeSlider(cx: number, y: number): void {
    const sfx = this.game_.sfx;
    const tx = cx - 84; // 트랙 좌단
    const tw = 184;
    this.add.text(cx - 150, y, '볼륨', { fontSize: '14px', color: UI.textDim, fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const g = this.add.graphics();
    const pct = this.add
      .text(cx + 150, y, '', { fontSize: '13px', color: UI.text, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(1, 0.5);

    const draw = () => {
      const v = sfx.getVolume();
      g.clear();
      g.fillStyle(0x15263a, 1);
      g.fillRect(tx, y - 3, tw, 6);
      g.fillStyle(UI.accent, 0.9);
      g.fillRect(tx, y - 3, tw * v, 6);
      g.fillStyle(0xeaf3ff, 1);
      g.fillCircle(tx + tw * v, y, 8);
      g.lineStyle(2, UI.accent, 1);
      g.strokeCircle(tx + tw * v, y, 8);
      pct.setText(`${Math.round(v * 100)}%`);
    };
    draw();

    const zone = this.add.zone(tx + tw / 2, y, tw + 28, 32).setInteractive({ useHandCursor: true });
    let dragging = false;
    const setFrom = (px: number) => {
      sfx.setVolume(Phaser.Math.Clamp((px - tx) / tw, 0, 1));
      draw();
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragging = true;
      setFrom(p.x);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (dragging) setFrom(p.x);
    });
    this.input.on('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      sfx.play('place'); // 조절 결과 미리듣기
    });
  }

  private resumeGame(): void {
    this.scene.get('UI').input.enabled = true;
    this.scene.resume('Game');
    this.scene.stop();
  }

  /** 현재 런을 버리고 처음부터 (저장도 삭제) */
  private restartRun(): void {
    clearRun();
    this.cameras.main.fadeOut(260, 4, 7, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.get('UI').input.enabled = true;
      this.scene.stop('UI');
      this.scene.stop('Game');
      this.scene.start('Game');
      this.scene.stop();
    });
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
