import Phaser from 'phaser';
import {
  BOSS_HP,
  CORE,
  DEMOLISH_REFUND,
  ENEMIES,
  GRID,
  PLACEABLES,
  START_GOLD,
  VETERAN,
  WAVE_HP_SCALE,
  WORLD,
  XP_THRESHOLDS,
  type EnemyKey,
  type PlaceableKey,
} from '../data/balance';
import { CARDS, CARD_FX, type CardKey } from '../data/cards';
import { WAVES, type Direction } from '../data/waves';
import { Enemy } from '../entities/Enemy';
import { Placeable } from '../entities/Placeable';
import { Projectile } from '../entities/Projectile';
import { Grid, type Cell } from '../systems/Grid';
import { Sfx } from '../systems/Sfx';

export type Phase = 'BUILD' | 'WAVE' | 'DRAFT' | 'END';

/** 드래프트 카드로 획득한 수정치·특성 모음 */
export interface Mods {
  pierce: boolean;
  fireGround: boolean;
  deepFreeze: boolean;
  doubleShot: boolean;
  thorns: boolean;
  coreDischarge: boolean;
  exposeWeakness: boolean;
  bounty: boolean;
  interest: boolean;
  refundRate: number;
  damageMult: number;
  rateMult: number;
  structHpMult: number;
  pendingReinforcements: number;
  /** 신병 훈련소: 새 유닛이 베테랑으로 시작 */
  veteranRecruits: boolean;
}

interface PendingSpawn {
  at: number;
  enemy: EnemyKey;
  direction: Direction;
}

interface Ghost {
  key: PlaceableKey;
  body: Phaser.GameObjects.Image;
  range: Phaser.GameObjects.Arc;
}

interface DragState {
  p: Placeable;
  fromCol: number;
  fromRow: number;
  range: Phaser.GameObjects.Arc;
}

interface GroundFire {
  x: number;
  y: number;
  radius: number;
  until: number;
  gfx: Phaser.GameObjects.Arc;
}

interface StructUi {
  parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[];
  openedAt: number;
}

export class GameScene extends Phaser.Scene {
  phase: Phase = 'BUILD';
  gold = START_GOLD;
  xp = 0;
  coreHp = CORE.maxHp;
  coreMaxHp = CORE.maxHp;
  waveIndex = 0;
  victory = false;
  grid = new Grid();
  placeables: Placeable[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  mods: Mods = this.freshMods();
  readonly coreRadius = CORE.radius;
  /** 씬 재시작에도 AudioContext를 유지하기 위해 인스턴스 필드로 1회 생성 */
  readonly sfx = new Sfx();
  private lastShakeAt = 0;

  private acquired = new Set<CardKey>();
  private pending: PendingSpawn[] = [];
  private waveClock = 0;
  private fires: GroundFire[] = [];
  private dischargeTimer = 0;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private ghost: Ghost | null = null;
  private drag: DragState | null = null;
  private structUi: StructUi | null = null;

  constructor() {
    super('Game');
  }

  private freshMods(): Mods {
    return {
      pierce: false,
      fireGround: false,
      deepFreeze: false,
      doubleShot: false,
      thorns: false,
      coreDischarge: false,
      exposeWeakness: false,
      bounty: false,
      interest: false,
      refundRate: DEMOLISH_REFUND,
      damageMult: 1,
      rateMult: 1,
      structHpMult: 1,
      pendingReinforcements: 0,
      veteranRecruits: false,
    };
  }

  create(): void {
    // 씬 재시작 대비 상태 초기화
    this.phase = 'BUILD';
    this.gold = START_GOLD;
    this.xp = 0;
    this.coreHp = CORE.maxHp;
    this.coreMaxHp = CORE.maxHp;
    this.waveIndex = 0;
    this.victory = false;
    this.grid = new Grid();
    this.placeables = [];
    this.enemies = [];
    this.projectiles = [];
    this.mods = this.freshMods();
    this.acquired = new Set();
    this.pending = [];
    this.fires = [];
    this.dischargeTimer = 0;
    this.ghost = null;
    this.drag = null;
    this.structUi = null;

    this.input.mouse?.disableContextMenu();

    // 배경 (방사형 그라디언트 아레나 — 코어로 시선이 모이도록)
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'bg').setDepth(-1);

    this.gridGfx = this.add.graphics().setDepth(0);
    this.drawGrid();

    // 코어 (화면의 초점 — 발광 + 맥동 링)
    const core = this.add.image(this.grid.cx, this.grid.cy, 'core').setDepth(1);
    core.setScale(76 / core.height);
    const pulse = this.add
      .circle(this.grid.cx, this.grid.cy, CORE.radius + 14)
      .setStrokeStyle(2, 0x3ff0e0, 0.5)
      .setDepth(1);
    this.tweens.add({
      targets: pulse,
      scale: 1.18,
      alpha: 0.18,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.ghost) this.cancelPlacement();
      else this.requestPause();
    });
    this.input.keyboard?.on('keydown-P', () => this.requestPause());

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
    this.updateFires(dt);
    this.updateCoreDischarge(dt);

