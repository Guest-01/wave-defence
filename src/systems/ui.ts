import Phaser from 'phaser';

/**
 * 공통 UI 토큰·컴포넌트 — 네온 사이파이 HUD 언어.
 * 참고: 사이버펑크/네온 2D 게임 HUD (잘린 모서리 프레임 · 코너 브래킷 · 세그먼트 게이지 · 발광 테두리).
 * 여기의 색은 UI 아트이며 밸런스 수치가 아니다.
 */

export const UI = {
  panelFill: 0x0b1322,
  panelFill2: 0x111d33,
  panelHover: 0x1a2c4a,
  panelBorder: 0x33507a,
  accent: 0x3ff0e0,
  accentText: '#3ff0e0',
  text: '#dfe8f5',
  textDim: '#8ea0bd',
  gold: '#ffcf5a',
  goldHex: 0xffcf5a,
  hp: 0xff566e,
  hpTrack: 0x2a1420,
  xp: 0x3ff0e0,
  xpTrack: 0x15263a,
  success: 0x4ee6a0,
  danger: 0xff6b5e,
  FONT: 'sans-serif',
} as const;

type Pt = Phaser.Math.Vector2;
const v = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

// ── 도형 프리미티브 ────────────────────────────────────────────

/** 네 모서리를 잘라낸 8각 프레임 포인트 (사이파이 HUD의 시그니처) */
export function chamfer(x: number, y: number, w: number, h: number, cut: number): Pt[] {
  return [
    v(x + cut, y),
    v(x + w - cut, y),
    v(x + w, y + cut),
    v(x + w, y + h - cut),
    v(x + w - cut, y + h),
    v(x + cut, y + h),
    v(x, y + h - cut),
    v(x, y + cut),
  ];
}

export interface FrameOpts {
  fill?: number | null;
  fillAlpha?: number;
  line?: number | null;
  lineAlpha?: number;
  lineWidth?: number;
  glow?: boolean;
}

/** 채움 + 발광 테두리(굵은 저알파 헤일로 + 얇은 선명한 선) */
export function neonFrame(g: Phaser.GameObjects.Graphics, pts: Pt[], opts: FrameOpts): void {
  if (opts.fill != null) {
    g.fillStyle(opts.fill, opts.fillAlpha ?? 0.94);
    g.fillPoints(pts, true);
  }
  const line = opts.line;
  if (line != null) {
    const lw = opts.lineWidth ?? 2;
    if (opts.glow !== false) {
      g.lineStyle(lw + 5, line, 0.1);
      g.strokePoints(pts, true, true);
      g.lineStyle(lw + 2, line, 0.18);
      g.strokePoints(pts, true, true);
    }
    g.lineStyle(lw, line, opts.lineAlpha ?? 1);
    g.strokePoints(pts, true, true);
  }
}

/** 네 코너에 L자 브래킷 */
export function brackets(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, len: number, color: number, alpha = 0.9, lw = 2.5): void {
  g.lineStyle(lw, color, alpha);
  const L = (x1: number, y1: number, x2: number, y2: number) => g.lineBetween(x1, y1, x2, y2);
  L(x, y + len, x, y); L(x, y, x + len, y);
  L(x + w - len, y, x + w, y); L(x + w, y, x + w, y + len);
  L(x, y + h - len, x, y + h); L(x, y + h, x + len, y + h);
  L(x + w - len, y + h, x + w, y + h); L(x + w, y + h - len, x + w, y + h);
}

export interface PanelOpts {
  fill?: number;
  fillAlpha?: number;
  border?: number | null;
  borderAlpha?: number;
  lineWidth?: number;
  cut?: number;
  glow?: boolean;
  bracket?: boolean;
  bracketColor?: number;
  bracketLen?: number;
  /** @deprecated chamfer로 대체됨 (호환용으로 무시) */
  radius?: number;
}

/** 잘린 모서리 네온 패널. (x,y = 좌상단) */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, opts: PanelOpts = {}): void {
  const cut = opts.cut ?? 14;
  const pts = chamfer(x, y, w, h, cut);
  neonFrame(g, pts, {
    fill: opts.fill ?? UI.panelFill,
    fillAlpha: opts.fillAlpha ?? 0.96,
    line: opts.border === null ? null : (opts.border ?? UI.panelBorder),
    lineAlpha: opts.borderAlpha ?? 1,
    lineWidth: opts.lineWidth ?? 2,
    glow: opts.glow ?? true,
  });
  if (opts.bracket) brackets(g, x, y, w, h, opts.bracketLen ?? 20, opts.bracketColor ?? UI.accent, 0.9, 2.5);
}

