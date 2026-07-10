import Phaser from 'phaser';
import { WORLD } from '../data/balance';

/**
 * 네온 아레나 아트: 스프라이트를 외부 파일 대신 코드로 생성한다.
 * - 어두운 방사형 배경 위에서 발광 도형이 뜨도록 설계 (초점=코어, 대비=아군/적군)
 * - 아군(배치물)은 차가운 색(파랑·청록·남색·보라·얼음), 적은 따뜻한 색(빨강·주황·자홍)
 * - 사방에서 오는 적은 방향 무관한 대칭 실루엣으로 그린다
 *
 * 여기의 색은 "아트"이며 밸런스 수치가 아니다. 발사체·사거리 원에 쓰이는
 * `PlaceableDef.color` / `EnemyDef.color`(balance.ts)는 이 팔레트와 맞춰 둔다.
 */

const C = {
  coreCyan: 0x3ff0e0,
  coreHot: 0xdafff9,
  sword: 0x4aa8ff,
  archer: 0x35e3c8,
  cannon: 0x7c8cff,
  mortar: 0xb98bff,
  frost: 0x8fd8ff,
  grunt: 0xff5a4d,
  runner: 0xff9f2e,
  tank: 0xe0463b,
  boss: 0xff2e6e,
};

type Pt = Phaser.Math.Vector2;
type Draw = (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;

const v = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

export function generateArtTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('core')) return; // 페이지당 1회

  makeBackground(scene);
  makeSpark(scene);
  makeRing(scene);
  makeVignette(scene);
  tex(scene, 'shard', 18, 22, drawShard);
  tex(scene, 'slash', 120, 96, drawSlash);
  tex(scene, 'core', 140, 140, drawCore);
  tex(scene, 'swordsman', 120, 120, drawSwordsman);
  tex(scene, 'archer', 120, 120, drawArcher);
  tex(scene, 'cannon', 130, 130, drawCannon);
  tex(scene, 'mortar', 130, 130, drawMortar);
  tex(scene, 'frost', 120, 120, drawFrost);
  tex(scene, 'grunt', 100, 100, drawGrunt);
  tex(scene, 'runner', 84, 84, drawRunner);
  tex(scene, 'tank', 120, 120, drawTank);
  tex(scene, 'boss', 180, 180, drawBoss);
}

// ── 헬퍼 ───────────────────────────────────────────────────────

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  const g = scene.add.graphics();
  draw(g, w / 2, h / 2);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** 겹치는 반투명 원으로 중심이 밝아지는 발광 후광 */
function glow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rMax: number, color: number, layers = 12, maxAlpha = 0.5): void {
  const a = maxAlpha / layers;
  for (let i = layers; i >= 1; i--) {
    g.fillStyle(color, a);
    g.fillCircle(cx, cy, (rMax * i) / layers);
  }
}

function poly(cx: number, cy: number, sides: number, r: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const ang = rot + (i * 2 * Math.PI) / sides;
    pts.push(v(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r));
  }
  return pts;
}

function star(cx: number, cy: number, spikes: number, outer: number, inner: number, rot = -Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = rot + (i * Math.PI) / spikes;
    pts.push(v(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r));
  }
  return pts;
}

// ── 배경 (방사형 그라디언트 + 은은한 격자) ──────────────────────

function makeBackground(scene: Phaser.Scene): void {
  const w = WORLD.width;
  const h = WORLD.height;
  const canvas = scene.textures.createCanvas('bg', w, h);
  if (!canvas) return;
  const ctx = canvas.getContext();

  const grad = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, Math.max(w, h) * 0.62);
  grad.addColorStop(0, '#16203a');
  grad.addColorStop(0.55, '#0c1225');
  grad.addColorStop(1, '#060912');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(90,120,180,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  canvas.refresh();
}

// ── 이펙트 텍스처 (흰색 → tint + ADD 블렌드로 발광) ──────────────

/** 부드러운 방사형 발광 점. 발사체 본체·트레일·플래시·스파크 파티클 공용 */
function makeSpark(scene: Phaser.Scene): void {
  const s = 64;
  const canvas = scene.textures.createCanvas('spark', s, s);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  canvas.refresh();
}

/** 부드러운 고리 (폭발 충격파·사망 플래시·코어 방전) */
function makeRing(scene: Phaser.Scene): void {
  const s = 96;
  const canvas = scene.textures.createCanvas('ring', s, s);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.92, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  canvas.refresh();
}

/** 저체력 경고 비네트 — 가장자리로 갈수록 붉어지는 프레임 (화면 크기로 늘려 사용) */
function makeVignette(scene: Phaser.Scene): void {
  const w = 320;
  const h = 180;
  const canvas = scene.textures.createCanvas('vignette', w, h);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, w * 0.62);
  grad.addColorStop(0, 'rgba(255,40,60,0)');
  grad.addColorStop(0.62, 'rgba(255,40,60,0)');
  grad.addColorStop(0.85, 'rgba(255,40,60,0.5)');
  grad.addColorStop(1, 'rgba(255,30,50,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  canvas.refresh();
}

