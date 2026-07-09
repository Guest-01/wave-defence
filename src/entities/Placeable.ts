import Phaser from 'phaser';
import { PLACEABLES, PROJECTILE_SPEED, type PlaceableDef, type PlaceableKey } from '../data/balance';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './Enemy';

const HP_BAR_WIDTH = 36;

/**
 * 배치물 공통 (유닛/구조물).
 * - 유닛: 사망 시 실루엣만 남고, 다음 BUILD 페이즈에 부활. 드래그 재배치 가능
 * - 구조물: 파괴 시 소멸
 */
export class Placeable {
  readonly def: PlaceableDef;
  hp: number;
  alive = true;
  col: number;
  row: number;
  x: number;
  y: number;
  /** 적 접촉 판정 반경 */
  readonly contactRadius = 24;

  readonly body: Phaser.GameObjects.Shape;
  private label: Phaser.GameObjects.Text;
  private hpBg: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private cooldown = 0;

  constructor(scene: GameScene, readonly key: PlaceableKey, col: number, row: number) {
    this.def = PLACEABLES[key];
    this.hp = this.def.hp;
    this.col = col;
    this.row = row;
    const pos = scene.grid.cellToWorld(col, row);
    this.x = pos.x;
    this.y = pos.y;

    this.body =
      this.def.kind === 'structure'
        ? scene.add.rectangle(pos.x, pos.y, 40, 40, this.def.color)
        : scene.add.circle(pos.x, pos.y, 16, this.def.color);
    this.body.setDepth(2);
    this.body.setData('placeable', this);

    this.label = scene.add
      .text(pos.x, pos.y, this.def.short, { fontSize: '14px', color: '#ffffff', fontFamily: 'sans-serif' })
      .setOrigin(0.5)
      .setDepth(2);

    this.hpBg = scene.add
      .rectangle(pos.x - HP_BAR_WIDTH / 2, pos.y + 26, HP_BAR_WIDTH, 4, 0x2a2a2a)
      .setOrigin(0, 0.5)
      .setDepth(2)
      .setVisible(false);
    this.hpFill = scene.add
      .rectangle(pos.x - HP_BAR_WIDTH / 2, pos.y + 26, HP_BAR_WIDTH, 4, 0x7ee0a3)
      .setOrigin(0, 0.5)
      .setDepth(2)
      .setVisible(false);

    if (this.def.kind === 'unit') {
      this.body.setInteractive({ useHandCursor: true });
      scene.input.setDraggable(this.body);
    }
  }

  /** 전투 업데이트: 사거리 내 가장 가까운 적을 공격 */
  update(dt: number, scene: GameScene): void {
    if (!this.alive) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const e of scene.enemies) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d <= this.def.range + e.def.radius && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    if (!best) return;

    this.cooldown = 1 / this.def.rate;
    if (this.def.melee) {
      // 근접: 즉시 타격
      scene.meleeVisual(this.x, this.y, best.x, best.y, this.def.color);
      if (this.def.slow) best.applySlow(this.def.slow.pct, this.def.slow.duration, scene);
      best.takeDamage(this.def.damage, scene);
    } else if (this.def.aoeRadius) {
      // 광역: 포탄이 발사 시점의 대상 위치로 날아가 폭발 (명중 시 피해)
      const speed = this.def.projectileSpeed ?? PROJECTILE_SPEED;
      scene.spawnLob(this.x, this.y, best.x, best.y, this.def.damage, this.def.aoeRadius, this.def.color, speed);
    } else {
      // 단일: 대상 추적 발사체 (명중 시 피해)
      const speed = this.def.projectileSpeed ?? PROJECTILE_SPEED;
      scene.spawnHoming(this.x, this.y, best, this.def.damage, this.def.slow ?? null, this.def.color, speed);
    }
  }

  takeDamage(amount: number, scene: GameScene): void {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      scene.grid.vacate(this.col, this.row);
      if (this.def.kind === 'unit') {
        // 실루엣: 다음 BUILD에 부활 예정
        this.body.setAlpha(0.15);
        this.label.setAlpha(0.15);
        this.hpBg.setVisible(false);
        this.hpFill.setVisible(false);
      } else {
        this.destroyVisuals();
        scene.removePlaceable(this);
      }
      return;
    }
    this.hpBg.setVisible(true);
    this.hpFill.setVisible(true).setScale(this.hp / this.def.hp, 1);
  }

  /** 유닛 부활 (BUILD 페이즈 시작 시) */
  revive(scene: GameScene): void {
    if (this.def.kind !== 'unit' || this.alive) return;
    this.alive = true;
    this.hp = this.def.hp;
    scene.grid.occupy(this.col, this.row);
    this.body.setAlpha(1);
    this.label.setAlpha(1);
    this.hpBg.setVisible(false);
    this.hpFill.setVisible(false);
  }

  /** 시각 요소만 이동 (드래그 중) */
  moveVisual(x: number, y: number): void {
    this.body.setPosition(x, y);
    this.label.setPosition(x, y);
    this.hpBg.setPosition(x - HP_BAR_WIDTH / 2, y + 26);
    this.hpFill.setPosition(x - HP_BAR_WIDTH / 2, y + 26);
  }

  /** 셀 확정 이동 (점유 갱신 포함) */
  setCell(col: number, row: number, scene: GameScene): void {
    this.col = col;
    this.row = row;
    scene.grid.occupy(col, row);
    const pos = scene.grid.cellToWorld(col, row);
    this.x = pos.x;
    this.y = pos.y;
    this.moveVisual(pos.x, pos.y);
  }

  destroyVisuals(): void {
    this.body.destroy();
    this.label.destroy();
    this.hpBg.destroy();
    this.hpFill.destroy();
  }
}
