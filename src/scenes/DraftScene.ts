import Phaser from 'phaser';
import { WORLD } from '../data/balance';
import { CARDS, CARD_CATEGORY_INFO, type CardKey } from '../data/cards';
import type { GameScene } from './GameScene';

const CARD_W = 300;
const CARD_H = 200;
const CARD_GAP = 26;

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
    this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x000000, 0.6).setInteractive();
    this.add
      .text(cx, cy - 170, '강화 카드 — 하나를 선택하세요', {
        fontSize: '26px',
        color: '#e8e8e8',
        fontFamily: 'sans-serif',
      })
      .setOrigin(0.5);

    const total = this.cards.length * CARD_W + (this.cards.length - 1) * CARD_GAP;
    this.cards.forEach((key, i) => {
      const x = cx - total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      this.drawCard(x, cy + 20, key);
    });
  }

  private drawCard(x: number, y: number, key: CardKey): void {
    const def = CARDS[key];
    const cat = CARD_CATEGORY_INFO[def.category];

    const bg = this.add
      .rectangle(x, y, CARD_W, CARD_H, 0x222833, 1)
      .setStrokeStyle(2, cat.color, 1)
      .setInteractive({ useHandCursor: true });

    // 분류 칩
    this.add.rectangle(x - CARD_W / 2 + 56, y - CARD_H / 2 + 20, 92, 24, cat.color, 0.95);
    this.add
      .text(x - CARD_W / 2 + 56, y - CARD_H / 2 + 20, cat.label, {
        fontSize: '13px',
        color: '#14161c',
        fontFamily: 'sans-serif',
      })
      .setOrigin(0.5);

    this.add
      .text(x, y - 34, def.name, { fontSize: '22px', color: '#ffffff', fontFamily: 'sans-serif' })
      .setOrigin(0.5);
    this.add
      .text(x, y + 40, def.desc, {
        fontSize: '15px',
        color: '#c8c8c8',
        fontFamily: 'sans-serif',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: CARD_W - 36 },
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setStrokeStyle(4, cat.color, 1).setFillStyle(0x2c3442, 1));
    bg.on('pointerout', () => bg.setStrokeStyle(2, cat.color, 1).setFillStyle(0x222833, 1));
    bg.on('pointerdown', () => {
      (this.scene.get('Game') as GameScene).applyCard(key);
      this.scene.stop();
    });
  }
}
