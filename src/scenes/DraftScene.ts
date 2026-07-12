import Phaser from 'phaser';
import { WORLD } from '../data/balance';
import { CARDS, CARD_CATEGORY_INFO, DRAFT, type CardKey } from '../data/cards';
import { TextButton, UI, chamfer, panel } from '../systems/ui';
import type { GameScene } from './GameScene';

const CARD_W = 300;
const CARD_H = 240;
const CARD_GAP = 28;

/** 웨이브 클리어 후 3택1 드래프트 오버레이 — 순차 등장 · 호버 리프트 · 선택 연출 · 리롤/스킵 */
export class DraftScene extends Phaser.Scene {
  private cards: CardKey[] = [];
  private picked = false;
  private rerolled = false;
  private actionBtns: TextButton[] = [];

  constructor() {
    super('Draft');
  }

  init(data: { cards: CardKey[]; rerolled?: boolean }): void {
    this.cards = data.cards ?? [];
    this.rerolled = data.rerolled ?? false;
  }

  private get game_(): GameScene {
    return this.scene.get('Game') as GameScene;
  }

  create(): void {
    this.picked = false;
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    // 아래 씬 클릭 차단용 딤 배경 (페이드인)
    const dim = this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x05070e, 0.68).setInteractive().setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 220, ease: 'Sine.easeOut' });

    // 현재 코어 HP·골드 칩 — 딤에 가려진 HUD 대신 즉발 카드(응급 수리 vs 군자금)의 판단 근거
    this.buildStatusChip(cx);

    const eyebrow = this.add
      .text(cx, cy - 176, 'REWARD DRAFT', { fontSize: '15px', color: UI.accentText, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const title = this.add
      .text(cx, cy - 150, '강화 카드 — 하나를 선택하세요', { fontSize: '26px', color: '#eaf2ff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: [eyebrow, title], alpha: 1, y: '-=8', duration: 300, delay: 120, ease: 'Cubic.easeOut' });

    const total = this.cards.length * CARD_W + (this.cards.length - 1) * CARD_GAP;
    const containers = this.cards.map((key, i) => {
      const x = cx - total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      return this.buildCard(x, cy + 40, key);
    });

    // 순차 딜 인 (아래에서 떠오르며 등장)
    containers.forEach((c, i) => {
      this.tweens.add({
        targets: c,
        alpha: 1,
        y: c.y - 46,
        duration: 340,
        delay: 180 + i * 100,
        ease: 'Back.easeOut',
      });
    });
    this.game_.sfx.play('cardDeal');

    this.buildActions(cx, cy + 156);
  }

  /** 하단 액션 — 다시 뽑기(제시당 1회, 골드 소모) · 건너뛰기(+골드) */
  private buildActions(cx: number, y: number): void {
    const g = this.game_;
    const reroll = new TextButton(this, cx - 128, y, 236, 40, `↻ 다시 뽑기    ${DRAFT.rerollCost} G`, {
      variant: 'default',
      fontSize: 14,
      onClick: () => {
        if (this.picked) return;
        const offer = g.rerollDraft(this.cards);
        if (offer) this.scene.restart({ cards: offer, rerolled: true });
      },
    });
    if (this.rerolled || g.gold < DRAFT.rerollCost) reroll.setEnabled(false);
    if (this.rerolled) reroll.setText('↻ 다시 뽑기 완료');

    const skip = new TextButton(this, cx + 128, y, 236, 40, `건너뛰기    +${DRAFT.skipGold} G`, {
      variant: 'default',
      fontSize: 14,
      onClick: () => {
        if (this.picked) return;
        this.picked = true;
        g.skipDraft();
        this.scene.stop();
      },
    });

    this.actionBtns = [reroll, skip];
    const targets: [TextButton, number][] = [
      [reroll, this.rerolled || g.gold < DRAFT.rerollCost ? 0.4 : 1],
      [skip, 1],
    ];
    for (const [btn, target] of targets) {
      btn.setAlpha(0);
      this.tweens.addCounter({ from: 0, to: target, duration: 260, delay: 480, onUpdate: (tw) => btn.setAlpha(tw.getValue() ?? target) });
    }
  }

  private buildStatusChip(cx: number): void {
    const g = this.game_;
    const style = (color: string) => ({ fontSize: '15px', color, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' });
    const hpT = this.add.text(0, 0, `♥ ${Math.ceil(g.coreHp)} / ${g.coreMaxHp}`, style('#ff8a94')).setOrigin(0, 0.5);
    const sepT = this.add.text(0, 0, '·', style(UI.textDim)).setOrigin(0, 0.5);
    const goldT = this.add.text(0, 0, `${g.gold} G`, style(UI.gold)).setOrigin(0, 0.5);

    const gap = 14;
    const w = hpT.width + gap + sepT.width + gap + goldT.width;
    const chip = this.add.container(cx, 28).setAlpha(0);
    hpT.setX(-w / 2);
    sepT.setX(hpT.x + hpT.width + gap);
    goldT.setX(sepT.x + sepT.width + gap);
    const bg = this.add.graphics();
    panel(bg, -w / 2 - 18, -17, w + 36, 34, { fill: UI.panelFill, fillAlpha: 0.96, border: UI.panelBorder, borderAlpha: 0.9, cut: 9, lineWidth: 1.5 });
    chip.add([bg, hpT, sepT, goldT]);
    this.tweens.add({ targets: chip, alpha: 1, duration: 300, delay: 120 });
  }

  private buildCard(x: number, y: number, key: CardKey): Phaser.GameObjects.Container {
    const def = CARDS[key];
    const cat = CARD_CATEGORY_INFO[def.category];
    const left = -CARD_W / 2;
    const top = -CARD_H / 2;
    const baseY = y;

    // 시작 위치는 46px 아래 + 투명 (등장 트윈이 제자리로 올린다)
    const box = this.add.container(x, y + 46).setAlpha(0);

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
    box.add(gfx);

    // 분류 칩 (잘린 모서리)
    const chip = this.add.graphics();
    chip.fillStyle(cat.color, 0.95);
    chip.fillPoints(chamfer(left + 20, top + 22, 98, 26, 8), true);
    box.add(chip);
    box.add(
      this.add
        .text(left + 20 + 49, top + 22 + 13, cat.label, { fontSize: '13px', color: '#0b1018', fontFamily: UI.FONT, fontStyle: 'bold' })
        .setOrigin(0.5),
    );

    // 관련 배치물 아이콘 — 효과를 그림으로 전달 (분류색 발광 배경)
    const iconGlow = this.add
      .image(0, -36, 'spark')
      .setTint(cat.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.5)
      .setAlpha(0.3);
    box.add(iconGlow);
    const icon = this.add.image(0, -36, def.icon);
    icon.setScale(58 / icon.height);
    if (def.iconTint) icon.setTint(def.iconTint);
    box.add(icon);

    box.add(
      this.add.text(0, 18, def.name, { fontSize: '23px', color: '#ffffff', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0.5),
    );
    box.add(
      this.add
        .text(0, 64, def.desc, {
          fontSize: '14px',
          color: '#c2cee0',
          fontFamily: UI.FONT,
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: CARD_W - 40 },
        })
        .setOrigin(0.5),
    );

    // 재등장 규칙 표기 — 유니크(획득 시 풀에서 제거) vs 즉발(반복 등장)
    box.add(
      this.add
        .text(0, CARD_H / 2 - 15, def.unique ? '★ 획득 시 카드 풀에서 제거' : '↻ 반복 등장 가능', {
          fontSize: '10.5px',
          color: def.unique ? UI.gold : UI.textDim,
          fontFamily: UI.FONT,
        })
        .setOrigin(0.5)
        .setAlpha(0.85),
    );

    const zone = this.add.zone(0, 0, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    box.add(zone);

    zone.on('pointerover', () => {
      if (this.picked) return;
      draw(true);
      this.tweens.add({ targets: box, y: baseY - 8, scale: 1.03, duration: 140, ease: 'Cubic.easeOut' });
      this.game_.sfx.play('cardHover');
    });
    zone.on('pointerout', () => {
      if (this.picked) return;
      draw(false);
      this.tweens.add({ targets: box, y: baseY, scale: 1, duration: 160, ease: 'Cubic.easeOut' });
    });
    zone.on('pointerdown', () => {
      if (this.picked) return;
      this.pick(box, key);
    });
    box.setData('zone', zone);
    return box;
  }

  /** 선택 연출: 선택 카드는 플래시 + 확대 후 소멸, 나머지는 어두워지며 가라앉는다 */
  private pick(chosen: Phaser.GameObjects.Container, key: CardKey): void {
    this.picked = true;
    this.game_.sfx.play('card');
    for (const btn of this.actionBtns) btn.setEnabled(false);

    for (const obj of this.children.list) {
      if (!(obj instanceof Phaser.GameObjects.Container)) continue;
      (obj.getData('zone') as Phaser.GameObjects.Zone | undefined)?.disableInteractive();
      if (obj === chosen) continue;
      this.tweens.add({ targets: obj, alpha: 0.12, scale: 0.94, y: obj.y + 14, duration: 260, ease: 'Cubic.easeOut' });
    }

    // 선택 카드: 흰 플래시 오버레이 + 팽창 후 페이드
    const flash = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 0.4);
    chosen.add(flash);
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: chosen, scale: 1.1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: chosen, alpha: 0, scale: 1.18, duration: 200, delay: 220, ease: 'Cubic.easeIn' });

    this.time.delayedCall(430, () => {
      this.game_.applyCard(key);
      this.scene.stop();
    });
  }
}
