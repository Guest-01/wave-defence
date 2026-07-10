import Phaser from 'phaser';
import { ENEMIES, PLACEABLES, PLACEABLE_ORDER, WORLD, type PlaceableKey } from '../data/balance';
import { DIRECTION_KO, WAVES } from '../data/waves';
import { IconButton, TextButton, UI, brackets, chamfer, drawMuteIcon, drawPauseIcon, panel, segBar } from '../systems/ui';
import type { GameScene } from './GameScene';

const BAR_H = 56;
const HP = { x: 66, y: 12, w: 156, h: 11 };
const XP = { x: 66, y: 36, w: 132, h: 8 };
const CARD_W = 118;
const CARD_H = 60;
const CARD_GAP = 9;
const HOTKEYS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];

interface BarButton {
  key: PlaceableKey;
  gfx: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  hotkey: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  cx: number;
  cy: number;
  hovered: boolean;
}

/** HUD. GameScene 위에 병렬 실행되며 매 프레임 GameScene 상태를 읽어 갱신한다. */
export class UIScene extends Phaser.Scene {
  private barGfx!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private previewText!: Phaser.GameObjects.Text;
  private buttons: BarButton[] = [];
  private startBtn!: TextButton;
  private startGlow!: Phaser.GameObjects.Image;
  private muteBtn!: IconButton;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayBtns: TextButton[] = [];
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
    this.overlayBtns = [];
    this.ended = false;