export interface SegBarOpts {
  fill?: number;
  track?: number;
  border?: number;
  segments?: number;
}

/** 세그먼트(눈금) + 발광 리딩엣지 게이지. (x,y = 좌상단) */
export function segBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, opts: SegBarOpts = {}): void {
  const fill = opts.fill ?? UI.xp;
  const r = Phaser.Math.Clamp(ratio, 0, 1);
  const fw = r * w;
  g.fillStyle(opts.track ?? UI.xpTrack, 0.95);
  g.fillRect(x, y, w, h);
  if (fw > 1) {
    g.fillStyle(fill, 0.22);
    g.fillRect(x - 1, y - 2, fw + 2, h + 4);
    g.fillStyle(fill, 1);
    g.fillRect(x, y, fw, h);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(x + fw - 2, y, 2, h);
  }
  const segs = opts.segments ?? 0;
  if (segs > 1) {
    g.lineStyle(1, 0x0a1120, 0.85);
    for (let i = 1; i < segs; i++) {
      const sx = x + (w * i) / segs;
      g.lineBetween(sx, y, sx, y + h);
    }
  }
  g.lineStyle(1, opts.border ?? UI.panelBorder, 0.9);
  g.strokeRect(x, y, w, h);
}

// ── 버튼 ───────────────────────────────────────────────────────

type Variant = 'primary' | 'default' | 'danger';

export interface TextButtonOpts {
  onClick: () => void;
  variant?: Variant;
  fontSize?: number;
  depth?: number;
  cut?: number;
}

/** 잘린 모서리 네온 버튼 (호버 발광·활성 상태). 중심 좌표 기준 */
export class TextButton {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  private hovered = false;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private w: number,
    private h: number,
    text: string,
    private opts: TextButtonOpts,
  ) {
    const depth = opts.depth ?? 30;
    this.g = scene.add.graphics().setDepth(depth);
    this.label = scene.add
      .text(x, y, text, { fontSize: `${opts.fontSize ?? 18}px`, color: UI.text, fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(depth + 1);
    this.zone = scene.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(depth + 1);
    this.zone.on('pointerover', () => { this.hovered = true; this.redraw(); });
    this.zone.on('pointerout', () => { this.hovered = false; this.redraw(); });
    this.zone.on('pointerdown', () => { if (this.enabled) this.opts.onClick(); });
    this.redraw();
  }

  private palette(): { fill: number; fillHover: number; border: number; text: string } {
    switch (this.opts.variant ?? 'default') {
      case 'primary':
        return { fill: 0x0f3b32, fillHover: 0x18574a, border: UI.success, text: '#c4ffe9' };
      case 'danger':
        return { fill: 0x361419, fillHover: 0x54222a, border: UI.danger, text: '#ffd7d2' };
      default:
        return { fill: UI.panelFill2, fillHover: UI.panelHover, border: UI.accent, text: UI.text };
    }
  }

  private redraw(): void {
    const c = this.palette();
    const cut = this.opts.cut ?? 10;
    const bx = this.x - this.w / 2;
    const by = this.y - this.h / 2;
    const pts = chamfer(bx, by, this.w, this.h, cut);
    this.g.clear();
    this.g.fillStyle(this.hovered ? c.fillHover : c.fill, 0.97);
    this.g.fillPoints(pts, true);
    // 상단 하이라이트 시트
    this.g.fillStyle(0xffffff, this.hovered ? 0.08 : 0.04);
    this.g.fillRect(bx + cut, by + 2, this.w - 2 * cut, 3);
    // 발광 테두리
    this.g.lineStyle(this.hovered ? 7 : 5, c.border, this.hovered ? 0.24 : 0.12);
    this.g.strokePoints(pts, true, true);
    this.g.lineStyle(this.hovered ? 2.5 : 2, c.border, 1);
    this.g.strokePoints(pts, true, true);
    // 좌우 짧은 액센트 눈금
    this.g.lineStyle(2, c.border, this.hovered ? 1 : 0.7);
    this.g.lineBetween(bx + cut + 2, by + this.h / 2 - 6, bx + cut + 2, by + this.h / 2 + 6);
    this.g.lineBetween(bx + this.w - cut - 2, by + this.h / 2 - 6, bx + this.w - cut - 2, by + this.h / 2 + 6);
    this.label.setColor(c.text);
  }

  setEnabled(e: boolean): this {
    this.enabled = e;
    this.g.setAlpha(e ? 1 : 0.4);
    this.label.setAlpha(e ? 1 : 0.4);
    if (e) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
    return this;
  }

  setText(t: string): this {
    this.label.setText(t);
    return this;
  }

  setVisible(vis: boolean): this {
    this.g.setVisible(vis);
    this.label.setVisible(vis);
    this.zone.setVisible(vis);
    if (vis && this.enabled) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
    return this;
  }

  destroy(): void {
    this.g.destroy();
    this.label.destroy();
    this.zone.destroy();
  }
}

export type IconDraw = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, active: boolean, hovered: boolean) => void;

