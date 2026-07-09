import Phaser from 'phaser';
import { PLACEABLES, PROJECTILE_SPEED, UPGRADE, VETERAN, type PlaceableDef, type PlaceableKey } from '../data/balance';
import { CARD_FX } from '../data/cards';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from './Enemy';

const HP_BAR_WIDTH = 36;

/**
 * 배치물 공통 (유닛/구조물).
 * - 유닛: 사망 시 실루엣만 남고, 다음 BUILD 페이즈에 부활. 드래그 재배치 가능
 * - 구조물: 파괴 시 소멸. BUILD 중 클릭하면 철거 팝업 (부분 환급)
 */
export class Placeable {
  readonly def: PlaceableDef;
  hp: number;
  maxHp: number;
  alive = true;
  col: number;
  row: number;
  x: number;
  y: number;
  /** 업그레이드 단계 (구조물만, 0~UPGRADE.maxLevel) */
  level = 0;
  /** 누적 투자 골드 (건설 + 업그레이드) — 철거 환급 기준 */
  invested: number;
  /** 유닛 누적 킬 (막타 기준). 사망·부활해도 유지 */
  kills = 0;
  /** 유닛 베테랑 계급 (0 신병 / 1 베테랑 / 2 정예) */
  rank = 0;
  /** 적 접촉 판정 반경 */
  readonly contactRadius = 24;

  readonly body: Phaser.GameObjects.Shape;
  private label: Phaser.GameObjects.Text;
  private hpBg: Phaser.GameObjects.Rectangle;
  private hpFill: Phaser.GameObjects.Rectangle;
  private cooldown = 0;

  constructor(scene: GameScene, readonly key: PlaceableKey, col: number, row: number) {
    this.def = PLACEABLES[key];
    this.maxHp = this.def.hp * (this.def.kind === 'structure' ? scene.mods.structHpMult : 1);
    this.hp = this.maxHp;
    this.invested = this.def.cost;
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
      // 신병 훈련소 카드: 새 유닛이 베테랑으로 시작
      if (scene.mods.veteranRecruits) this.promote();
    } else {
      this.body.setInteractive({ useHandCursor: true });
      this.body.on('pointerdown', () => scene.onStructureClicked(this));
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

    const mods = scene.mods;
    this.cooldown = 1 / (this.def.rate * mods.rateMult);
    const dmg = this.effectiveDamage() * mods.damageMult;
    const slow = this.effectiveSlow();
    const speed = this.def.projectileSpeed ?? PROJECTILE_SPEED;

    if (this.def.melee) {
      // 근접: 즉시 타격
      scene.meleeVisual(this.x, this.y, best.x, best.y, this.def.color);
      if (slow) best.applySlow(slow.pct, slow.duration, scene);
      scene.applyHit(best, dmg, this);
    } else if (this.def.aoeRadius) {
      // 광역: 포탄이 발사 시점의 대상 위치로 날아가 폭발 (명중 시 피해)
      scene.spawnLob(this.x, this.y, best.x, best.y, dmg, this.def.aoeRadius, this.def.color, speed, this);
    } else if (this.key === 'cannon' && mods.pierce) {
      // 관통탄 카드: 캐논이 직선 관통 발사체를 쏨
      scene.spawnPierce(
        this.x,
        this.y,
        best.x,
        best.y,
        dmg,
        this.def.color,
        speed,
        this.def.range + CARD_FX.pierceExtraRange,
        this,
      );
    } else if (this.key === 'archer' && mods.doubleShot) {
      // 이중 사격 카드: 짧은 텀을 두고 2연발 ("따당")
      const d2 = dmg * CARD_FX.doubleShotDamagePct;
      scene.spawnHoming(this.x, this.y, best, d2, null, null, this.def.color, speed, this);
      scene.time.delayedCall(CARD_FX.doubleShotDelay * 1000, () => {
        // 그 사이 웨이브가 끝났거나 궁수가 죽었거나 대상이 죽었으면 2발째 생략
        if (scene.phase === 'WAVE' && this.alive && best.hp > 0) {
          scene.spawnHoming(this.x, this.y, best, d2, null, null, this.def.color, speed, this);
        }
      });
    } else {
      // 단일: 대상 추적 발사체 (명중 시 피해)
      const freeze =
        this.key === 'frost' && mods.deepFreeze
          ? { chance: CARD_FX.deepFreezeChance, duration: CARD_FX.deepFreezeDuration }
          : null;
      scene.spawnHoming(this.x, this.y, best, dmg, slow, freeze, this.def.color, speed, this);
    }
  }