    if (this.phase === 'WAVE' && this.pending.length === 0 && this.enemies.length === 0) {
      this.endWave();
    }
  }

  /** 일시정지 메뉴 열기 (HUD 버튼·ESC·P에서 호출) */
  requestPause(): void {
    if (this.phase === 'END') return;
    if (this.scene.isActive('Draft') || this.scene.isActive('Pause')) return;
    this.cancelPlacement();
    this.closeStructUi();
    this.scene.launch('Pause');
  }

  // ── 웨이브 진행 ──────────────────────────────────────────────

  startWave(): void {
    if (this.phase !== 'BUILD' || this.waveIndex >= WAVES.length) return;
    this.cancelPlacement();
    this.closeStructUi();

    // 이자 카드
    if (this.mods.interest) {
      const bonus = Math.min(Math.floor(this.gold * CARD_FX.interestRate), CARD_FX.interestCap);
      if (bonus > 0) {
        this.gold += bonus;
        this.toast(`이자 +${bonus}G`);
      }
    }
    // 긴급 증원 카드
    this.placeReinforcements();

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

    const hasBoss = WAVES[this.waveIndex].groups.some((g) => g.enemy === 'boss');
    this.banner(`WAVE ${this.waveIndex + 1}`, hasBoss ? '#e05555' : '#e8e8e8');
    if (hasBoss) this.banner('⚠ BOSS', '#e05555', 700);
    this.sfx.play('waveStart');
  }

  private endWave(): void {
    this.clearProjectiles();
    this.clearFires();
    this.closeStructUi();
    this.waveIndex++;
    if (this.waveIndex >= WAVES.length) {
      this.end(true);
      return;
    }
    this.gridGfx.setAlpha(1);
    for (const p of this.placeables) p.revive(this);
    // 클리어 배너를 보여준 뒤 드래프트 제시 (배너가 오버레이에 가려지지 않게)
    this.banner('WAVE CLEAR', '#7ee0a3');
    this.phase = 'DRAFT';
    this.time.delayedCall(800, () => {
      if (this.phase === 'DRAFT') this.offerDraft();
    });
  }

  private end(victory: boolean): void {
    this.phase = 'END';
    this.victory = victory;
    this.cancelPlacement();
    this.closeStructUi();
    this.clearProjectiles();
    this.clearFires();
    this.sfx.play(victory ? 'victory' : 'defeat');
    if (!victory) this.cameras.main.shake(400, 0.01);
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
    // 보스는 웨이브별 HP 테이블, 일반 적은 웨이브 스케일링
    const waveNumber = this.waveIndex + 1;
    const hpScale =
      key === 'boss'
        ? (BOSS_HP[waveNumber] ?? ENEMIES.boss.hp) / ENEMIES.boss.hp
        : 1 + WAVE_HP_SCALE * this.waveIndex; // 웨이브 1(index 0) → ×1.0
    this.enemies.push(new Enemy(this, key, x, y, hpScale));
  }

  // ── 드래프트 ─────────────────────────────────────────────────

  private offerDraft(): void {
    // 훈장 수여: 진급 가능한 유닛이 없으면 죽은 카드이므로 미등장
    const hasPromotableUnit = this.placeables.some((p) => p.def.kind === 'unit' && !p.isMaxRank);
    const pool = (Object.keys(CARDS) as CardKey[]).filter((k) => {
      if (CARDS[k].unique && this.acquired.has(k)) return false;
      if (k === 'medal' && !hasPromotableUnit) return false;
      return true;
    });
    Phaser.Utils.Array.Shuffle(pool);
    const offer = pool.slice(0, 3);
    if (offer.length === 0) {
      this.phase = 'BUILD';
      return;
    }
    this.phase = 'DRAFT';
    this.scene.launch('Draft', { cards: offer });
  }

  /** DraftScene에서 카드 선택 시 호출 */
  applyCard(key: CardKey): void {
    const def = CARDS[key];
    if (def.unique) this.acquired.add(key);
    let msg = `「${def.name}」 획득`;

    switch (key) {
      case 'pierce':
        this.mods.pierce = true;
        break;
      case 'fireGround':
        this.mods.fireGround = true;
        break;
      case 'deepFreeze':
        this.mods.deepFreeze = true;
        break;
      case 'doubleShot':
        this.mods.doubleShot = true;
        break;
      case 'thorns':
        this.mods.thorns = true;
        break;
      case 'coreDischarge':
        this.mods.coreDischarge = true;
        break;
      case 'exposeWeakness':
        this.mods.exposeWeakness = true;
        break;
      case 'bounty':
        this.mods.bounty = true;
        break;
      case 'interest':
        this.mods.interest = true;
        break;
      case 'recycle':
        this.mods.refundRate = CARD_FX.recycleRefund;
        break;
      case 'glassCannon':
        this.mods.damageMult *= CARD_FX.glassCannonDamage;
        this.mods.structHpMult *= CARD_FX.glassCannonHp;
        for (const p of this.placeables) {
          if (p.def.kind === 'structure') {
            p.maxHp *= CARD_FX.glassCannonHp;
            p.hp = Math.min(p.hp, p.maxHp);
          }
        }
        break;
      case 'overheat':
        this.mods.rateMult *= CARD_FX.overheatRate;
        this.coreMaxHp -= CARD_FX.overheatCoreHp;
        this.coreHp = Math.min(this.coreHp, this.coreMaxHp);
        break;
      case 'gambler': {
        const won = Phaser.Math.Between(0, CARD_FX.gamblerMax);
        this.gold += won;
        msg = `「${def.name}」 결과: +${won}G`;
        break;
      }
      case 'repair':
        this.coreHp = Math.min(this.coreHp + CARD_FX.repairAmount, this.coreMaxHp);
        break;
      case 'warFunds':
        this.gold += CARD_FX.warFundsGold;
        break;
      case 'reinforcement':
        this.mods.pendingReinforcements++;
        break;
      case 'medal': {
        // 킬 수가 가장 많은 미최고계급 유닛 진급
        const candidates = this.placeables
          .filter((p) => p.def.kind === 'unit' && !p.isMaxRank)
          .sort((a, b) => b.kills - a.kills);
        const unit = candidates[0];
        if (unit) {
          unit.promote();
          msg = `「${def.name}」 ${unit.def.name} ${VETERAN.rankNames[unit.rank - 1]} 진급!`;
        }
        break;
      }
      case 'bootCamp':
        this.mods.veteranRecruits = true;
        break;
    }

    this.toast(msg);
    this.sfx.play('card');
    this.phase = 'BUILD';
  }

  private placeReinforcements(): void {
    while (this.mods.pendingReinforcements > 0) {
      const free: Cell[] = [];
      const h = this.grid.halfExtent;
      for (let col = -h; col <= h; col++) {
        for (let row = -h; row <= h; row++) {
          if (this.grid.isFree(col, row)) free.push({ col, row });
        }
      }
      if (free.length === 0) break; // 빈 셀이 없으면 다음 웨이브로 이월
      const cell = Phaser.Utils.Array.GetRandom(free);
      const p = new Placeable(this, 'swordsman', cell.col, cell.row);
      this.grid.occupy(cell.col, cell.row);
      this.placeables.push(p);
      this.mods.pendingReinforcements--;
      this.toast('긴급 증원: 검병 무료 배치');
    }
  }

  // ── 전투 콜백 ────────────────────────────────────────────────

  /** 약점 포착 보너스를 반영해 적에게 피해 적용. source는 막타 킬 크레딧용 */
  applyHit(target: Enemy, baseDamage: number, source?: Placeable): void {
    let dmg = baseDamage;
    if (this.mods.exposeWeakness && target.isHampered(this.time.now)) {
      dmg *= 1 + CARD_FX.exposeWeaknessBonus;
    }
    target.takeDamage(dmg, this, source);
  }

  onEnemyDead(enemy: Enemy, killed: boolean, killer?: Placeable): void {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    if (killed) {
      const isElite = enemy.key === 'tank' || enemy.key === 'boss';
      const mult = this.mods.bounty && isElite ? CARD_FX.bountyMult : 1;
      const gold = enemy.def.gold * mult;
      this.gold += gold;
      this.addXp(enemy.def.xp);
      if (killer && killer.def.kind === 'unit') killer.addKill(this); // 베테랑 진급
      this.floatText(enemy.x, enemy.y, `+${gold}`, '#f0c674');
      this.deathBurst(enemy.x, enemy.y, enemy.def.color);
      this.sfx.play('death');
    }
  }

  damageCore(amount: number): void {
    if (this.phase === 'END') return;
    this.coreHp -= amount;
    // 피격 체감: 화면 흔들림 (스팸 방지 스로틀)
    if (this.time.now - this.lastShakeAt > 200) {
      this.lastShakeAt = this.time.now;
      this.cameras.main.shake(120, 0.004);
      this.sfx.play('coreHit');
    }
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
      this.banner('영토 확장!', '#7ee0a3');
      this.sfx.play('levelup');
    }
  }

  /** 다음 레벨까지 필요한 누적 XP. 최대 레벨이면 null */
  nextXpThreshold(): number | null {
    return this.grid.level < this.grid.maxLevel ? XP_THRESHOLDS[this.grid.level - 1] : null;
  }

  // ── 카드 특성: 화염 지대 / 코어 방전 ─────────────────────────

  spawnFireGround(x: number, y: number, radius: number): void {
    const gfx = this.add.circle(x, y, radius, 0xe07030, 0.18).setStrokeStyle(1, 0xe07030, 0.4).setDepth(1);
    this.fires.push({ x, y, radius, until: this.time.now + CARD_FX.fireGroundDuration * 1000, gfx });
  }

  private updateFires(dt: number): void {
    this.fires = this.fires.filter((f) => {
      if (this.time.now > f.until) {
        f.gfx.destroy();
        return false;
      }
      for (const e of [...this.enemies]) {
        if (Phaser.Math.Distance.Between(f.x, f.y, e.x, e.y) <= f.radius + e.def.radius) {
          e.takeDamage(CARD_FX.fireGroundDps * dt, this);
        }
      }
      return true;
    });
  }

  private clearFires(): void {
    for (const f of this.fires) f.gfx.destroy();
    this.fires = [];
  }

  private updateCoreDischarge(dt: number): void {
    if (!this.mods.coreDischarge) return;
    this.dischargeTimer += dt;
    if (this.dischargeTimer < CARD_FX.coreDischargeInterval) return;
    this.dischargeTimer = 0;

    const R = CARD_FX.coreDischargeRadius;
    const ring = this.add
      .image(this.grid.cx, this.grid.cy, 'ring')
      .setTint(0x3ff0e0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
      .setScale((R / 48) * 0.3)
      .setAlpha(0.9);
    this.tweens.add({
      targets: ring,
      scale: (R / 48) * 1.05,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.hitSpark(this.grid.cx, this.grid.cy, 0x3ff0e0, 10);

    for (const e of [...this.enemies]) {
      const d = Phaser.Math.Distance.Between(this.grid.cx, this.grid.cy, e.x, e.y);
      if (d <= CARD_FX.coreDischargeRadius + e.def.radius) {
        e.takeDamage(CARD_FX.coreDischargeDamage, this);
      }
    }
  }

  // ── 배치 (BUILD) ─────────────────────────────────────────────

  enterPlacement(key: PlaceableKey): void {
    if (this.phase !== 'BUILD') return;
    const def = PLACEABLES[key];
    if (this.gold < def.cost) return;
    this.cancelPlacement();
    this.closeStructUi();

    const body = this.add.image(0, 0, key).setAlpha(0.65).setDepth(10);
    body.setScale((def.kind === 'structure' ? 66 : 56) / body.height);
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
    const cell = this.grid.worldToCell(pointer.worldX, pointer.worldY);
    const valid = this.grid.isFree(cell.col, cell.row);
    const pos = valid ? this.grid.cellToWorld(cell.col, cell.row) : { x: pointer.worldX, y: pointer.worldY };
    this.ghost.body.setPosition(pos.x, pos.y);
    if (valid) this.ghost.body.clearTint();
    else this.ghost.body.setTint(0xff5555);
    this.ghost.range.setPosition(pos.x, pos.y);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // 구조물 팝업: 연 클릭이 아닌 다른 클릭이면 닫기
    if (this.structUi && this.time.now - this.structUi.openedAt > 100) {
      this.closeStructUi();
    }
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
    this.sfx.play('place');
  }

  // ── 구조물 관리 (업그레이드 / 철거) ──────────────────────────

  onStructureClicked(p: Placeable): void {
    if (this.phase !== 'BUILD' || this.ghost || !p.alive) return;
    this.closeStructUi();

    const parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = [];

    // 강화 버튼
    const cost = p.upgradeCost();
    const upLabel = cost === null ? '최대 강화' : `강화 Lv${p.level + 1} (${cost}G)`;
    const affordable = cost !== null && this.gold >= cost;
    const upBg = this.add
      .rectangle(p.x, p.y - 84, 170, 34, 0x222833, 0.95)
      .setStrokeStyle(1, 0x7ee0a3, 1)
      .setDepth(11);
    const upTxt = this.add
      .text(p.x, p.y - 84, upLabel, { fontSize: '14px', color: '#e8e8e8', fontFamily: 'sans-serif' })
      .setOrigin(0.5)
      .setDepth(11);
    if (affordable) {
      upBg.setInteractive({ useHandCursor: true });
      upBg.on('pointerdown', () => {
        if (p.tryUpgrade(this)) {
          this.toast(`${p.def.name} 강화 Lv${p.level}`);
          this.sfx.play('upgrade');
        }
        this.closeStructUi();
      });
    } else {
      upBg.setAlpha(0.5);
      upTxt.setAlpha(0.5);
    }
    parts.push(upBg, upTxt);

    // 철거 버튼 (환급은 누적 투자 기준)
    const refund = Math.floor(p.invested * this.mods.refundRate);
    const demoBg = this.add
      .rectangle(p.x, p.y - 46, 170, 34, 0x222833, 0.95)
      .setStrokeStyle(1, 0xe05555, 1)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });
    const demoTxt = this.add
      .text(p.x, p.y - 46, `철거 +${refund}G`, { fontSize: '14px', color: '#e8e8e8', fontFamily: 'sans-serif' })
      .setOrigin(0.5)
      .setDepth(11);
    demoBg.on('pointerdown', () => this.demolish(p));
    parts.push(demoBg, demoTxt);

    this.structUi = { parts, openedAt: this.time.now };
  }

  private demolish(p: Placeable): void {
    if (!p.alive) return;
    const refund = Math.floor(p.invested * this.mods.refundRate);
    this.gold += refund;
    p.destroyVisuals();
    this.grid.vacate(p.col, p.row);
    this.removePlaceable(p);
    this.closeStructUi();
    this.toast(`철거 +${refund}G`);
    this.sfx.play('demolish');
  }

  private closeStructUi(): void {
    if (!this.structUi) return;
    for (const part of this.structUi.parts) part.destroy();
    this.structUi = null;
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

  // ── 발사체 스폰 ──────────────────────────────────────────────

  spawnHoming(
    x: number,
    y: number,
    target: Enemy,
    damage: number,
    slow: { pct: number; duration: number } | null,
    freeze: { chance: number; duration: number } | null,
    color: number,
    speed: number,
    source?: Placeable,
  ): void {
    this.projectiles.push(
      new Projectile(this, {
        x,
        y,
        color,
        damage,
        speed,
        target,
        tx: target.x,
        ty: target.y,
        slow: slow ?? undefined,
        freeze: freeze ?? undefined,
        source,
      }),
    );
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
    source?: Placeable,
  ): void {
    this.projectiles.push(new Projectile(this, { x, y, color, damage, speed, tx, ty, aoeRadius, source }));
  }

  spawnPierce(
    x: number,
    y: number,
    tx: number,
    ty: number,
    damage: number,
    color: number,
    speed: number,
    pierceDist: number,
    source?: Placeable,
  ): void {
    this.projectiles.push(new Projectile(this, { x, y, color, damage, speed, tx, ty, pierceDist, source }));
  }

  // ── 시각 효과 ────────────────────────────────────────────────

  /** 명중 지점의 작은 발광 스파크 버스트 */
  hitSpark(x: number, y: number, color: number, count = 6): void {
    const e = this.add
      .particles(x, y, 'spark', {
        tint: color,
        blendMode: 'ADD',
        speed: { min: 40, max: 140 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.28, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: { min: 160, max: 340 },
        emitting: false,
      })
      .setDepth(6);
    e.explode(count);
    this.time.delayedCall(400, () => e.destroy());
  }

  /** 원거리 발사 순간의 총구 섬광 */
  muzzleFlash(x: number, y: number, color: number): void {
    const f = this.add
      .image(x, y, 'spark')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
      .setScale(0.45);
    this.tweens.add({ targets: f, scale: 0.85, alpha: 0, duration: 130, onComplete: () => f.destroy() });
  }

  meleeVisual(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    // 병사와 적 사이(병사 쪽에 가깝게)에 초승달 베기 — 볼록면이 적을 향한다
    const dist = Math.hypot(toX - fromX, toY - fromY) || 1;
    const reach = Math.min(dist * 0.42, 30);
    const ax = fromX + Math.cos(angle) * reach;
    const ay = fromY + Math.sin(angle) * reach;
    const slash = this.add
      .image(ax, ay, 'slash')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5)
      .setRotation(angle)
      .setScale(0.4, 0.62)
      .setAlpha(0.95);
    this.tweens.add({
      targets: slash,
      scaleX: 0.78,
      scaleY: 0.44,
      alpha: 0,
      duration: 170,
      ease: 'Cubic.easeOut',
      onComplete: () => slash.destroy(),
    });
    this.hitSpark(toX, toY, color, 4);
  }

  explosionVisual(x: number, y: number, radius: number, color: number): void {
    const r = radius / 32; // spark 텍스처 반경(32) 기준 스케일
    // 흰 코어 플래시 (피해 반경에 가깝게 — 과하게 크지 않도록)
    const flash = this.add.image(x, y, 'spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(5).setScale(r * 0.5).setAlpha(0.95);
    this.tweens.add({ targets: flash, scale: r * 0.85, alpha: 0, duration: 180, onComplete: () => flash.destroy() });
    // 색 글로우
    const glow = this.add
      .image(x, y, 'spark')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
      .setScale(r * 1.0)
      .setAlpha(0.75);
    this.tweens.add({ targets: glow, scale: r * 1.55, alpha: 0, duration: 300, onComplete: () => glow.destroy() });
    // 충격파 링
    const ring = this.add
      .image(x, y, 'ring')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4)
      .setScale((radius / 48) * 0.5);
    this.tweens.add({
      targets: ring,
      scale: (radius / 48) * 1.6,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.hitSpark(x, y, color, 12);
  }

  /** 사망/파괴 지점의 발광 파편 버스트 + 플래시 링 */
  deathBurst(x: number, y: number, color: number): void {
    const e = this.add
      .particles(x, y, 'shard', {
        tint: color,
        blendMode: 'ADD',
        speed: { min: 60, max: 180 },
        angle: { min: 0, max: 360 },
        rotate: { min: 0, max: 360 },
        scale: { start: 1, end: 0.2 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 260, max: 500 },
        emitting: false,
      })
      .setDepth(6);
    e.explode(9);
    this.time.delayedCall(560, () => e.destroy());
    const ring = this.add
      .image(x, y, 'ring')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5)
      .setScale(0.25)
      .setAlpha(0.9);
    this.tweens.add({ targets: ring, scale: 0.75, alpha: 0, duration: 300, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
  }

  /** 처치 위치 등에서 떠오르는 작은 텍스트 (+골드 등) */
  floatText(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, { fontSize: '14px', color, fontFamily: 'sans-serif' })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** 화면 중앙 상단 대형 배너 (웨이브 시작/클리어, 보스 경고, 영토 확장) */
  banner(msg: string, color: string, delay = 0): void {
    const t = this.add
      .text(WORLD.width / 2, 210, msg, { fontSize: '44px', color, fontFamily: 'sans-serif', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0)
      .setScale(0.7);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 180, delay, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: delay + 950, duration: 300, onComplete: () => t.destroy() });
  }

  toast(msg: string): void {
    const t = this.add
      .text(WORLD.width / 2, 110, msg, { fontSize: '18px', color: '#f0c674', fontFamily: 'sans-serif' })
      .setOrigin(0.5)
      .setDepth(20);
    this.tweens.add({ targets: t, y: 80, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private expandVisual(): void {
    const size = (2 * this.grid.halfExtent + 1) * GRID.cellSize;
    const ring = this.add
      .rectangle(this.grid.cx, this.grid.cy, size, size)
      .setStrokeStyle(4, 0x3ff0e0, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);
    this.tweens.add({
      targets: ring,
      scaleX: 1.04,
      scaleY: 1.04,
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
    g.lineStyle(1, 0x3ff0e0, 0.14);
    for (let i = 0; i <= 2 * h + 1; i++) {
      g.lineBetween(left + i * s, top, left + i * s, top + size);
      g.lineBetween(left, top + i * s, left + size, top + i * s);
    }
    g.lineStyle(2, 0x3ff0e0, 0.5);
    g.strokeRect(left, top, size, size);
  }
}