/** 잘린 모서리 아이콘 버튼 (일시정지·음소거). 중심 좌표 기준 */
export class IconButton {
  private g: Phaser.GameObjects.Graphics;
  private iconGfx: Phaser.GameObjects.Graphics;
  private zone: Phaser.GameObjects.Zone;
  private hovered = false;
  active = false;

  constructor(
    scene: Phaser.Scene,
    private x: number,
    private y: number,
    private size: number,
    private drawIcon: IconDraw,
    onClick: () => void,
    depth = 40,
  ) {
    this.g = scene.add.graphics().setDepth(depth);
    this.iconGfx = scene.add.graphics().setDepth(depth + 1);
    this.zone = scene.add.zone(x, y, size, size).setInteractive({ useHandCursor: true }).setDepth(depth + 1);
    this.zone.on('pointerover', () => { this.hovered = true; this.redraw(); });
    this.zone.on('pointerout', () => { this.hovered = false; this.redraw(); });
    this.zone.on('pointerdown', onClick);
    this.redraw();
  }

  private redraw(): void {
    const s = this.size;
    const bx = this.x - s / 2;
    const by = this.y - s / 2;
    const pts = chamfer(bx, by, s, s, 7);
    const border = this.active ? UI.danger : this.hovered ? UI.accent : UI.panelBorder;
    this.g.clear();
    this.g.fillStyle(this.hovered ? UI.panelHover : UI.panelFill2, 0.92);
    this.g.fillPoints(pts, true);
    this.g.lineStyle(this.hovered ? 5 : 4, border, this.hovered ? 0.22 : 0.12);
    this.g.strokePoints(pts, true, true);
    this.g.lineStyle(1.5, border, 1);
    this.g.strokePoints(pts, true, true);
    this.iconGfx.clear();
    this.drawIcon(this.iconGfx, this.x, this.y, this.active, this.hovered);
  }

  setActive(a: boolean): this {
    if (this.active !== a) {
      this.active = a;
      this.redraw();
    }
    return this;
  }

  destroy(): void {
    this.g.destroy();
    this.iconGfx.destroy();
    this.zone.destroy();
  }
}

// ── 아이콘 드로잉 ──────────────────────────────────────────────

export const drawPauseIcon: IconDraw = (g, cx, cy) => {
  g.fillStyle(0xeaf3ff, 1);
  g.fillRoundedRect(cx - 7.5, cy - 9, 5, 18, 1.5);
  g.fillRoundedRect(cx + 2.5, cy - 9, 5, 18, 1.5);
};

/** 스피커: 왼쪽 박스 + 오른쪽으로 벌어진 콘 + 음파 (음소거 시 빨간 슬래시) */
export const drawMuteIcon: IconDraw = (g, cx, cy, active) => {
  const col = active ? UI.danger : 0xeaf3ff;
  g.fillStyle(col, 1);
  // 박스(뒤) + 콘(오른쪽으로 벌어짐)을 한 폴리곤으로
  g.fillPoints(
    [
      v(cx - 11, cy - 4.5),
      v(cx - 5, cy - 4.5),
      v(cx + 3, cy - 11),
      v(cx + 3, cy + 11),
      v(cx - 5, cy + 4.5),
      v(cx - 11, cy + 4.5),
    ],
    true,
  );
  if (active) {
    g.lineStyle(2.5, UI.danger, 1);
    g.lineBetween(cx - 12, cy - 12, cx + 13, cy + 12);
  } else {
    g.lineStyle(2, col, 1);
    g.beginPath();
    g.arc(cx + 6, cy, 4.5, -Math.PI / 2.6, Math.PI / 2.6);
    g.strokePath();
    g.beginPath();
    g.arc(cx + 6, cy, 9, -Math.PI / 2.6, Math.PI / 2.6);
    g.strokePath();
  }
};
