import Phaser from 'phaser';
import { EQUIPMENT, PLACEABLES, PROJECTILE_SPEED, SPECIALIZE, UPGRADE, VETERAN, type EquipmentDef, type PlaceableDef, type PlaceableKey, type SpecializeDef } from '../data/balance';
import { CARD_FX } from '../data/cards';
import type { GameScene } from '../scenes/GameScene';
import type { SavedPlaceable } from '../systems/SaveGame';
import { UI } from '../systems/ui';
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
  /** 유닛 장비 보유 (유닛당 1회 구매) */
  equipped = false;
  /** 적 접촉 판정 반경 */
  readonly contactRadius = 24;

  readonly body: Phaser.GameObjects.Image;
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

    this.body = scene.add.image(pos.x, pos.y, key).setDepth(2);
    const targetH = this.def.kind === 'structure' ? 66 : 56;
    this.body.setScale(targetH / this.body.height);
    this.body.setData('placeable', this);

    this.label = scene.add
      .text(pos.x, pos.y + 14, this.def.short, { fontSize: '13px', color: '#ffffff', fontFamily: UI.FONT })
      .setOrigin(0.5)
      .setDepth(2)
      .setShadow(1, 1, '#000000', 2);

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
      // 클릭(드래그 아님) → 정보·장비 팝업. 드래그 구분은 dragDistanceThreshold + lastDragEndAt
      this.body.on('pointerup', () => scene.onUnitClicked(this));
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

    // 프로스트 특화(절대 영도): 주기 공격 대신 사거리 내 모든 적 상시 감속
    if (this.def.slow && this.specialize?.aura) {
      const slow = this.effectiveSlow()!;
      for (const e of scene.enemies) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
        if (d <= this.range + e.def.radius) e.applySlow(slow.pct, 0.3, scene); // 짧게 계속 갱신 = 상시
      }
      return;
    }

    // 무공격 구조물 (발전기·바리케이드)
    if (this.def.rate <= 0 || this.def.damage <= 0) return;

    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const e of scene.enemies) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
      if (d <= this.range + e.def.radius && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    if (!best) return;

    const mods = scene.mods;
    this.cooldown = 1 / (this.def.rate * mods.rateMult);
    let dmg = this.effectiveDamage() * mods.damageMult;
    // 캐논 특화(과충전 탄두): 확률 치명타
    const spec = this.specialize;
    if (spec?.critChance && spec.critMult && Math.random() < spec.critChance) {
      dmg *= spec.critMult;
    }
    const slow = this.effectiveSlow();
    const speed = this.def.projectileSpeed ?? PROJECTILE_SPEED;
    if (!this.def.melee && !this.def.chain) {
      scene.sfx.play('shoot');
      // 총구 섬광 (대상 방향으로 살짝 오프셋)
      const a = Math.atan2(best.y - this.y, best.x - this.x);
      scene.muzzleFlash(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 16, this.def.color);
    }

    if (this.def.chain) {
      // 테슬라: 즉시 명중 연쇄 번개 — 가까운 적으로 튀며 감쇠
      this.chainAttack(scene, best, dmg);
    } else if (this.def.melee) {
      // 근접: 즉시 타격
      scene.meleeVisual(this.x, this.y, best.x, best.y, this.def.color);
      scene.sfx.play('melee');
      if (slow) best.applySlow(slow.pct, slow.duration, scene);
      scene.applyHit(best, dmg, this);
    } else if (this.def.aoeRadius) {
      // 광역: 포탄이 발사 시점의 대상 위치로 날아가 폭발 (명중 시 피해). 특화(광역 확장) 반영
      const aoe = spec?.aoeRadius ?? this.def.aoeRadius;
      scene.spawnLob(this.x, this.y, best.x, best.y, dmg, aoe, this.def.color, speed, this);
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

  /** 테슬라 연쇄: 첫 대상에서 탐색 반경 내 다음 적으로 튀며 감쇠 피해 */
  private chainAttack(scene: GameScene, first: Enemy, dmg: number): void {
    const chain = this.def.chain!;
    const mods = scene.mods;
    const maxTargets = mods.overloadCoil
      ? Number.POSITIVE_INFINITY
      : chain.targets + (this.specialize?.chainBonus ?? 0);
    const decay = mods.overloadCoil ? CARD_FX.overloadCoilDecay : chain.decay;

    const hits: Enemy[] = [first];
    let cur = first;
    while (hits.length < maxTargets) {
      let next: Enemy | null = null;
      let nd = Infinity;
      for (const e of scene.enemies) {
        if (e.hp <= 0 || hits.includes(e)) continue;
        const d = Phaser.Math.Distance.Between(cur.x, cur.y, e.x, e.y);
        if (d <= chain.radius && d < nd) {
          next = e;
          nd = d;
        }
      }
      if (!next) break;
      hits.push(next);
      cur = next;
    }

    // 피해 적용 전에 경로를 그린다 (사망으로 좌표가 사라지기 전에)
    scene.lightningVisual([{ x: this.x, y: this.y - 14 }, ...hits.map((e) => ({ x: e.x, y: e.y }))], this.def.color);
    scene.sfx.play('zap');
    let d = dmg;
    for (const e of hits) {
      scene.applyHit(e, d, this);
      d *= 1 - decay;
    }
  }

  /** 최대 강화(Lv3) 도달 시의 특화 정의. 미도달·해당 없음이면 null */
  get specialize(): SpecializeDef | null {
    if (this.def.kind !== 'structure' || !this.isMaxLevel) return null;
    return SPECIALIZE[this.key] ?? null;
  }

  /** 장비 반영 사거리 */
  get range(): number {
    const eq = this.equipped ? EQUIPMENT[this.key] : undefined;
    return this.def.range + (eq?.rangeBonus ?? 0);
  }

  /** 이 유닛이 구매할 수 있는 장비 정의 (구조물·해당 없음이면 null) */
  get equipment(): EquipmentDef | null {
    return EQUIPMENT[this.key] ?? null;
  }

  /** 골드가 충분하면 장비 구매·즉시 적용. 성공 여부 반환 */
  buyEquipment(scene: GameScene): boolean {
    const eq = this.equipment;
    if (!eq || this.equipped || scene.gold < eq.cost) return false;
    scene.gold -= eq.cost;
    this.equipped = true;
    if (eq.hpMult) {
      const add = this.maxHp * (eq.hpMult - 1);
      this.maxHp += add;
      this.hp += add;
    }
    return true;
  }

  /** 발전기 웨이브 클리어 수익 (업그레이드·특화·복리 배당 반영). 발전기가 아니면 0 */
  waveIncome(scene: GameScene): number {
    if (!this.def.income) return 0;
    let inc = this.def.income * (1 + UPGRADE.generatorIncomePerLevel * this.level);
    inc *= this.specialize?.incomeMult ?? 1;
    return Math.round(inc * scene.mods.generatorIncomeMult);
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
      scene.sfx.play('promote');
    }
  }

  /** 1계급 진급 (킬 수를 해당 계급 요구치까지 끌어올림 — 훈장 수여 카드 대응) */
  promote(): void {
    if (this.def.kind !== 'unit' || this.isMaxRank) return;
    this.rank++;
    this.kills = Math.max(this.kills, VETERAN.killThresholds[this.rank - 1]);
    // 최고 계급: 최대 HP 보너스 (가산 — 장비 보너스를 덮어쓰지 않도록)
    if (this.isMaxRank) {
      const add = this.def.hp * VETERAN.eliteHpBonus;
      this.maxHp += add;
      this.hp += add;
    }
    this.label.setText(this.def.short + '★'.repeat(this.rank));
    this.label.setColor(this.rank >= 2 ? '#f5d547' : '#ffffff');
  }

  /** 업그레이드 반영 슬로우 (프로스트: 단계당 감속률 +10%p) */
  private effectiveSlow(): { pct: number; duration: number } | null {
    if (!this.def.slow) return null;
    return { pct: this.def.slow.pct + UPGRADE.frostSlowPerLevel * this.level, duration: this.def.slow.duration };
  }

  get isMaxLevel(): boolean {
    return this.level >= UPGRADE.maxLevel;
  }

  /** 강화 팝업용 — 현재 → 다음 단계의 대표 수치 미리보기 (런 수정치 반영). 최대 레벨·해당 없음이면 null */
  upgradePreview(scene: GameScene): { label: string; from: string; to: string } | null {
    if (this.def.kind !== 'structure' || this.isMaxLevel) return null;
    const next = this.level + 1;
    // 프로스트: 공격력(2)보다 감속률이 대표 수치
    if (this.key === 'frost' && this.def.slow) {
      const pct = (l: number) => Math.round((this.def.slow!.pct + UPGRADE.frostSlowPerLevel * l) * 100);
      return { label: '감속', from: `${pct(this.level)}%`, to: `${pct(next)}%` };
    }
    if (this.def.income) {
      const inc = (l: number) =>
        Math.round(this.def.income! * (1 + UPGRADE.generatorIncomePerLevel * l) * scene.mods.generatorIncomeMult);
      return { label: '수익', from: `+${inc(this.level)}G`, to: `+${inc(next)}G` };
    }
    if (this.key === 'barricade') {
      const hp = (l: number) => Math.round(this.def.hp * scene.mods.structHpMult * (1 + UPGRADE.barricadeHpPerLevel * l));
      return { label: '최대 HP', from: `${hp(this.level)}`, to: `${hp(next)}` };
    }
    if (this.def.damage > 0) {
      const dmg = (l: number) => Math.round(this.def.damage * (1 + UPGRADE.damagePerLevel * l) * scene.mods.damageMult);
      return { label: '공격', from: `${dmg(this.level)}`, to: `${dmg(next)}` };
    }
    return null;
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
    // 바리케이드: 업그레이드 효과가 공격력이 아닌 최대 HP (+50%/단계)
    if (this.key === 'barricade') {
      const newMax = this.def.hp * scene.mods.structHpMult * (1 + UPGRADE.barricadeHpPerLevel * this.level);
      this.hp += Math.max(0, newMax - this.maxHp);
      this.maxHp = newMax;
    }
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
        // 바리케이드 특화(반응 장갑): 파괴 시 주변 폭발
        const spec = this.specialize;
        if (spec?.novaDamage && spec.novaRadius) {
          scene.explosionVisual(this.x, this.y, spec.novaRadius, this.def.color);
          scene.sfx.play('explosion');
          for (const e of [...scene.enemies]) {
            const d = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
            if (d <= spec.novaRadius + e.def.radius) e.takeDamage(spec.novaDamage, scene);
          }
        }
        scene.deathBurst(this.x, this.y, this.def.color);
        this.destroyVisuals();
        scene.removePlaceable(this);
      }
      return;
    }
    this.hpBg.setVisible(true);
    this.hpFill.setVisible(true).setScale(this.hp / this.maxHp, 1);
  }

  /** 저장된 런 복원 — 성장 상태를 통째로 되살리고 라벨을 다시 그린다 (이어하기) */
  restoreFrom(s: SavedPlaceable): void {
    this.level = s.level;
    this.invested = s.invested;
    this.kills = s.kills;
    this.rank = s.rank;
    this.equipped = s.equipped;
    this.maxHp = s.maxHp;
    this.hp = s.hp;
    if (this.def.kind === 'unit') {
      this.label.setText(this.def.short + '★'.repeat(this.rank));
      this.label.setColor(this.rank >= 2 ? '#f5d547' : '#ffffff');
    } else if (this.level > 0) {
      this.label.setText(`${this.def.short}+${this.level}`);
    }
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
    this.label.setPosition(x, y + 14);
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