/** 파편 (사망 버스트). 밝은 마름모 */
function drawShard(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.fillStyle(0xffffff, 1);
  g.fillPoints([v(cx, cy - 9), v(cx + 4, cy), v(cx, cy + 9), v(cx - 4, cy)], true);
}

/** 근접 베기용 초승달 (검병 슬래시). +x 방향으로 볼록, 띠를 텍스처 중심에 정렬 */
function drawSlash(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const outerR = 48;
  const innerR = 33;
  const a0 = -Math.PI * 0.44;
  const a1 = Math.PI * 0.44;
  const N = 18;
  // 호의 중심을 왼쪽으로 밀어 초승달 띠가 이미지 중심에 오게 한다 (앵커=띠 위치)
  const ox = cx - 30;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    pts.push(v(ox + Math.cos(a) * outerR, cy + Math.sin(a) * outerR));
  }
  for (let i = N; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / N;
    pts.push(v(ox + Math.cos(a) * innerR, cy + Math.sin(a) * innerR));
  }
  g.fillStyle(0xffffff, 1);
  g.fillPoints(pts, true);
}

// ── 코어 (발광 크리스탈, 화면의 초점) ───────────────────────────

function drawCore(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  glow(g, cx, cy, 60, C.coreCyan, 16, 0.7);
  g.fillStyle(0x0e3b3c, 1);
  g.fillCircle(cx, cy, 36);
  g.lineStyle(3, C.coreCyan, 0.9);
  g.strokeCircle(cx, cy, 42);
  const outer = poly(cx, cy, 4, 34, 0);
  g.fillStyle(C.coreCyan, 1);
  g.fillPoints(outer, true);
  g.lineStyle(2, 0xbafff6, 0.9);
  g.strokePoints(outer, true, true);
  const inner = poly(cx, cy, 4, 17, 0);
  g.fillStyle(C.coreHot, 1);
  g.fillPoints(inner, true);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx, cy, 5);
}

// ── 아군 유닛 ──────────────────────────────────────────────────

function drawSwordsman(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 방패 + 세로 검 (블로커)
  glow(g, cx, cy, 40, C.sword, 12, 0.4);
  const shield: Pt[] = [
    v(cx - 32, cy - 34),
    v(cx + 32, cy - 34),
    v(cx + 32, cy - 4),
    v(cx, cy + 40),
    v(cx - 32, cy - 4),
  ];
  g.fillStyle(C.sword, 1);
  g.fillPoints(shield, true);
  g.lineStyle(3, 0x123a66, 1);
  g.strokePoints(shield, true, true);
  // 검
  g.fillStyle(0xdcebff, 1);
  g.fillRect(cx - 3, cy - 46, 6, 70);
  g.fillStyle(0x9fc4f0, 1);
  g.fillRect(cx - 14, cy - 28, 28, 6);
  g.fillStyle(0xdcebff, 1);
  g.fillCircle(cx, cy - 48, 4);
}

function drawArcher(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 활 + 화살 (원거리 딜러)
  glow(g, cx, cy, 40, C.archer, 12, 0.4);
  g.lineStyle(7, C.archer, 1);
  g.beginPath();
  g.arc(cx - 8, cy, 34, -Math.PI * 0.6, Math.PI * 0.6, false);
  g.strokePath();
  const a0 = -Math.PI * 0.6;
  const a1 = Math.PI * 0.6;
  g.lineStyle(2, 0xcfeee9, 0.9);
  g.lineBetween(cx - 8 + Math.cos(a0) * 34, cy + Math.sin(a0) * 34, cx - 8 + Math.cos(a1) * 34, cy + Math.sin(a1) * 34);
  g.lineStyle(4, 0xffffff, 1);
  g.lineBetween(cx - 20, cy, cx + 32, cy);
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(cx + 32, cy - 8, cx + 32, cy + 8, cx + 48, cy);
}

// ── 아군 구조물 ────────────────────────────────────────────────

function drawCannon(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 원형 베이스 + 긴 단일 포신 (단일 고딜)
  glow(g, cx, cy, 44, C.cannon, 12, 0.4);
  g.fillStyle(C.cannon, 1);
  g.fillRoundedRect(cx - 9, cy - 48, 18, 54, 4);
  g.lineStyle(2, 0x1a2050, 1);
  g.strokeRoundedRect(cx - 9, cy - 48, 18, 54, 4);
  g.fillStyle(0x0a0e28, 1);
  g.fillCircle(cx, cy - 48, 8);
  g.fillStyle(0x2a3170, 1);
  g.fillCircle(cx, cy + 8, 30);
  g.lineStyle(3, C.cannon, 1);
  g.strokeCircle(cx, cy + 8, 30);
  g.fillStyle(0xb9c4ff, 1);
  g.fillCircle(cx, cy + 8, 8);
}