    this.buildFrame();
    this.buildTopBar();
    this.buildBottomBar();
    this.bindHotkeys();
  }

  // ── 화면 프레임 (코너 브래킷) ────────────────────────────────

  private buildFrame(): void {
    const w = WORLD.width;
    const h = WORLD.height;
    const g = this.add.graphics().setDepth(0);
    brackets(g, 6, BAR_H + 8, w - 12, h - BAR_H - 8 - 78, 26, UI.accent, 0.18, 2);
  }

  // ── 상단 바 ──────────────────────────────────────────────────

  private buildTopBar(): void {
    const w = WORLD.width;
    const cx = w / 2;
    const bg = this.add.graphics().setDepth(0);
    // 바 본체 + 하단 발광 라인
    bg.fillStyle(UI.panelFill, 0.96);
    bg.fillRect(0, 0, w, BAR_H);
    bg.fillStyle(UI.accent, 0.5);
    bg.fillRect(0, BAR_H, w, 2);
    bg.fillStyle(UI.accent, 0.12);
    bg.fillRect(0, BAR_H + 2, w, 4);

    // 중앙 웨이브 플레이트 (아래로 돌출)
    const pw = 300;
    const ph = 70;
    const px = cx - pw / 2;
    const pts = chamfer(px, -6, pw, ph, 16);
    bg.fillStyle(0x0a1526, 0.98);
    bg.fillPoints(pts, true);
    bg.lineStyle(6, UI.accent, 0.12);
    bg.strokePoints(pts, true, true);
    bg.lineStyle(2, UI.accent, 0.9);
    bg.strokePoints(pts, true, true);
    brackets(bg, px + 8, 2, pw - 16, ph - 14, 14, UI.accent, 0.7, 2);

    this.barGfx = this.add.graphics().setDepth(1);

    // HP / XP 라벨·수치
    this.add.text(14, HP.y + HP.h / 2, '♥ 코어', { fontSize: '14px', color: '#ff8a94', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(2);
    this.hpText = this.add.text(HP.x + HP.w + 9, HP.y + HP.h / 2, '', { fontSize: '13px', color: UI.text, fontFamily: UI.FONT }).setOrigin(0, 0.5).setDepth(2);
    this.levelText = this.add.text(14, XP.y + XP.h / 2, 'Lv.1', { fontSize: '13px', color: '#bcd0ff', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(2);
    this.xpText = this.add.text(XP.x + XP.w + 9, XP.y + XP.h / 2, '', { fontSize: '12px', color: UI.textDim, fontFamily: UI.FONT }).setOrigin(0, 0.5).setDepth(2);

    // 웨이브 + 예고 (중앙 플레이트)
    this.waveText = this.add.text(cx, 13, '', { fontSize: '21px', color: '#eafcff', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(2).setShadow(0, 0, '#3ff0e0', 10);
    this.previewText = this.add.text(cx, 42, '', { fontSize: '12px', color: UI.gold, fontFamily: UI.FONT }).setOrigin(0.5, 0).setDepth(2);

    // 골드 칩 + 아이콘 버튼 (우측)
    this.muteBtn = new IconButton(this, w - 28, 28, 36, drawMuteIcon, () => {
      this.game_.sfx.toggleMuted();
      this.game_.sfx.play('place');
    });
    new IconButton(this, w - 70, 28, 36, drawPauseIcon, () => this.game_.requestPause());

    const chipG = this.add.graphics().setDepth(1);
    const chipW = 118;
    const chipX = w - 94 - chipW;
    panel(chipG, chipX, 12, chipW, 32, { fill: 0x1a1608, fillAlpha: 0.9, border: UI.goldHex, borderAlpha: 0.7, cut: 9, lineWidth: 1.5 });
    chipG.fillStyle(UI.goldHex, 1);
    chipG.fillPoints(chamfer(chipX + 12, 22, 12, 12, 3), true);
    this.goldText = this.add.text(chipX + chipW - 12, 28, '', { fontSize: '17px', color: UI.gold, fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(1, 0.5).setDepth(2);
  }

  // ── 하단 배치 바 ─────────────────────────────────────────────

  private buildBottomBar(): void {
    const barY = WORLD.height - 42;

    PLACEABLE_ORDER.forEach((key, i) => {
      const def = PLACEABLES[key];
      const cx = 14 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const gfx = this.add.graphics().setDepth(0);
      const iconX = cx - CARD_W / 2 + 32;
      const glow = this.add.image(iconX, barY, 'spark').setTint(def.color).setBlendMode(Phaser.BlendModes.ADD).setDepth(0).setScale(0.85).setAlpha(0.5);
      const icon = this.add.image(iconX, barY, key).setDepth(1);
      icon.setScale(42 / icon.height);
      const textX = cx - CARD_W / 2 + 58;
      const name = this.add.text(textX, barY - 10, def.name, { fontSize: '14px', color: UI.text, fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(1);
      const cost = this.add.text(textX, barY + 12, `${def.cost} G`, { fontSize: '13px', color: UI.gold, fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(1);
      const hotkey = this.add.text(cx - CARD_W / 2 + 14, barY - CARD_H / 2 + 13, `${i + 1}`, { fontSize: '13px', color: '#eaf3ff', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0.5).setDepth(2);
      const zone = this.add.zone(cx, barY, CARD_W, CARD_H).setInteractive({ useHandCursor: true }).setDepth(2);
      const b: BarButton = { key, gfx, glow, icon, name, cost, hotkey, zone, cx, cy: barY, hovered: false };
      zone.on('pointerover', () => { b.hovered = true; this.redrawButton(b); });
      zone.on('pointerout', () => { b.hovered = false; this.redrawButton(b); });
      zone.on('pointerdown', () => this.game_.enterPlacement(key));
      this.redrawButton(b);
      this.buttons.push(b);
    });

    // 웨이브 시작 버튼 (히어로 — 발광 헤일로 + 맥동)
    const sx = WORLD.width - 122;
    this.startGlow = this.add.image(sx, barY, 'spark').setTint(UI.success).setBlendMode(Phaser.BlendModes.ADD).setDepth(29).setScale(3.6, 1.2).setAlpha(0.32);
    this.tweens.add({ targets: this.startGlow, alpha: 0.12, scaleX: 3.9, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.startBtn = new TextButton(this, sx, barY, 208, CARD_H, '▶  웨이브 시작', {
      variant: 'primary',
      fontSize: 19,
      onClick: () => this.game_.startWave(),
    });
  }

  private redrawButton(b: BarButton): void {
    const def = PLACEABLES[b.key];
    const x = b.cx - CARD_W / 2;
    const y = b.cy - CARD_H / 2;
    const pts = chamfer(x, y, CARD_W, CARD_H, 11);
    b.gfx.clear();
    b.gfx.fillStyle(b.hovered ? UI.panelHover : UI.panelFill2, 0.95);
    b.gfx.fillPoints(pts, true);
    b.gfx.lineStyle(b.hovered ? 7 : 5, def.color, b.hovered ? 0.3 : 0.14);
    b.gfx.strokePoints(pts, true, true);
    b.gfx.lineStyle(b.hovered ? 2.5 : 1.8, def.color, 1);
    b.gfx.strokePoints(pts, true, true);
    // 좌측 액센트 눈금
    b.gfx.fillStyle(def.color, 0.9);
    b.gfx.fillRect(x + 6, y + 11, 3, CARD_H - 22);
    // 단축키 키캡 (어두운 배경 + 색 테두리 → 흰 숫자로 항상 또렷)
    const kx = x + 4;
    const ky = y + 4;
    const kpts = chamfer(kx, ky, 20, 18, 5);
    b.gfx.fillStyle(0x0a1220, 0.96);
    b.gfx.fillPoints(kpts, true);
    b.gfx.lineStyle(1.5, def.color, b.hovered ? 1 : 0.9);
    b.gfx.strokePoints(kpts, true, true);
    b.glow.setAlpha(b.hovered ? 0.75 : 0.5);
  }

  private bindHotkeys(): void {
    HOTKEYS.forEach((code, i) => {
      this.input.keyboard?.on(`keydown-${code}`, () => {
        if (this.game_.phase === 'BUILD') this.game_.enterPlacement(PLACEABLE_ORDER[i]);
      });
    });
  }

  // ── 매 프레임 갱신 ───────────────────────────────────────────

  update(): void {
    const g = this.game_;
    if (!g || !g.scene.isActive()) return;

    const hpRatio = Phaser.Math.Clamp(g.coreHp / g.coreMaxHp, 0, 1);
    const next = g.nextXpThreshold();

    this.barGfx.clear();
    segBar(this.barGfx, HP.x, HP.y, HP.w, HP.h, hpRatio, { fill: hpRatio < 0.3 ? UI.danger : UI.hp, track: UI.hpTrack, segments: 10, border: 0x50283a });
    if (next !== null) {
      segBar(this.barGfx, XP.x, XP.y, XP.w, XP.h, Phaser.Math.Clamp(g.xp / next, 0, 1), { fill: UI.xp, track: UI.xpTrack, segments: 8, border: 0x2b425e });
    }

    this.hpText.setText(`${Math.ceil(g.coreHp)} / ${g.coreMaxHp}`);
    this.goldText.setText(`${g.gold} G`);
    this.waveText.setText(`WAVE ${Math.min(g.waveIndex + 1, WAVES.length)} / ${WAVES.length}`);

    if (next === null) {
      this.levelText.setText(`Lv.${g.grid.level} MAX`);
      this.xpText.setText('');
    } else {
      this.levelText.setText(`Lv.${g.grid.level}`);
      this.xpText.setText(`${g.xp} / ${next}`);
    }

    const isBuild = g.phase === 'BUILD';
    for (const b of this.buttons) {
      const affordable = g.gold >= PLACEABLES[b.key].cost;
      const alpha = affordable ? 1 : 0.4;
      b.gfx.setVisible(isBuild).setAlpha(alpha);
      b.glow.setVisible(isBuild && affordable);
      b.icon.setVisible(isBuild).setAlpha(alpha);
      b.name.setVisible(isBuild).setAlpha(alpha);
      b.cost.setVisible(isBuild).setAlpha(alpha);
      b.hotkey.setVisible(isBuild).setAlpha(alpha);
      if (isBuild && affordable) b.zone.setInteractive({ useHandCursor: true });
      else b.zone.disableInteractive();
    }
    this.startBtn.setVisible(isBuild);
    this.startGlow.setVisible(isBuild);

    this.muteBtn.setActive(g.sfx.isMuted());

    const wave = WAVES[g.waveIndex];
    if (isBuild && wave) {
      const parts = wave.groups.map((gr) => `${ENEMIES[gr.enemy].name}×${gr.count} (${DIRECTION_KO[gr.direction]})`);
      this.previewText.setText(parts.join('   ·   '));
    } else {
      this.previewText.setText('');
    }

    if (g.phase === 'END' && !this.ended) {
      this.ended = true;
      this.showResult(g.victory);
    }
  }

  // ── 결과 오버레이 ────────────────────────────────────────────

  private showResult(victory: boolean): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    const accent = victory ? UI.success : UI.danger;
    this.overlay.push(this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x05070e, 0.74).setDepth(50).setInteractive());

    const pw = 480;
    const ph = 270;
    const g = this.add.graphics().setDepth(51);
    panel(g, cx - pw / 2, cy - ph / 2, pw, ph, { fill: UI.panelFill, fillAlpha: 0.98, border: accent, lineWidth: 2, cut: 20, bracket: true, bracketColor: accent, bracketLen: 26 });
    this.overlay.push(g);

    this.overlay.push(
      this.add.text(cx, cy - 74, victory ? '승리' : '코어 파괴됨', { fontSize: '48px', color: victory ? '#8ffcd0' : '#ff8a80', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0.5).setDepth(52).setShadow(0, 0, victory ? '#4ee6a0' : '#ff6b5e', 14),
    );
    this.overlay.push(
      this.add.text(cx, cy - 22, victory ? '20번의 웨이브를 모두 막아내고 코어를 지켜냈습니다.' : '다시 도전해 보세요.', { fontSize: '16px', color: UI.textDim, fontFamily: UI.FONT }).setOrigin(0.5).setDepth(52),
    );

    this.overlayBtns.push(new TextButton(this, cx - 108, cy + 60, 196, 54, '다시 시작', { variant: 'primary', fontSize: 19, depth: 52, onClick: () => this.restartRun() }));
    this.overlayBtns.push(new TextButton(this, cx + 108, cy + 60, 196, 54, '타이틀로', { variant: 'default', fontSize: 19, depth: 52, onClick: () => this.toTitle() }));
  }

  private restartRun(): void {
    this.scene.start('Game');
    this.scene.restart();
  }

  private toTitle(): void {
    this.scene.stop('Game');
    this.scene.start('Title');
    this.scene.stop();
  }
}