  /** 성장 반영 공격력 — 유닛은 베테랑 계급, 구조물은 업그레이드 단계 */
  private effectiveDamage(): number {
    if (this.def.kind === 'unit') {
      const bonus = this.rank > 0 ? VETERAN.damageBonus[this.rank - 1] : 0;
      return this.def.damage * (1 + bonus);
    }
    return this.def.damage * (1 + UPGRADE.damagePerLevel * this.level);
  }

  get isMaxRank(): boolean {
    return this.rank >= VETERAN.killThresholds.length;
  }

  /** 막타 킬 적립. 진급 조건 도달 시 자동 진급 */
  addKill(scene: GameScene): void {
    if (this.def.kind !== 'unit') return;
    this.kills++;
    while (!this.isMaxRank && this.kills >= VETERAN.killThresholds[this.rank]) {
      this.promote();
      scene.toast(`${this.def.name} ${VETERAN.rankNames[this.rank - 1]} 진급!`);
    }
  }

  /** 1계급 진급 (킬 수를 해당 계급 요구치까지 끌어올림 — 훈장 수여 카드 대응) */
  promote(): void {
    if (this.def.kind !== 'unit' || this.isMaxRank) return;
    this.rank++;
    this.kills = Math.max(this.kills, VETERAN.killThresholds[this.rank - 1]);
    // 최고 계급: 최대 HP 보너스 (현재 HP도 증가분만큼 회복)
    if (this.isMaxRank) {
      const newMax = this.def.hp * (1 + VETERAN.eliteHpBonus);
      this.hp += newMax - this.maxHp;
      this.maxHp = newMax;
    }
    this.label.setText(this.def.short + '★'.repeat(this.rank));
    this.body.setStrokeStyle(2, this.rank >= 2 ? 0xf5d547 : 0xffffff, 1);
  }

  /** 업그레이드 반영 슬로우 (프로스트: 단계당 감속률 +10%p) */
  private effectiveSlow(): { pct: number; duration: number } | null {
    if (!this.def.slow) return null;
    return { pct: this.def.slow.pct + UPGRADE.frostSlowPerLevel * this.level, duration: this.def.slow.duration };
  }

  get isMaxLevel(): boolean {
    return this.level >= UPGRADE.maxLevel;
  }

  /** 다음 단계 업그레이드 비용. 최대 레벨이면 null */
  upgradeCost(): number | null {
    if (this.def.kind !== 'structure' || this.isMaxLevel) return null;
    return Math.round(this.def.cost * UPGRADE.costPct[this.level]);
  }

  /** 골드가 충분하면 업그레이드. 성공 여부 반환 */
  tryUpgrade(scene: GameScene): boolean {
    const cost = this.upgradeCost();
    if (cost === null || scene.gold < cost) return false;
    scene.gold -= cost;
    this.invested += cost;
    this.level++;
    this.label.setText(`${this.def.short}+${this.level}`);
    return true;
  }

  takeDamage(amount: number, scene: GameScene, attacker?: Enemy): void {
    if (!this.alive) return;
    // 가시 갑옷 카드: 검병이 받은 피해를 반사 (반사 킬도 검병 크레딧)
    if (attacker && scene.mods.thorns && this.key === 'swordsman') {
      attacker.takeDamage(amount * CARD_FX.thornsReflectPct, scene, this);
    }
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
    this.hpFill.setVisible(true).setScale(this.hp / this.maxHp, 1);
  }

  /** 유닛 부활 (BUILD 페이즈 시작 시) */
  revive(scene: GameScene): void {
    if (this.def.kind !== 'unit' || this.alive) return;
    this.alive = true;
    this.hp = this.maxHp;
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
