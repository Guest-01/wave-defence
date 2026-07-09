import Phaser from 'phaser';
import {
  CORE,
  GRID,
  PLACEABLES,
  START_GOLD,
  WAVE_HP_SCALE,
  WORLD,
  XP_THRESHOLDS,
  type EnemyKey,
  type PlaceableKey,
} from '../data/balance';
import { WAVES, type Direction } from '../data/waves';
import { Enemy } from '../entities/Enemy';
import { Placeable } from '../entities/Placeable';
import { Projectile } from '../entities/Projectile';
import { Grid } from '../systems/Grid';

export type Phase = 'BUILD' | 'WAVE' | 'END';

interface PendingSpawn {
  at: number;
  enemy: EnemyKey;
  direction: Direction;
}

interface Ghost {
  key: PlaceableKey;
  body: Phaser.GameObjects.Shape;
  range: Phaser.GameObjects.Arc;
}

interface DragState {
  p: Placeable;
  fromCol: number;
  fromRow: number;
  range: Phaser.GameObjects.Arc;
}

export class GameScene extends Phaser.Scene {
  phase: Phase = 'BUILD';
  gold = START_GOLD;
  xp = 0;
  coreHp = CORE.maxHp;
  waveIndex = 0;
  victory = false;
  grid = new Grid();
  placeables: Placeable[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  readonly coreRadius = CORE.radius;

  private pending: PendingSpawn[] = [];
  private waveClock = 0;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private ghost: Ghost | null = null;
  private drag: DragState | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    // 씬 재시작 대비 상태 초기화
    this.phase = 'BUILD';
    this.gold = START_GOLD;
    this.xp = 0;
    this.coreHp = CORE.maxHp;
    this.waveIndex = 0;
    this.victory = false;
    this.grid = new Grid();
    this.placeables = [];
    this.enemies = [];
    this.projectiles = [];
    this.pending = [];
    this.ghost = null;
    this.drag = null;

    this.input.mouse?.disableContextMenu();

    this.gridGfx = this.add.graphics().setDepth(0);
    this.drawGrid();

    // 코어
    this.add.circle(this.grid.cx, this.grid.cy, CORE.radius, 0xf5d547).setDepth(1);
    this.add.circle(this.grid.cx, this.grid.cy, CORE.radius + 7).setStrokeStyle(2, 0xf5d547, 0.4).setDepth(1);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.keyboard?.on('keydown-ESC', () => this.cancelPlacement());

    this.setupUnitDrag();

    if (!this.scene.isActive('UI')) this.scene.launch('UI');
  }

  update(_time: number, deltaMs: number): void {
    if (this.phase !== 'WAVE') return;
    const dt = deltaMs / 1000;

    this.waveClock += dt;
    while (this.pending.length > 0 && this.pending[0].at <= this.waveClock) {
      const s = this.pending.shift()!;
      this.spawnEnemy(s.enemy, s.direction);
    }

    for (const e of [...this.enemies]) e.update(dt, this);
    for (const p of [...this.placeables]) p.update(dt, this);
    this.projectiles = this.projectiles.filter((pr) => !pr.update(dt, this));

    if (this.phase === 'WAVE' && this.pending.length === 0 && this.enemies.length === 0) {
      this.endWave();
    }
  }

  // ── 웨이브 진행 ──────────────────────────────────────────────

  startWave(): void {
    if (this.phase !== 'BUILD' || this.waveIndex >= WAVES.length) return;
    this.cancelPlacement();

    this.pending = [];
    for (const g of WAVES[this.waveIndex].groups) {
      for (let i = 0; i < g.count; i++) {
        this.pending.push({ at: (g.startDelay ?? 0) + i * g.interval, enemy: g.enemy, direction: g.direction });
      }
    }
    this.pending.sort((a, b) => a.at - b.at);
    this.waveClock = 0;
    this.phase = 'WAVE';
    this.gridGfx.setAlpha(0.25);
  }

  private endWave(): void {
    this.clearProjectiles();
    this.waveIndex++;
    if (this.waveIndex >= WAVES.length) {
      this.end(true);
      return;
    }
    this.phase = 'BUILD';
    this.gridGfx.setAlpha(1);
    for (const p of this.placeables) p.revive(this);
  }

