import Phaser from 'phaser';
import { ENEMIES, type EnemyDef, type EnemyKey } from '../data/balance';
import type { GameScene } from '../scenes/GameScene';
import type { Placeable } from './Placeable';

const HP_BAR_WIDTH = 26;
const FROZEN_COLOR = 0xbfe8ff;
const SLOW_COLOR = 0x9fd0ff;
const HIT_FLASH_MS = 70;

/**
 * 적. 코어를 향해 직진하며, 경로에서 배치물과 접촉하면
 * kamikaze는 자폭, attacker는 대상을 파괴할 때까지 주기 공격한다.
 */
export class Enemy {
  readonly def: EnemyDef;
  hp: number;
  readonly maxHp: number;
  x: number;
  y: number;

  private body: Phaser.GameObjects.Image;
  private baseScale: number;
  private hpBg: Phaser.GameObjects.Rectangle;
  private hpGhost: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private slowUntil = 0;
  private slowPct = 0;
  private frozenUntil = 0;
  private flashUntil = 0;
  private target: Placeable | null = null;
  private attackingCore = false;
  private attackCooldown = 0;
  private dead = false;

  constructor(scene: GameScene, readonly key: EnemyKey, x: number, y: number, hpScale: number) {
    this.def = ENEMIES[key];
    this.maxHp = Math.round(this.def.hp * hpScale);
    this.hp = this.maxHp;
    this.x = x;
    this.y = y;

    // 스프라이트 높이를 판정 반경에 맞춰 스케일 (radius는 충돌 판정에 계속 사용)
    this.body = scene.add.image(x, y, key).setDepth(3);
    this.baseScale = (this.def.radius * 4.4) / this.body.height;
    this.body.setScale(this.baseScale);
    this.hpBg = scene.add
      .rectangle(x - HP_BAR_WIDTH / 2, y - this.def.radius - 8, HP_BAR_WIDTH, 4, 0x2a2a2a)
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setVisible(false);
    // 피해 잔상: 이전 HP가 밝게 남았다가 뒤따라 줄어든다
    this.hpGhost = scene.add
      .rectangle(x - HP_BAR_WIDTH / 2, y - this.def.radius - 8, HP_BAR_WIDTH, 4, 0xffe0d8)
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setVisible(false);
    this.hpFill = scene.add
      .rectangle(x - HP_BAR_WIDTH / 2, y - this.def.radius - 8, HP_BAR_WIDTH, 4, 0xff7766)
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setVisible(false);
  }

  update(dt: number, scene: GameScene): void {
    const now = scene.gameNow;
    // 틴트 우선순위: 피격 플래시(흰색) > 빙결 > 슬로우
    if (now < this.flashUntil) this.body.setTint(0xffffff);
    else if (now < this.frozenUntil) this.body.setTint(FROZEN_COLOR);
    else if (now < this.slowUntil) this.body.setTint(SLOW_COLOR);
    else this.body.clearTint();
    // 빙결: 이동·공격 모두 정지
    if (now < this.frozenUntil) return;

    // 공격형: 붙잡은 대상을 attackInterval 주기로 타격
    if (this.def.behavior === 'attacker') {
      if (this.target && !this.target.alive) this.target = null;
      if (this.target || this.attackingCore) {
        this.attackCooldown -= dt;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = this.def.attackInterval ?? 1;
          this.attackVisual(scene);
          if (this.target) this.target.takeDamage(this.def.damage, scene, this);
          else scene.damageCore(this.def.damage);
        }
        return;
      }
    }

    // 코어를 향해 이동 (슬로우 반영)
    const slowed = scene.gameNow < this.slowUntil;
    const speed = this.def.speed * (slowed ? 1 - this.slowPct : 1);
    const dx = scene.grid.cx - this.x;
    const dy = scene.grid.cy - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.x += (dx / dist) * speed * dt;
    this.y += (dy / dist) * speed * dt;
    this.syncVisuals();
    this.body.setAlpha(slowed ? 0.6 : 1);

