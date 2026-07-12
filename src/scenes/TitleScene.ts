import Phaser from 'phaser';
import { PLACEABLE_ORDER, WORLD } from '../data/balance';
import { clearRun, loadBest, loadRun } from '../systems/SaveGame';
import { TextButton, UI, panel } from '../systems/ui';

const VERSION = 'v0.5.0';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    this.cameras.main.fadeIn(400, 4, 7, 14);

    // 배경 (게임과 같은 아레나 톤) + 떠다니는 발광 먼지
    this.add.image(cx, cy, 'bg').setDepth(-1);
    this.add
      .particles(0, 0, 'spark', {
        x: { min: 0, max: WORLD.width },
        y: { min: 0, max: WORLD.height },
        speedY: { min: -16, max: -5 },
        speedX: { min: -6, max: 6 },
        tint: [0x3ff0e0, 0x4aa8ff, 0x8fd8ff],
        blendMode: 'ADD',
        scale: { start: 0.14, end: 0 },
        alpha: { start: 0.45, end: 0 },
        lifespan: 6000,
        frequency: 160,
      })
      .setDepth(0);

    // 발광 코어 아이콘 + 맥동 (위에서 떨어지며 등장)
    const core = this.add.image(cx, cy - 210, 'core').setScale(0.62).setAlpha(0);
    this.tweens.add({ targets: core, y: cy - 190, alpha: 1, duration: 500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: core, scale: 0.68, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 500 });

    // 타이틀 (글로우 레이어 + 본체)
    const titleStyle = { fontSize: '58px', color: '#eafcff', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' };
    const titleGlow = this.add
      .text(cx, cy - 108, 'WAVE DEFENCE', { ...titleStyle, color: '#3ff0e0' })
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setLetterSpacing(6)
      .setAlpha(0);
    const title = this.add
      .text(cx, cy - 108, 'WAVE DEFENCE', titleStyle)
      .setOrigin(0.5)
      .setShadow(0, 0, '#3ff0e0', 18)
      .setLetterSpacing(6)
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, y: cy - 100, duration: 500, delay: 150, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: titleGlow, alpha: 0.2, y: cy - 100, duration: 500, delay: 150, ease: 'Cubic.easeOut' });
    // 등장 후 글로우 호흡 (0.2 ↔ 0.38)
    this.tweens.add({ targets: titleGlow, alpha: 0.38, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 750 });

    const version = this.add
      .text(cx, cy - 56, VERSION, { fontSize: '15px', color: UI.textDim, fontFamily: UI.FONT_DISPLAY })
      .setOrigin(0.5)
      .setLetterSpacing(2)
      .setAlpha(0);
    this.tweens.add({ targets: version, alpha: 1, duration: 400, delay: 350 });

    // 최고 기록 (localStorage)
    const best = loadBest();
    if (best) {
      const bestText = this.add
        .text(cx, cy - 34, `최고 기록 — ${best.victory ? '전 웨이브 클리어!' : `WAVE ${best.reached} 도달`}`, {
          fontSize: '13px',
          color: UI.gold,
          fontFamily: UI.FONT,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.tweens.add({ targets: bestText, alpha: 1, duration: 400, delay: 400 });
    }

    const intro = this.add
      .text(
        cx,
        cy + 4,
        [
          '중앙의 코어를 지키세요. 웨이브 사이에 그리드 위에 유닛과 구조물을 배치합니다.',
          '적을 처치하면 골드와 XP를 얻고, 레벨업하면 배치 그리드가 넓어집니다.',
        ].join('\n'),
        { fontSize: '16px', color: '#b7c4da', fontFamily: UI.FONT, align: 'center', lineSpacing: 7 },
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: intro, alpha: 1, y: cy - 2, duration: 400, delay: 450, ease: 'Cubic.easeOut' });

    // 조작법 패널
    const ctrlW = 620;
    const ctrlH = 78;
    const ctrlY = cy + 86;
    const ctrlG = this.add.graphics().setAlpha(0);
    panel(ctrlG, cx - ctrlW / 2, ctrlY - ctrlH / 2, ctrlW, ctrlH, {
      fill: 0x0a1526,
      fillAlpha: 0.88,
      border: UI.panelBorder,
      borderAlpha: 0.9,
      cut: 12,
      lineWidth: 1.5,
    });
    const ctrlTitle = this.add
      .text(cx - ctrlW / 2 + 22, ctrlY - ctrlH / 2 + 1, ' 조작 ', { fontSize: '12px', color: UI.accentText, fontFamily: UI.FONT, fontStyle: 'bold', backgroundColor: '#0a1526' })
      .setOrigin(0, 0.5)
      .setAlpha(0);
    const ctrlText = this.add
      .text(
        cx,
        ctrlY + 2,
        [
          `배치: 하단 버튼 또는 1~${PLACEABLE_ORDER.length} 키 → 그리드 클릭  ·  우클릭/ESC 취소`,
          'Space 웨이브 시작  ·  유닛 재배치: 웨이브 사이 드래그  ·  R 사거리  ·  F 배속  ·  ESC/P 일시정지',
        ].join('\n'),
        { fontSize: '14px', color: '#9fb2cc', fontFamily: UI.FONT, align: 'center', lineSpacing: 8 },
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: [ctrlG, ctrlTitle, ctrlText], alpha: 1, duration: 400, delay: 550 });

    // 시작 버튼 (마지막 등장). 저장된 런이 있으면 이어하기 + 새 게임 2버튼
    const go = (data?: { continue: boolean }) => {
      this.cameras.main.fadeOut(280, 4, 7, 14);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Game', data));
    };
    const save = loadRun();
    const buttons: TextButton[] = [];
    if (save) {
      buttons.push(
        new TextButton(this, cx - 125, cy + 186, 235, 58, `이어하기 (WAVE ${save.waveIndex + 1})`, {
          variant: 'primary',
          fontSize: 19,
          onClick: () => go({ continue: true }),
        }),
        new TextButton(this, cx + 125, cy + 186, 235, 58, '새 게임', {
          variant: 'default',
          fontSize: 19,
          onClick: () => {
            clearRun();
            go();
          },
        }),
      );
    } else {
      buttons.push(
        new TextButton(this, cx, cy + 186, 240, 58, '게임 시작', {
          variant: 'primary',
          fontSize: 23,
          onClick: () => go(),
        }),
      );
    }
    for (const btn of buttons) {
      btn.setAlpha(0);
      this.tweens.addCounter({ from: 0, to: 1, duration: 320, delay: 700, onUpdate: (tw) => btn.setAlpha(tw.getValue() ?? 1) });
    }
  }
}