  private end(victory: boolean): void {
    this.phase = 'END';
    this.victory = victory;
    this.cancelPlacement();
    this.clearProjectiles();
  }

  private clearProjectiles(): void {
    for (const pr of this.projectiles) pr.destroy();
    this.projectiles = [];
  }

  private spawnEnemy(key: EnemyKey, dir: Direction): void {
    const m = 40; // 화면 밖 여유
    let x = 0;
    let y = 0;
    if (dir === 'right') {
      x = WORLD.width + m;
      y = Phaser.Math.Between(80, WORLD.height - 80);
    } else if (dir === 'left') {
      x = -m;
      y = Phaser.Math.Between(80, WORLD.height - 80);
    } else if (dir === 'top') {
      x = Phaser.Math.Between(80, WORLD.width - 80);
      y = -m;
    } else {
      x = Phaser.Math.Between(80, WORLD.width - 80);
      y = WORLD.height + m;
    }
    const hpScale = 1 + WAVE_HP_SCALE * this.waveIndex; // 웨이브 1(index 0) → ×1.0
    this.enemies.push(new Enemy(this, key, x, y, hpScale));
  }

  // ── 전투 콜백 ────────────────────────────────────────────────

  onEnemyDead(enemy: Enemy, killed: boolean): void {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    if (killed) {
      this.gold += enemy.def.gold;
      this.addXp(enemy.def.xp);
    }
  }

