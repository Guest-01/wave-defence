import Phaser from 'phaser';
import { ENEMIES, PLACEABLES, PLACEABLE_ORDER, WORLD, type PlaceableKey } from '../data/balance';
import { DIRECTION_KO, WAVES } from '../data/waves';
import { IconButton, TextButton, UI, brackets, chamfer, drawMuteIcon, drawPauseIcon, drawRangeIcon, panel, segBar } from '../systems/ui';
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
  private speedBtn!: TextButton;
  private muteBtn!: IconButton;
  private rangeBtn!: IconButton;
  private rangeLabel!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private overlayBtns: TextButton[] = [];
  private onboardingParts: { destroy(): void }[] = [];
  private onboardingDone = false;
  private ended = false;
  /** 골드 카운트업 표시값 (-1 = 미초기화) */
  private shownGold = -1;
  private lastGold = -1;
  private goldAccum = 0;
  private lastGoldFloat = 0;
  private goldFloatX = 0;
  private bossLabel!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Image;
  /** 코어 HP 바 잔상 (직전 피해량이 밝게 남았다가 줄어든다) */
  private coreGhost = 1;

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
    this.onboardingParts = [];
    this.onboardingDone = false;
    this.ended = false;
    this.shownGold = -1;
    this.lastGold = -1;
    this.goldAccum = 0;
    this.lastGoldFloat = 0;
    this.coreGhost = 1;

    this.buildFrame();
    this.buildTopBar();
    this.buildBottomBar();
    this.bindHotkeys();

    // 저체력 경고 비네트 (코어 HP 30% 미만에서 맥동)
    this.vignette = this.add
      .image(WORLD.width / 2, WORLD.height / 2, 'vignette')
      .setDisplaySize(WORLD.width, WORLD.height)
      .setDepth(44)
      .setVisible(false);

    // 보스 HP 바 라벨 (바 본체는 barGfx에 매 프레임 그린다)
    this.bossLabel = this.add
      .text(WORLD.width / 2 - 216, 89, 'BOSS', { fontSize: '14px', color: '#ff6ea0', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(2)
      .setShadow(0, 0, '#ff2e6e', 8)
      .setVisible(false);
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
    this.hpText = this.add.text(HP.x + HP.w + 9, HP.y + HP.h / 2, '', { fontSize: '13px', color: UI.text, fontFamily: UI.FONT_DISPLAY }).setOrigin(0, 0.5).setDepth(2);
    this.levelText = this.add.text(14, XP.y + XP.h / 2, 'Lv.1', { fontSize: '13px', color: '#bcd0ff', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(2);
    this.xpText = this.add.text(XP.x + XP.w + 9, XP.y + XP.h / 2, '', { fontSize: '12px', color: UI.textDim, fontFamily: UI.FONT_DISPLAY }).setOrigin(0, 0.5).setDepth(2);

    // 웨이브 + 예고 (중앙 플레이트)
    this.waveText = this.add.text(cx, 13, '', { fontSize: '21px', color: '#eafcff', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(2).setShadow(0, 0, '#3ff0e0', 10).setLetterSpacing(1.5);
    this.previewText = this.add.text(cx, 42, '', { fontSize: '12px', color: UI.gold, fontFamily: UI.FONT }).setOrigin(0.5, 0).setDepth(2);

    // 골드 칩 + 아이콘 버튼 (우측)
    this.muteBtn = new IconButton(this, w - 28, 28, 36, drawMuteIcon, () => {
      this.game_.sfx.toggleMuted();
      this.game_.sfx.play('place');
    }, 40, UI.danger);
    new IconButton(this, w - 70, 28, 36, drawPauseIcon, () => this.game_.requestPause());

    const chipG = this.add.graphics().setDepth(1);
    const chipW = 118;
    const chipX = w - 94 - chipW;
    panel(chipG, chipX, 12, chipW, 32, { fill: 0x1a1608, fillAlpha: 0.9, border: UI.goldHex, borderAlpha: 0.7, cut: 9, lineWidth: 1.5 });
    chipG.fillStyle(UI.goldHex, 1);
    chipG.fillPoints(chamfer(chipX + 12, 22, 12, 12, 3), true);
    this.goldText = this.add.text(chipX + chipW - 12, 28, '', { fontSize: '17px', color: UI.gold, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' }).setOrigin(1, 0.5).setDepth(2);
    this.goldFloatX = chipX + chipW / 2;
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

    // 사거리 상시 표시 토글 (BUILD 전용)
    this.rangeBtn = new IconButton(this, WORLD.width - 262, barY, 44, drawRangeIcon, () => this.game_.toggleRanges());
    this.rangeLabel = this.add.text(WORLD.width - 290, barY, '사거리\n(R)', { fontSize: '11px', color: UI.textDim, fontFamily: UI.FONT, align: 'right', lineSpacing: 2 }).setOrigin(1, 0.5).setDepth(2);

    // 웨이브 시작 버튼 (히어로 — 발광 헤일로 + 맥동)
    const sx = WORLD.width - 122;
    this.startGlow = this.add.image(sx, barY, 'spark').setTint(UI.success).setBlendMode(Phaser.BlendModes.ADD).setDepth(29).setScale(3.6, 1.2).setAlpha(0.32);
    this.tweens.add({ targets: this.startGlow, alpha: 0.12, scaleX: 3.9, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.startBtn = new TextButton(this, sx, barY, 208, CARD_H, '▶  웨이브 시작', {
      variant: 'primary',
      fontSize: 19,
      onClick: () => this.game_.startWave(),
    });

    // 배속 버튼 (WAVE 전용, 시작 버튼 자리) — ×1 → ×2 → ×3
    this.speedBtn = new TextButton(this, sx, barY, 208, CARD_H, '▶▶  배속 ×1', {
      variant: 'default',
      fontSize: 18,
      onClick: () => this.game_.cycleSpeed(),
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

  update(time: number, delta: number): void {
    const g = this.game_;
    if (!g || !g.scene.isActive()) return;

    const hpRatio = Phaser.Math.Clamp(g.coreHp / g.coreMaxHp, 0, 1);
    const next = g.nextXpThreshold();

    // 코어 HP 잔상: 피해 직후 밝은 조각이 남았다가 따라 줄어든다
    if (hpRatio < this.coreGhost) this.coreGhost = Math.max(hpRatio, this.coreGhost - (delta / 1000) * 0.35);
    else this.coreGhost = hpRatio;

    this.barGfx.clear();
    segBar(this.barGfx, HP.x, HP.y, HP.w, HP.h, hpRatio, { fill: hpRatio < 0.3 ? UI.danger : UI.hp, track: UI.hpTrack, segments: 10, border: 0x50283a });
    if (this.coreGhost > hpRatio + 0.004) {
      this.barGfx.fillStyle(0xffd9d0, 0.45);
      this.barGfx.fillRect(HP.x + HP.w * hpRatio, HP.y + 1, HP.w * (this.coreGhost - hpRatio), HP.h - 2);
    }
    if (next !== null) {
      segBar(this.barGfx, XP.x, XP.y, XP.w, XP.h, Phaser.Math.Clamp(g.xp / next, 0, 1), { fill: UI.xp, track: UI.xpTrack, segments: 8, border: 0x2b425e });
    }

    // 보스 HP 바 (상단 중앙 플레이트 아래)
    const boss = g.enemies.find((e) => e.key === 'boss');
    if (boss && g.phase === 'WAVE') {
      const bw = 400;
      const bx = WORLD.width / 2 - bw / 2;
      const by = 84;
      this.barGfx.fillStyle(0x0a0510, 0.72);
      this.barGfx.fillRect(bx - 6, by - 5, bw + 12, 20);
      segBar(this.barGfx, bx, by, bw, 10, Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1), { fill: 0xff2e6e, track: 0x2a0e1a, segments: 12, border: 0x5a2038 });
      this.bossLabel.setVisible(true);
    } else {
      this.bossLabel.setVisible(false);
    }

    this.hpText.setText(`${Math.ceil(g.coreHp)} / ${g.coreMaxHp}`);
    this.updateGold(g, time);
    this.waveText.setText(`WAVE ${Math.min(g.waveIndex + 1, WAVES.length)} / ${WAVES.length}`);

    // 저체력 경고 비네트
    const inRun = g.phase === 'BUILD' || g.phase === 'WAVE';
    if (inRun && hpRatio > 0 && hpRatio < 0.3) {
      this.vignette.setVisible(true).setAlpha(0.32 + 0.15 * Math.sin(time / 230));
    } else {
      this.vignette.setVisible(false);
    }

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
    const isWave = g.phase === 'WAVE';
    this.startBtn.setVisible(isBuild);
    this.startGlow.setVisible(isBuild);
    this.speedBtn.setVisible(isWave).setText(`▶▶  배속 ×${g.gameSpeed} (F)`);
    // 사거리 토글은 BUILD·WAVE 모두
    this.rangeBtn.setVisible(isBuild || isWave).setActive(g.showRanges);
    this.rangeLabel.setVisible(isBuild || isWave);

    this.muteBtn.setActive(g.sfx.isMuted());
    this.updateOnboarding(g, isBuild);

    const wave = WAVES[g.waveIndex];
    if (isBuild && wave) {
      const parts = wave.groups.map((gr) => `${ENEMIES[gr.enemy].name}×${gr.count} (${DIRECTION_KO[gr.direction]})`);
      this.previewText.setText(parts.join('   ·   '));
    } else {
      this.previewText.setText('');
    }

    if (g.phase === 'END' && !this.ended) {
      this.ended = true;
      // 마지막 처치/파괴 연출이 보이도록 잠깐 여유를 두고 결과 표시
      this.time.delayedCall(g.victory ? 500 : 700, () => this.showResult(g.victory));
    }
  }

  /** 골드 카운트업 + 증가 펄스 + 스로틀된 +N 플로트 */
  private updateGold(g: GameScene, time: number): void {
    if (this.shownGold < 0) {
      this.shownGold = g.gold;
      this.lastGold = g.gold;
    }
    if (g.gold > this.lastGold) {
      this.goldAccum += g.gold - this.lastGold;
      this.tweens.killTweensOf(this.goldText);
      this.goldText.setScale(1.16);
      this.tweens.add({ targets: this.goldText, scale: 1, duration: 200, ease: 'Cubic.easeOut' });
    }
    this.lastGold = g.gold;

    if (this.shownGold !== g.gold) {
      const diff = g.gold - this.shownGold;
      // 획득은 굴러 올라가고, 지출은 빠르게 반영
      const step = diff > 0 ? Math.max(1, Math.ceil(diff * 0.16)) : Math.min(-1, Math.floor(diff * 0.4));
      this.shownGold += step;
      if ((diff > 0 && this.shownGold > g.gold) || (diff < 0 && this.shownGold < g.gold)) this.shownGold = g.gold;
    }
    this.goldText.setText(`${this.shownGold} G`);

    if (this.goldAccum > 0 && time - this.lastGoldFloat > 600) {
      this.lastGoldFloat = time;
      const ft = this.add
        .text(this.goldFloatX, 50, `+${this.goldAccum}`, { fontSize: '14px', color: UI.gold, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
        .setOrigin(0.5, 0)
        .setDepth(3);
      this.tweens.add({ targets: ft, y: 72, alpha: 0, duration: 750, ease: 'Cubic.easeOut', onComplete: () => ft.destroy() });
      this.goldAccum = 0;
    }
  }

  // ── 온보딩 (첫 배치 페이즈에만) ──────────────────────────────

  private updateOnboarding(g: GameScene, isBuild: boolean): void {
    const firstBuild = isBuild && g.waveIndex === 0;
    if (!this.onboardingDone && firstBuild && this.onboardingParts.length === 0) {
      this.buildOnboarding();
    } else if (this.onboardingParts.length > 0 && !firstBuild) {
      this.clearOnboarding();
      this.onboardingDone = true;
    }
  }

  private buildOnboarding(): void {
    const cx = WORLD.width / 2;
    this.hintChip(cx, 132, '▲  화살표 방향에서 적이 온다   ·   R : 사거리 표시');
    this.hintChip(cx, WORLD.height - 96, '아래 카드 또는 1~5 키로 배치  →  준비되면  ［웨이브 시작］');
  }

  private hintChip(x: number, y: number, text: string): void {
    const t = this.add.text(x, y, text, { fontSize: '14px', color: '#eaf3ff', fontFamily: UI.FONT, fontStyle: 'bold' }).setOrigin(0.5).setDepth(46);
    const w = t.width + 32;
    const h = 32;
    const g = this.add.graphics().setDepth(45);
    panel(g, x - w / 2, y - h / 2, w, h, { fill: 0x0a1526, fillAlpha: 0.94, border: UI.accent, borderAlpha: 0.85, cut: 9, lineWidth: 1.5 });
    this.onboardingParts.push(g, t);
  }

  private clearOnboarding(): void {
    for (const p of this.onboardingParts) p.destroy();
    this.onboardingParts = [];
  }

  // ── 결과 오버레이 ────────────────────────────────────────────

  private showResult(victory: boolean): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;
    const accent = victory ? UI.success : UI.danger;

    const dim = this.add.rectangle(cx, cy, WORLD.width, WORLD.height, 0x05070e, 0.74).setDepth(50).setInteractive().setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 320, ease: 'Sine.easeOut' });
    this.overlay.push(dim);

    const pw = 480;
    const ph = 270;
    const g = this.add.graphics().setDepth(51).setAlpha(0).setY(16);
    panel(g, cx - pw / 2, cy - ph / 2, pw, ph, { fill: UI.panelFill, fillAlpha: 0.98, border: accent, lineWidth: 2, cut: 20, bracket: true, bracketColor: accent, bracketLen: 26 });
    this.tweens.add({ targets: g, alpha: 1, y: 0, duration: 300, delay: 120, ease: 'Cubic.easeOut' });
    this.overlay.push(g);

    const title = this.add
      .text(cx, cy - 82, victory ? 'VICTORY' : '코어 파괴됨', { fontSize: '46px', color: victory ? '#8ffcd0' : '#ff8a80', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(52)
      .setShadow(0, 0, victory ? '#4ee6a0' : '#ff6b5e', 14)
      .setLetterSpacing(3)
      .setAlpha(0)
      .setScale(0.7);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 300, delay: 220, ease: 'Back.easeOut' });
    this.overlay.push(title);

    const sub = this.add
      .text(cx, cy - 40, victory ? '20번의 웨이브를 모두 막아내고 코어를 지켜냈습니다.' : '다시 도전해 보세요.', { fontSize: '16px', color: UI.textDim, fontFamily: UI.FONT })
      .setOrigin(0.5)
      .setDepth(52)
      .setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, duration: 250, delay: 360 });
    this.overlay.push(sub);

    // 런 요약 — 순차 등장, 처치·골드는 카운트업
    const gs = this.game_;
    const wavesCleared = Math.min(gs.waveIndex, WAVES.length);
    const elites = gs.placeables.filter((p) => p.def.kind === 'unit' && p.rank >= 2).length;
    const vets = gs.placeables.filter((p) => p.def.kind === 'unit' && p.rank >= 1).length;
    const stats: { label: string; val: string; countTo?: number }[] = [
      { label: '생존 웨이브', val: `${wavesCleared} / ${WAVES.length}` },
      { label: '처치', val: `${gs.totalKills}`, countTo: gs.totalKills },
      { label: '최종 골드', val: `${gs.gold}`, countTo: gs.gold },
      { label: '영토', val: `Lv.${gs.grid.level}` },
      { label: '정예·베테랑', val: `${elites} · ${vets}` },
    ];
    const gap = 92;
    const startX = cx - (gap * (stats.length - 1)) / 2;
    stats.forEach((st, i) => {
      const sx = startX + i * gap;
      const delay = 420 + i * 90;
      const valText = this.add
        .text(sx, cy + 14, st.val, { fontSize: '22px', color: '#eaf6ff', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(52)
        .setAlpha(0);
      const labelText = this.add
        .text(sx, cy + 38, st.label, { fontSize: '12px', color: UI.textDim, fontFamily: UI.FONT })
        .setOrigin(0.5)
        .setDepth(52)
        .setAlpha(0);
      this.tweens.add({ targets: [valText, labelText], alpha: 1, y: '-=12', duration: 260, delay, ease: 'Cubic.easeOut' });
      if (st.countTo !== undefined && st.countTo > 0) {
        const target = st.countTo;
        valText.setText('0');
        this.tweens.addCounter({
          from: 0,
          to: target,
          duration: 650,
          delay: delay + 120,
          ease: 'Cubic.easeOut',
          onUpdate: (tw) => valText.setText(`${Math.round(tw.getValue() ?? target)}`),
        });
      }
      this.overlay.push(valText, labelText);
    });

    const restart = new TextButton(this, cx - 108, cy + 78, 196, 52, '다시 시작', { variant: 'primary', fontSize: 19, depth: 52, onClick: () => this.restartRun() });
    const toTitle = new TextButton(this, cx + 108, cy + 78, 196, 52, '타이틀로', { variant: 'default', fontSize: 19, depth: 52, onClick: () => this.toTitle() });
    for (const [i, btn] of [restart, toTitle].entries()) {
      btn.setAlpha(0);
      this.tweens.addCounter({ from: 0, to: 1, duration: 260, delay: 900 + i * 80, onUpdate: (tw) => btn.setAlpha(tw.getValue() ?? 1) });
      this.overlayBtns.push(btn);
    }

    // 승리 축포
    if (victory) {
      const confetti = this.add
        .particles(0, 0, 'shard', {
          x: { min: 0, max: WORLD.width },
          y: -12,
          speedY: { min: 130, max: 280 },
          speedX: { min: -50, max: 50 },
          rotate: { min: 0, max: 360 },
          tint: [0x4ee6a0, 0x3ff0e0, 0xffcf5a, 0xffffff, 0xb98bff],
          scale: { start: 1, end: 0.4 },
          alpha: { start: 1, end: 0 },
          lifespan: 2800,
          quantity: 2,
          frequency: 40,
        })
        .setDepth(53);
      this.time.delayedCall(2600, () => confetti.stop());
      this.overlay.push(confetti);
    }
  }

  private restartRun(): void {
    this.cameras.main.fadeOut(280, 4, 7, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Game');
      this.scene.restart();
    });
  }

  private toTitle(): void {
    this.cameras.main.fadeOut(280, 4, 7, 14);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop('Game');
      this.scene.start('Title');
      this.scene.stop();
    });
  }
}
