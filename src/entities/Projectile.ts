import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './Enemy';

/**
 * 발사체. 피해는 발사 시점이 아니라 명중 시점에 적용된다.
 * - homing (target 있음): 단일 대상을 추적, 명중 시 피해(+슬로우)
 * - lob (target 없음): 발사 시점에 정한 지점으로 날아가 도착 지점에서 광역 폭발
 */
export class Projectile {
  x: number;
  y: number;
  private body: Phaser.GameObjects.Arc;

  constructor(
    scene: GameScene,
    x: number,
    y: number,
    private readonly color: number,
    private readonly damage: number,
    private readonly target: Enemy | null,
    private tx: number,
    private ty: number,
    private readonly aoeRadius: number | null,
    private readonly slow: { pct: number; duration: number } | null,
    private readonly speed: number,
  ) {
    this.x = x;
    this.y = y;
    this.body = scene.add.circle(x, y, aoeRadius ? 6 : 4, color).setDepth(4);
  }

  /** true 반환 시 소멸 (배열에서 제거) */
  update(dt: number, scene: GameScene): boolean {
    // 추적 대상이 이미 죽었으면 발사체도 소멸 (피해 없음)
    if (this.target) {
      if (this.target.hp <= 0) {
        this.body.destroy();
        return true;
      }
      this.tx = this.target.x;
      this.ty = this.target.y;
    }

    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    const hitDist = this.target ? this.target.def.radius + 4 : 6;

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
    if (this.aoeRadius !== null) {
      scene.explosionVisual(this.tx, this.ty, this.aoeRadius, this.color);
      for (const e of [...scene.enemies]) {
        if (Phaser.Math.Distance.Between(this.tx, this.ty, e.x, e.y) <= this.aoeRadius + e.def.radius) {
          e.takeDamage(this.damage, scene);
        }
      }
    } else if (this.target) {
      if (this.slow) this.target.applySlow(this.slow.pct, this.slow.duration, scene);
      this.target.takeDamage(this.damage, scene);
    }
  }
}