  damageCore(amount: number): void {
    if (this.phase === 'END') return;
    this.coreHp -= amount;
    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.end(false);
    }
  }

  removePlaceable(p: Placeable): void {
    const i = this.placeables.indexOf(p);
    if (i >= 0) this.placeables.splice(i, 1);
  }

  private addXp(amount: number): void {
    this.xp += amount;
    while (this.grid.level < this.grid.maxLevel && this.xp >= XP_THRESHOLDS[this.grid.level - 1]) {
      this.grid.expand();
      this.drawGrid();
      if (this.phase === 'WAVE') this.gridGfx.setAlpha(0.25);
      this.expandVisual();
    }
  }

  /** 다음 레벨까지 필요한 누적 XP. 최대 레벨이면 null */
  nextXpThreshold(): number | null {
    return this.grid.level < this.grid.maxLevel ? XP_THRESHOLDS[this.grid.level - 1] : null;
  }

  // ── 배치 (BUILD) ─────────────────────────────────────────────

  enterPlacement(key: PlaceableKey): void {
    if (this.phase !== 'BUILD') return;
    const def = PLACEABLES[key];
    if (this.gold < def.cost) return;
    this.cancelPlacement();

    const body =
      def.kind === 'structure'
        ? this.add.rectangle(0, 0, 40, 40, def.color, 0.6)
        : this.add.circle(0, 0, 16, def.color, 0.6);
    body.setDepth(10);
    const range = this.add
      .circle(0, 0, def.range, def.color, 0.06)
      .setStrokeStyle(1, def.color, 0.35)
      .setDepth(10);
    this.ghost = { key, body, range };
    this.updateGhost(this.input.activePointer);
  }

  cancelPlacement(): void {
    if (!this.ghost) return;
    this.ghost.body.destroy();
    this.ghost.range.destroy();
    this.ghost = null;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.ghost) this.updateGhost(pointer);
  }

  private updateGhost(pointer: Phaser.Input.Pointer): void {
    if (!this.ghost) return;
    const def = PLACEABLES[this.ghost.key];
    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    const valid = this.grid.isFree(cell.col, cell.row);
    const pos = valid ? this.grid.cellToWorld(cell.col, cell.row) : { x: pointer.worldX, y: pointer.worldY };
    this.ghost.body.setPosition(pos.x, pos.y);
    this.ghost.body.setFillStyle(valid ? def.color : 0xcc4444, 0.6);
    this.ghost.range.setPosition(pos.x, pos.y);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown()) {
      this.cancelPlacement();
      return;
    }
    if (!this.ghost || this.phase !== 'BUILD') return;

    const def = PLACEABLES[this.ghost.key];
    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    if (!this.grid.isFree(cell.col, cell.row) || this.gold < def.cost) return;

    this.gold -= def.cost;
    const p = new Placeable(this, this.ghost.key, cell.col, cell.row);
    this.grid.occupy(cell.col, cell.row);
    this.placeables.push(p);
    this.cancelPlacement();
  }

  // ── 유닛 드래그 재배치 (BUILD) ────────────────────────────────

  private setupUnitDrag(): void {
    this.input.on('dragstart', (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const p = obj.getData('placeable') as Placeable | undefined;
      if (!p || p.def.kind !== 'unit' || !p.alive || this.phase !== 'BUILD' || this.ghost) return;
      const range = this.add
        .circle(p.x, p.y, p.def.range, p.def.color, 0.06)
        .setStrokeStyle(1, p.def.color, 0.35)
        .setDepth(10);
      this.drag = { p, fromCol: p.col, fromRow: p.row, range };
      this.grid.vacate(p.col, p.row);
    });

    this.input.on(
      'drag',
      (_ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        if (!this.drag || obj !== this.drag.p.body) return;
        const cell = this.grid.worldToCell(dragX, dragY);
        const pos = this.grid.isFree(cell.col, cell.row)
          ? this.grid.cellToWorld(cell.col, cell.row)
          : { x: dragX, y: dragY };
        this.drag.p.moveVisual(pos.x, pos.y);
        this.drag.range.setPosition(pos.x, pos.y);
      },
    );

    this.input.on('dragend', (ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      if (!this.drag || obj !== this.drag.p.body) return;
      const { p, fromCol, fromRow, range } = this.drag;
      range.destroy();
      this.drag = null;
      const cell = this.grid.worldToCell(ptr.worldX, ptr.worldY);
      if (this.grid.isFree(cell.col, cell.row)) {
        p.setCell(cell.col, cell.row, this);
      } else {
        p.setCell(fromCol, fromRow, this);
      }
    });
  }

  // ── 시각 효과 ────────────────────────────────────────────────

  spawnHoming(
    x: number,
    y: number,
    target: Enemy,
    damage: number,
    slow: { pct: number; duration: number } | null,
    color: number,
    speed: number,
  ): void {
    this.projectiles.push(new Projectile(this, x, y, color, damage, target, target.x, target.y, null, slow, speed));
  }

  spawnLob(
    x: number,
    y: number,
    tx: number,
    ty: number,
    damage: number,
    aoeRadius: number,
    color: number,
    speed: number,
  ): void {
    this.projectiles.push(new Projectile(this, x, y, color, damage, null, tx, ty, aoeRadius, null, speed));
  }

  meleeVisual(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const slash = this.add.line(0, 0, fromX, fromY, toX, toY, color).setOrigin(0).setLineWidth(2).setDepth(4);
    this.tweens.add({
      targets: slash,
      alpha: 0,
      duration: 120,
      onComplete: () => slash.destroy(),
    });
  }

  explosionVisual(x: number, y: number, radius: number, color: number): void {
    const boom = this.add.circle(x, y, radius, color, 0.3).setDepth(4);
    this.tweens.add({
      targets: boom,
      alpha: 0,
      duration: 250,
      onComplete: () => boom.destroy(),
    });
  }

  private expandVisual(): void {
    const size = (2 * this.grid.halfExtent + 1) * GRID.cellSize;
    const ring = this.add
      .rectangle(this.grid.cx, this.grid.cy, size, size)
      .setStrokeStyle(4, 0x7ee0a3, 0.9)
      .setDepth(5);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 900,
      onComplete: () => ring.destroy(),
    });
  }

  private drawGrid(): void {
    const g = this.gridGfx;
    const h = this.grid.halfExtent;
    const s = this.grid.cellSize;
    const left = this.grid.cx - (h + 0.5) * s;
    const top = this.grid.cy - (h + 0.5) * s;
    const size = (2 * h + 1) * s;

    g.clear();
    g.lineStyle(1, 0xffffff, 0.12);
    for (let i = 0; i <= 2 * h + 1; i++) {
      g.lineBetween(left + i * s, top, left + i * s, top + size);
      g.lineBetween(left, top + i * s, left + size, top + i * s);
    }
    g.lineStyle(2, 0x7ee0a3, 0.45);
    g.strokeRect(left, top, size, size);
  }
}
