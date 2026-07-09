import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './Enemy';
import type { Placeable } from './Placeable';

export interface ProjectileOpts {
  x: number;
  y: number;
  color: number;
  damage: number;
  speed: number;
  /** homing 대상 (없으면 lob/pierce) */
  target?: Enemy;
  /** 목표 지점 (lob 낙하점 / pierce 방향 기준) */
  tx: number;
  ty: number;
  /** lob 전용: 도착 지점 광역 반경 */
  aoeRadius?: number;
  slow?: { pct: number; duration: number };
  freeze?: { chance: number; duration: number };
  /** pierce 전용: 이 거리만큼 직진하며 경로상 적을 모두 타격 */
  pierceDist?: number;
  /** 발사자 (막타 킬 크레딧용) */
  source?: Placeable;
}

/**
 * 발사체. 피해는 발사 시점이 아니라 명중 시점에 적용된다.
 * - homing: 단일 대상 추적, 명중 시 피해(+슬로우/빙결)
 * - lob: 발사 시점에 정한 지점으로 날아가 도착 지점에서 광역 폭발
 * - pierce: 직선으로 날아가며 경로상 모든 적을 1회씩 타격 (관통탄 카드)
 */
export class Projectile {
  x: number;
  y: number;
  private body: Phaser.GameObjects.Arc;
  private tx: number;
  private ty: number;
  private dirX = 0;
  private dirY = 0;
  private traveled = 0;
  private hitEnemies = new Set<Enemy>();

  constructor(scene: GameScene, private readonly o: ProjectileOpts) {
    this.x = o.x;
    this.y = o.y;
    this.tx = o.tx;
    this.ty = o.ty;
    this.body = scene.add.circle(o.x, o.y, o.aoeRadius ? 6 : 4, o.color).setDepth(4);
    if (o.pierceDist) {
      const d = Math.hypot(o.tx - o.x, o.ty - o.y) || 1;
      this.dirX = (o.tx - o.x) / d;
      this.dirY = (o.ty - o.y) / d;
    }
  }

  /** true 반환 시 소멸 (배열에서 제거) */
  update(dt: number, scene: GameScene): boolean {
    const step = this.o.speed * dt;

    // 관통 모드: 직진하며 스치는 적 모두 타격
    if (this.o.pierceDist) {
      this.x += this.dirX * step;
      this.y += this.dirY * step;
      this.traveled += step;
      this.body.setPosition(this.x, this.y);
      for (const e of [...scene.enemies]) {
        if (this.hitEnemies.has(e)) continue;
        if (Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y) <= e.def.radius + 6) {
          this.hitEnemies.add(e);
          scene.applyHit(e, this.o.damage, this.o.source);
        }
      }
      if (this.traveled >= this.o.pierceDist) {
        this.body.destroy();
        return true;
      }
      return false;
    }

    // 추적 대상이 이미 죽었으면 발사체도 소멸 (피해 없음)
    if (this.o.target) {
      if (this.o.target.hp <= 0) {
        this.body.destroy();
        return true;
      }
      this.tx = this.o.target.x;
      this.ty = this.o.target.y;
    }

    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    const hitDist = this.o.target ? this.o.target.def.radius + 4 : 6;

    if (dist <= hitDist || step >= dist) {
      this.impact(scene);
      this.body.destroy();
      return true;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.body.setPosition(this.x, this.y);
    return false;
  }

  destroy(): void {
    this.body.destroy();
  }

  private impact(scene: GameScene): void {
    if (this.o.aoeRadius) {
      scene.explosionVisual(this.tx, this.ty, this.o.aoeRadius, this.o.color);
      if (scene.mods.fireGround) scene.spawnFireGround(this.tx, this.ty, this.o.aoeRadius);
      for (const e of [...scene.enemies]) {
        if (Phaser.Math.Distance.Between(this.tx, this.ty, e.x, e.y) <= this.o.aoeRadius + e.def.radius) {
          scene.applyHit(e, this.o.damage, this.o.source);
        }
      }
    } else if (this.o.target) {
      if (this.o.slow) this.o.target.applySlow(this.o.slow.pct, this.o.slow.duration, scene);
      if (this.o.freeze && Math.random() < this.o.freeze.chance) {
        this.o.target.applyFreeze(this.o.freeze.duration, scene);
      }
      scene.applyHit(this.o.target, this.o.damage, this.o.source);
    }
  }
}