    // 코어 접촉
    if (dist <= scene.coreRadius + this.def.radius) {
      if (this.def.behavior === 'kamikaze') {
        scene.damageCore(this.def.damage);
        this.die(scene, false);
      } else {
        this.attackingCore = true;
        this.attackCooldown = this.def.attackInterval ?? 1; // 첫 타격 전 준비 시간
      }
      return;
    }

    // 배치물 접촉 (가장 가까운 것)
    let hit: Placeable | null = null;
    let hitDist = Infinity;
    for (const p of scene.placeables) {
      if (!p.alive) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (d <= this.def.radius + p.contactRadius && d < hitDist) {
        hit = p;
        hitDist = d;
      }
    }
    if (hit) {
      if (this.def.behavior === 'kamikaze') {
        hit.takeDamage(this.def.damage, scene, this);
        this.die(scene, false);
      } else {
        this.target = hit;
        this.attackCooldown = this.def.attackInterval ?? 1; // 첫 타격 전 준비 시간
      }
    }
  }

  takeDamage(amount: number, scene: GameScene, killer?: Placeable): void {
    if (this.dead || this.hp <= 0) return;
    const prevRatio = Math.max(this.hp / this.maxHp, 0);
    this.hp -= amount;
    if (this.hp <= 0) {
      this.die(scene, true, killer);
      return;
    }
    // 피격 반응: 흰색 플래시 + 살짝 커졌다 복귀 (절대값 복귀 → 연타 시 드리프트 없음)
    this.flashUntil = scene.gameNow + HIT_FLASH_MS;
    this.body.setTint(0xffffff);
    this.body.setScale(this.baseScale * 1.18);
    scene.tweens.add({ targets: this.body, scale: this.baseScale, duration: 90 });
    const ratio = Math.max(this.hp / this.maxHp, 0);
    this.hpBg.setVisible(true);
    this.hpFill.setVisible(true).setScale(ratio, 1);
    // 잔상: 이전 비율에서 잠깐 머문 뒤 현재 비율로 따라온다
    scene.tweens.killTweensOf(this.hpGhost);
    this.hpGhost.setVisible(true).setScale(Math.max(this.hpGhost.scaleX, prevRatio), 1);
    scene.tweens.add({ targets: this.hpGhost, scaleX: ratio, delay: 150, duration: 200, ease: 'Cubic.easeOut' });
  }

  applySlow(pct: number, durationSec: number, scene: GameScene): void {
    this.slowPct = pct;
    this.slowUntil = scene.gameNow + durationSec * 1000;
  }

  applyFreeze(durationSec: number, scene: GameScene): void {
    this.frozenUntil = scene.gameNow + durationSec * 1000;
  }

  /** 슬로우 또는 빙결 상태인지 (약점 포착 카드 판정용) */
  isHampered(now: number): boolean {
    return now < this.slowUntil || now < this.frozenUntil;
  }

  /** 타격 순간 몸체가 커졌다 돌아오는 펀치 연출 */
  private attackVisual(scene: GameScene): void {
    this.body.setScale(this.baseScale * 1.35);
    scene.tweens.add({ targets: this.body, scale: this.baseScale, duration: 140 });
  }

  private syncVisuals(): void {
    this.body.setPosition(this.x, this.y);
    this.hpBg.setPosition(this.x - HP_BAR_WIDTH / 2, this.y - this.def.radius - 8);
    this.hpGhost.setPosition(this.x - HP_BAR_WIDTH / 2, this.y - this.def.radius - 8);
    this.hpFill.setPosition(this.x - HP_BAR_WIDTH / 2, this.y - this.def.radius - 8);
  }

  private die(scene: GameScene, killed: boolean, killer?: Placeable): void {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    scene.tweens.killTweensOf(this.hpGhost);
    this.body.destroy();
    this.hpBg.destroy();
    this.hpGhost.destroy();
    this.hpFill.destroy();
    scene.onEnemyDead(this, killed, killer);
  }
}
