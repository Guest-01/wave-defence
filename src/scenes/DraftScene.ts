import Phaser from 'phaser';
import { WORLD } from '../data/balance';
import { CARDS, CARD_CATEGORY_INFO, type CardKey } from '../data/cards';
import { UI, chamfer, panel } from '../systems/ui';
import type { GameScene } from './GameScene';

const CARD_W = 300;
const CARD_H = 210;
const CARD_GAP = 28;

/** 웨이브 클리어 후 3택1 드래프트 오버레이 */
export class DraftScene extends Phaser.Scene {
  private cards: CardKey[] = [];

  constructor() {
    super('Draft');
  }

  init(data: { cards: CardKey[] }): void {
    this.cards = data.cards ?? [];
  }

  create(): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    // 아래 씬 클릭 차단용 딤 배경
    this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x05070e, 0.68).setInteractive();
    this.add
      .text(cx, cy - 176, '강화 카드', { fontSize: '15px', color: UI.accentText, fontFamily: UI.FONT })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 150, '하나를 선택하세요', { fontSize: '26px', color: '#eaf2ff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5);

    const total = this.cards.length * CARD_W + (this.cards.length - 1) * CARD_GAP;
    this.cards.forEach((key, i) => {
      const x = cx - total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      this.drawCard(x, cy + 28, key);
    });
  }

  private drawCard(x: number, y: number, key: CardKey): void {
    const def = CARDS[key];
    const cat = CARD_CATEGORY_INFO[def.category];
    const left = x - CARD_W / 2;
    const top = y - CARD_H / 2;

    const gfx = this.add.graphics();
    const draw = (hover: boolean) => {
      gfx.clear();
      panel(gfx, left, top, CARD_W, CARD_H, {
        fill: hover ? UI.panelHover : UI.panelFill,
        fillAlpha: 0.98,
        border: cat.color,
        borderAlpha: 1,
        lineWidth: hover ? 3 : 2,
        cut: 16,
        bracket: true,
        bracketColor: cat.color,
        bracketLen: hover ? 24 : 18,
      });
      // 상단 분류 액센트 라인
      gfx.fillStyle(cat.color, hover ? 1 : 0.85);
      gfx.fillRect(left + 20, top + 12, CARD_W - 40, 2);
    };
    draw(false);

    // 분류 칩 (잘린 모서리)
    const chip = this.add.graphics();
    chip.fillStyle(cat.color, 0.95);
    chip.fillPoints(chamfer(left + 20, top + 22, 98, 26, 8), true);
    this.add
      .text(left + 20 + 49, top + 22 + 13, cat.label, { fontSize: '13px', color: '#0b1018', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5);

    this.add
      .text(x, y - 30, def.name, { fontSize: '23px', color: '#ffffff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(x, y + 46, def.desc, {
        fontSize: '15px',
        color: '#c2cee0',
        fontFamily: UI.FONT,
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: CARD_W - 40 },
      })
      .setOrigin(0.5);

    const zone = this.add.zone(x, y, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      (this.scene.get('Game') as GameScene).applyCard(key);
      this.scene.stop();
    });
  }
}