function drawMortar(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 육각 베이스 + 넓게 벌어진 포구 (광역)
  glow(g, cx, cy, 44, C.mortar, 12, 0.4);
  const hex = poly(cx, cy + 8, 6, 30, 0);
  g.fillStyle(0x3a2a60, 1);
  g.fillPoints(hex, true);
  g.lineStyle(3, C.mortar, 1);
  g.strokePoints(hex, true, true);
  g.fillStyle(C.mortar, 1);
  g.fillTriangle(cx - 22, cy - 40, cx + 22, cy - 40, cx, cy - 2);
  g.fillStyle(0x160a2a, 1);
  g.fillRect(cx - 22, cy - 46, 44, 9);
  g.lineStyle(2, 0xd9b6ff, 0.9);
  g.strokeRect(cx - 22, cy - 46, 44, 9);
  g.fillStyle(0xd9b6ff, 1);
  g.fillCircle(cx, cy + 8, 7);
}

function drawFrost(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 눈결정 (유틸: 감속)
  glow(g, cx, cy, 40, C.frost, 12, 0.45);
  g.lineStyle(5, C.frost, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    g.lineBetween(cx, cy, cx + Math.cos(a) * 36, cy + Math.sin(a) * 36);
  }
  g.lineStyle(3, C.frost, 0.9);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const ex = cx + Math.cos(a) * 24;
    const ey = cy + Math.sin(a) * 24;
    g.lineBetween(ex, ey, ex + Math.cos(a + 0.6) * 11, ey + Math.sin(a + 0.6) * 11);
    g.lineBetween(ex, ey, ex + Math.cos(a - 0.6) * 11, ey + Math.sin(a - 0.6) * 11);
  }
  const core = poly(cx, cy, 6, 15, 0);
  g.fillStyle(0xdff3ff, 1);
  g.fillPoints(core, true);
  g.lineStyle(2, 0x5aa8d8, 1);
  g.strokePoints(core, true, true);
}

// ── 적 (따뜻한 색, 대칭 실루엣) ────────────────────────────────

function drawGrunt(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 붉은 가시 구체
  glow(g, cx, cy, 34, C.grunt, 12, 0.5);
  const spikes = star(cx, cy, 9, 30, 20);
  g.fillStyle(C.grunt, 1);
  g.fillPoints(spikes, true);
  g.fillCircle(cx, cy, 22);
  g.lineStyle(3, 0x7a1a14, 1);
  g.strokeCircle(cx, cy, 22);
  g.fillStyle(0x3a0d0b, 1);
  g.fillCircle(cx, cy, 8);
  g.fillStyle(0xffd0c8, 0.9);
  g.fillCircle(cx - 7, cy - 7, 4);
}

function drawRunner(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 날카로운 4각별 (빠름)
  glow(g, cx, cy, 28, C.runner, 12, 0.5);
  const s = star(cx, cy, 4, 26, 9);
  g.fillStyle(C.runner, 1);
  g.fillPoints(s, true);
  g.lineStyle(2.5, 0x9c5410, 1);
  g.strokePoints(s, true, true);
  g.fillStyle(0xfff0d8, 0.95);
  g.fillCircle(cx, cy, 5);
}

function drawTank(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 장갑 육각 (크고 두껍다)
  glow(g, cx, cy, 42, C.tank, 12, 0.45);
  g.fillStyle(0x3a0f0d, 1);
  g.fillPoints(poly(cx, cy, 6, 44, 0), true);
  g.fillStyle(C.tank, 1);
  g.fillPoints(poly(cx, cy, 6, 40, 0), true);
  g.lineStyle(4, 0x7d1e18, 1);
  g.strokePoints(poly(cx, cy, 6, 40, 0), true, true);
  g.fillStyle(0x2a0a08, 1);
  g.fillCircle(cx, cy, 16);
  g.lineStyle(3, 0xff8a7a, 0.85);
  g.strokeCircle(cx, cy, 16);
  g.fillStyle(0x1e0806, 1);
  for (const p of poly(cx, cy, 6, 32, 0)) g.fillCircle(p.x, p.y, 3);
}

function drawBoss(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  // 거대 가시 원반 + 빛나는 눈
  glow(g, cx, cy, 72, C.boss, 16, 0.6);
  g.fillStyle(0x4a0a24, 1);
  g.fillPoints(star(cx, cy, 12, 66, 46), true);
  g.fillStyle(C.boss, 1);
  g.fillCircle(cx, cy, 48);
  g.lineStyle(4, 0x8a1540, 1);
  g.strokeCircle(cx, cy, 48);
  g.lineStyle(3, 0xff6ea0, 0.8);
  g.strokeCircle(cx, cy, 34);
  g.fillStyle(0x2a0616, 1);
  g.fillCircle(cx, cy, 18);
  g.fillStyle(0xffe08a, 1);
  g.fillCircle(cx, cy, 10);
  g.fillStyle(0x2a0616, 1);
  g.fillRect(cx - 2, cy - 9, 4, 18);
}
