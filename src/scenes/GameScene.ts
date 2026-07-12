import Phaser from 'phaser';
import {
  BOSS_HP,
  CORE,
  DEMOLISH_REFUND,
  ENEMIES,
  GRID,
  PERFECT_BONUS,
  PLACEABLES,
  SPECIALIZE,
  SPLIT,
  START_GOLD,
  VETERAN,
  WAVE_HP_SCALE,
  WORLD,
  XP_THRESHOLDS,
  type EnemyKey,
  type PlaceableKey,
} from '../data/balance';
import { CARDS, CARD_FX, DRAFT, type CardKey } from '../data/cards';
import { WAVES, type Direction } from '../data/waves';
import { Enemy } from '../entities/Enemy';
import { Placeable } from '../entities/Placeable';
import { Projectile } from '../entities/Projectile';
import { Grid, type Cell } from '../systems/Grid';
import {
  clearRun,
  loadBest,
  loadRun,
  saveRun,
  updateBest,
  type BestRecord,
  type RunSave,
} from '../systems/SaveGame';
import { shakeEnabled } from '../systems/Settings';
import { Sfx, type BgmMode } from '../systems/Sfx';
import { TextButton, UI, panel } from '../systems/ui';

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
  /** 과부하 코일: 테슬라 연쇄 무제한 + 감쇠 완화 */
  overloadCoil: boolean;
  /** 가시 철조망: 바리케이드 접촉 지속 피해 */
  barbedWire: boolean;
  /** 복리 배당: 발전기 수익 배율 */
  generatorIncomeMult: number;
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
  parts: { destroy(): void }[];
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
  /** 직전 드래그 종료 시각 — 드래그 직후의 pointerup을 유닛 클릭으로 오인하지 않기 위함 */
  private lastDragEndAt = 0;
  /** 처치한 적 총합 (결과 요약용) */
  totalKills = 0;
  /** 전투 배속 (1/2/3). WAVE에서만 적용 */
  gameSpeed = 1;
  /** 배속이 반영된 게임 시간(ms) — 슬로우·빙결·화염 등 타이머 기준 */
  gameNow = 0;
  /** 사거리 상시 표시 토글 (BUILD·WAVE) */
  showRanges = false;
  private rangeGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private previewLabels: Phaser.GameObjects.Text[] = [];
  private previewDirty = true;
  private lastPhase: Phase = 'BUILD';
  /** 살아 있는 토스트 (겹침 방지 스택) */
  private toasts: Phaser.GameObjects.Text[] = [];
  /** 이번 웨이브에 코어가 피해를 입었는지 (PERFECT 보너스 판정) */
  private coreDamagedThisWave = false;
  /** 결과 화면용 기록 정보 (end에서 채움) */
  record: { reached: number; isNew: boolean; best: BestRecord | null } | null = null;
  /** 이번 런에서 선택한 카드 전체 (결과 화면 빌드 요약용, 즉발 포함) */
  cardHistory: CardKey[] = [];
  /** 현재 드래프트 제시에서 리롤을 이미 썼는지 */
  rerolledThisDraft = false;

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
      overloadCoil: false,
      barbedWire: false,
      generatorIncomeMult: 1,
      refundRate: DEMOLISH_REFUND,
      damageMult: 1,
      rateMult: 1,
      structHpMult: 1,
      pendingReinforcements: 0,
      veteranRecruits: false,
    };
  }

  create(data?: { continue?: boolean }): void {
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
    this.lastDragEndAt = 0;
    this.totalKills = 0;
    this.gameSpeed = 1;
    this.gameNow = 0;
    this.showRanges = false;
    this.previewDirty = true;
    this.lastPhase = 'BUILD';
    this.previewLabels = [];
    this.toasts = [];
    this.coreDamagedThisWave = false;
    this.record = null;
    this.cardHistory = [];
    this.rerolledThisDraft = false;
    this.applyTimeScale();

    this.cameras.main.fadeIn(320, 4, 7, 14);
    this.input.mouse?.disableContextMenu();

    // 배경 (방사형 그라디언트 아레나 — 코어로 시선이 모이도록)
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'bg').setDepth(-1);

    this.gridGfx = this.add.graphics().setDepth(0);
    this.drawGrid();

    // 사거리 상시 표시 오버레이 + 스폰 방향 예고 (BUILD 전용)
    this.rangeGfx = this.add.graphics().setDepth(0);
    this.previewGfx = this.add.graphics().setDepth(6);
    this.tweens.add({ targets: this.previewGfx, alpha: 0.5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

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

    // 유닛 클릭(팝업)과 드래그(재배치)를 구분 — 6px 이상 움직여야 드래그로 판정
    this.input.dragDistanceThreshold = 6;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.ghost) this.cancelPlacement();
      else this.requestPause();
    });
    this.input.keyboard?.on('keydown-P', () => this.requestPause());
    this.input.keyboard?.on('keydown-R', () => this.toggleRanges());
    this.input.keyboard?.on('keydown-F', () => this.cycleSpeed());
    // 웨이브 시작 (BUILD에서만 동작 — startWave 내부 가드). 페이지 스크롤 방지 캡처
    this.input.keyboard?.addCapture('SPACE');
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave());

    this.setupUnitDrag();

    if (!this.scene.isActive('UI')) this.scene.launch('UI');

    // 이어하기: 타이틀에서 continue 플래그와 함께 시작된 경우 저장된 런 복원
    if (data?.continue) {
      const save = loadRun();
      if (save) this.restoreRun(save);
    }

    this.sfx.bgmStart('build');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.sfx.bgmStop());
  }

  // ── 런 저장 · 복원 (이어하기) ─────────────────────────────────

  /** 현재 런 상태를 localStorage에 저장 (웨이브 시작 직전 · 드래프트 선택 직후) */
  private persistRun(): void {
    if (this.phase === 'END') return;
    const save: RunSave = {
      v: 1,
      waveIndex: this.waveIndex,
      gold: this.gold,
      xp: this.xp,
      coreHp: this.coreHp,
      coreMaxHp: this.coreMaxHp,
      totalKills: this.totalKills,
      mods: this.mods,
      acquired: [...this.acquired],
      cardHistory: [...this.cardHistory],
      placeables: this.placeables.map((p) => ({
        key: p.key,
        col: p.col,
        row: p.row,
        level: p.level,
        invested: p.invested,
        kills: p.kills,
        rank: p.rank,
        equipped: p.equipped,
        hp: p.hp,
        maxHp: p.maxHp,
      })),
    };
    saveRun(save);
  }

  private restoreRun(s: RunSave): void {
    this.waveIndex = Math.min(s.waveIndex, WAVES.length - 1);
    this.gold = s.gold;
    this.xp = s.xp;
    this.coreHp = s.coreHp;
    this.coreMaxHp = s.coreMaxHp;
    this.totalKills = s.totalKills;
    this.mods = { ...this.freshMods(), ...s.mods };
    this.acquired = new Set(s.acquired);
    this.cardHistory = [...(s.cardHistory ?? [])];
    // 그리드 레벨은 XP에서 재계산
    while (this.grid.level < this.grid.maxLevel && this.xp >= XP_THRESHOLDS[this.grid.level - 1]) {
      this.grid.expand();
    }
    this.drawGrid();
    for (const sp of s.placeables) {
      if (!this.grid.isFree(sp.col, sp.row)) continue;
      const p = new Placeable(this, sp.key, sp.col, sp.row);
      p.restoreFrom(sp);
      this.grid.occupy(sp.col, sp.row);
      this.placeables.push(p);
    }
    this.previewDirty = true;
    this.toast(`이어하기 — WAVE ${this.waveIndex + 1}`);
  }

  update(_time: number, deltaMs: number): void {
    if (this.phase !== this.lastPhase) {
      this.onPhaseChange(this.phase);
      this.lastPhase = this.phase;
    }
    // 스폰 방향 화살표 (BUILD 전용)
    if (this.phase === 'BUILD' && this.previewDirty) {
      this.redrawArrows();
      this.previewDirty = false;
    }
    // 사거리 오버레이 (BUILD·WAVE, 켜져 있으면 매 프레임 갱신)
    const canRange = this.phase === 'BUILD' || this.phase === 'WAVE';
    this.rangeGfx.setVisible(this.showRanges && canRange);
    if (this.showRanges && canRange) this.drawRangeOverlay();

    if (this.phase !== 'WAVE') return;
    // 배속 반영: 실제 delta에 배속 계수를 곱해 게임 시간·이동을 스케일
    const scaled = deltaMs * this.gameSpeed;
    this.gameNow += scaled;
    const dt = scaled / 1000;

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

  /** 화면 흔들림 — 접근성 설정(wd_shake)이 꺼져 있으면 생략 */
  shake(duration: number, intensity: number): void {
    if (shakeEnabled()) this.cameras.main.shake(duration, intensity);
  }

  /** 일시정지 메뉴 열기 (HUD 버튼·ESC·P에서 호출) */
  requestPause(): void {
    if (this.phase === 'END') return;
    if (this.scene.isActive('Draft') || this.scene.isActive('Pause')) return;
    this.cancelPlacement();
    this.closeStructUi();
    this.scene.launch('Pause');
  }

  // ── 오버레이 (사거리 표시 · 스폰 방향 예고) · 배속 ─────────────

  /** 사거리 상시 표시 토글 (HUD 버튼·R키) — BUILD·WAVE 모두 */
  toggleRanges(): void {
    this.showRanges = !this.showRanges;
    this.sfx.play('place');
  }

  /** 전투 배속 순환 (×1 → ×2 → ×3). HUD 버튼·F키 */
  cycleSpeed(): void {
    const steps = [1, 2, 3];
    this.gameSpeed = steps[(steps.indexOf(this.gameSpeed) + 1) % steps.length];
    this.applyTimeScale();
  }

  /** WAVE에서만 배속 적용 (트윈·타이머 이벤트도 함께 스케일) */
  private applyTimeScale(): void {
    const s = this.phase === 'WAVE' ? this.gameSpeed : 1;
    this.time.timeScale = s;
    this.tweens.timeScale = s;
  }

  private onPhaseChange(phase: Phase): void {
    this.applyTimeScale();
    // BGM 모드: 전투는 베이스·아르페지오 레이어, 보스 웨이브는 저음 강조, 그 외 차분
    if (phase === 'WAVE') {
      const hasBoss = WAVES[this.waveIndex]?.groups.some((g) => g.enemy === 'boss') ?? false;
      this.sfx.bgmSetMode((hasBoss ? 'boss' : 'wave') satisfies BgmMode);
    } else if (phase === 'END') {
      this.sfx.bgmStop();
    } else {
      this.sfx.bgmSetMode('build');
    }
    const build = phase === 'BUILD';
    this.previewGfx.setVisible(build);
    for (const l of this.previewLabels) l.setVisible(build);
    if (build) {
      this.previewDirty = true;
    } else {
      this.previewGfx.clear();
      this.clearPreviewLabels();
    }
  }

  private drawRangeOverlay(): void {
    const rg = this.rangeGfx;
    rg.clear();
    for (const p of this.placeables) {
      if (!p.alive || p.range <= 0) continue;
      rg.fillStyle(p.def.color, 0.05);
      rg.fillCircle(p.x, p.y, p.range);
      rg.lineStyle(1, p.def.color, 0.4);
      rg.strokeCircle(p.x, p.y, p.range);
    }
  }

  private redrawArrows(): void {
    const pg = this.previewGfx;
    pg.clear();
    this.clearPreviewLabels();
    const wave = WAVES[this.waveIndex];
    if (!wave) return;
    const byDir = new Map<Direction, Map<EnemyKey, number>>();
    for (const grp of wave.groups) {
      const m = byDir.get(grp.direction) ?? new Map<EnemyKey, number>();
      m.set(grp.enemy, (m.get(grp.enemy) ?? 0) + grp.count);
      byDir.set(grp.direction, m);
    }
    for (const [dir, comp] of byDir) this.drawDirIndicator(dir, comp);
    this.drawNextRingPreview();
  }

  /** 레벨업 임박(다음 레벨 XP의 90%+) 시 다음 영토 외곽을 점선으로 예고 */
  private drawNextRingPreview(): void {
    const next = this.nextXpThreshold();
    if (next === null || this.xp < next * 0.9) return;
    const s = this.grid.cellSize;
    const half = (this.grid.halfExtent + 1.5) * s;
    const cx = this.grid.cx;
    const cy = this.grid.cy;
    const g = this.previewGfx;
    g.lineStyle(2, 0x3ff0e0, 0.5);
    const dash = 10;
    const gap = 8;
    const edges: [number, number, number, number][] = [
      [cx - half, cy - half, cx + half, cy - half],
      [cx + half, cy - half, cx + half, cy + half],
      [cx + half, cy + half, cx - half, cy + half],
      [cx - half, cy + half, cx - half, cy - half],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      for (let d = 0; d < len; d += dash + gap) {
        const e = Math.min(d + dash, len);
        g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * e, y1 + uy * e);
      }
    }
    const label = this.add
      .text(cx, cy - half - 12, '레벨업 임박 — 다음 영토', { fontSize: '12px', color: '#7ff5e8', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(6)
      .setShadow(1, 1, '#000000', 3);
    this.previewLabels.push(label);
  }

  private drawDirIndicator(dir: Direction, comp: Map<EnemyKey, number>): void {
    const cx = this.grid.cx;
    const cy = this.grid.cy;
    let x = cx;
    let y = cy;
    let ang = 0;
    let lx = cx;
    let ly = cy;
    if (dir === 'right') { x = WORLD.width - 62; y = cy; ang = Math.PI; lx = x; ly = y - 36; }
    else if (dir === 'left') { x = 62; y = cy; ang = 0; lx = x; ly = y - 36; }
    else if (dir === 'top') { x = cx; y = 98; ang = Math.PI / 2; lx = x; ly = y - 26; }
    else { x = cx; y = WORLD.height - 110; ang = -Math.PI / 2; lx = x; ly = y + 30; }

    const g = this.previewGfx;
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(ang);
    g.fillStyle(0xff5a4d, 0.18);
    g.fillTriangle(12, -22, 12, 22, 48, 0);
    g.fillStyle(0xff5a4d, 0.95);
    g.fillTriangle(16, -13, 16, 13, 40, 0);
    g.fillRect(-16, -5, 32, 10);
    g.restore();

    const text = [...comp.entries()].map(([k, c]) => `${ENEMIES[k].name}×${c}`).join(' · ');
    const label = this.add
      .text(lx, ly, text, { fontSize: '13px', color: '#ff9a8f', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(6)
      .setShadow(1, 1, '#000000', 3);
    this.previewLabels.push(label);
  }

  private clearPreviewLabels(): void {
    for (const l of this.previewLabels) l.destroy();
    this.previewLabels = [];
  }

  // ── 웨이브 진행 ──────────────────────────────────────────────

  startWave(): void {
    if (this.phase !== 'BUILD' || this.waveIndex >= WAVES.length) return;
    this.cancelPlacement();
    this.closeStructUi();

    // 배치 결정이 반영된 시점의 런 저장 (이자·증원 소비 전 — 복원 후 재적용돼도 중복 없음)
    this.persistRun();
    this.coreDamagedThisWave = false;

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
    // 무피해 클리어 보너스 (PERFECT)
    if (!this.coreDamagedThisWave) {
      this.gold += PERFECT_BONUS;
      this.floatText(this.grid.cx, this.grid.cy - 46, `PERFECT +${PERFECT_BONUS}G`, '#ffd75e');
      this.toast(`무피해 클리어 — PERFECT +${PERFECT_BONUS}G`);
      this.sfx.play('upgrade');
    }
    this.waveIndex++;
    if (this.waveIndex >= WAVES.length) {
      this.end(true);
      return;
    }
    this.gridGfx.setAlpha(1);
    for (const p of this.placeables) p.revive(this);
    // 발전기 수익 (웨이브를 살아 넘긴 발전기만)
    let income = 0;
    for (const p of this.placeables) {
      if (!p.alive) continue;
      const inc = p.waveIncome(this);
      if (inc > 0) {
        income += inc;
        this.floatText(p.x, p.y, `+${inc}`, '#f0c674');
      }
    }
    if (income > 0) {
      this.gold += income;
      this.toast(`발전기 수익 +${income}G`);
    }
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
    // 최고 기록 갱신 + 런 저장 삭제 (런 종료)
    const reached = victory ? WAVES.length : this.waveIndex + 1;
    const isNew = updateBest(reached, victory);
    this.record = { reached, isNew, best: loadBest() };
    clearRun();
    this.cancelPlacement();
    this.closeStructUi();
    this.clearProjectiles();
    this.clearFires();
    this.sfx.play(victory ? 'victory' : 'defeat');
    if (!victory) this.shake(400, 0.01);
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
    if (key === 'boss') {
      // 보스 입장: 지축이 울리는 흔들림 + 저음
      this.shake(500, 0.006);
      this.sfx.play('bossSpawn');
    }
  }

  // ── 드래프트 ─────────────────────────────────────────────────

  private offerDraft(): void {
    const offer = this.rollDraft();
    if (offer.length === 0) {
      this.phase = 'BUILD';
      return;
    }
    this.phase = 'DRAFT';
    this.rerolledThisDraft = false;
    this.scene.launch('Draft', { cards: offer });
  }

  /** 카드 풀에서 3장 추첨. exclude(현재 제시분)는 대안이 있을 때만 제외 */
  rollDraft(exclude: CardKey[] = []): CardKey[] {
    // 훈장 수여: 진급 가능한 유닛이 없으면 죽은 카드이므로 미등장
    const hasPromotableUnit = this.placeables.some((p) => p.def.kind === 'unit' && !p.isMaxRank);
    let pool = (Object.keys(CARDS) as CardKey[]).filter((k) => {
      if (CARDS[k].unique && this.acquired.has(k)) return false;
      if (k === 'medal' && !hasPromotableUnit) return false;
      return true;
    });
    const filtered = pool.filter((k) => !exclude.includes(k));
    if (filtered.length > 0) pool = filtered;
    Phaser.Utils.Array.Shuffle(pool);
    return pool.slice(0, 3);
  }

  /** 드래프트 다시 뽑기 (제시당 1회, 골드 소모). 불가하면 null */
  rerollDraft(current: CardKey[]): CardKey[] | null {
    if (this.rerolledThisDraft || this.gold < DRAFT.rerollCost) return null;
    this.gold -= DRAFT.rerollCost;
    this.rerolledThisDraft = true;
    this.sfx.play('roll');
    return this.rollDraft(current);
  }

  /** 드래프트 건너뛰기 — 카드를 포기하고 골드 보상 */
  skipDraft(): void {
    this.gold += DRAFT.skipGold;
    this.toast(`드래프트 건너뛰기 +${DRAFT.skipGold}G`);
    this.sfx.play('card');
    this.phase = 'BUILD';
    this.persistRun();
  }

  /** DraftScene에서 카드 선택 시 호출 */
  applyCard(key: CardKey): void {
    const def = CARDS[key];
    if (def.unique) this.acquired.add(key);
    this.cardHistory.push(key);
    let msg: string | null = `「${def.name}」 획득`;

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
      case 'overloadCoil':
        this.mods.overloadCoil = true;
        break;
      case 'barbedWire':
        this.mods.barbedWire = true;
        break;
      case 'dividend':
        this.mods.generatorIncomeMult = CARD_FX.dividendMult;
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
      case 'gambler':
        // 결과는 슬롯 롤링 연출(gamblerReveal)이 끝나는 순간 지급된다
        this.gamblerReveal();
        msg = null;
        break;
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

    if (msg) this.toast(msg);
    this.sfx.play('card');
    this.phase = 'BUILD';
    // 드래프트 선택이 반영된 시점의 런 저장
    this.persistRun();
  }

  /** 전투 도박사: 슬롯머신식 숫자 롤링 → 결과 착지 (액수 구간별 반응 차등) */
  private gamblerReveal(): void {
    const won = Phaser.Math.Between(0, CARD_FX.gamblerMax);
    const cx = WORLD.width / 2;
    const cy = 268;

    const g = this.add.graphics().setDepth(20);
    panel(g, cx - 170, cy - 64, 340, 128, {
      fill: UI.panelFill,
      fillAlpha: 0.97,
      border: UI.goldHex,
      borderAlpha: 0.9,
      lineWidth: 2,
      cut: 14,
      bracket: true,
      bracketColor: UI.goldHex,
      bracketLen: 16,
    });
    const label = this.add
      .text(cx, cy - 38, '전투 도박사', { fontSize: '15px', color: UI.gold, fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(21);
    const num = this.add
      .text(cx, cy + 8, '+ ??? G', { fontSize: '46px', color: '#ffffff', fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(21);
    const parts = [g, label, num];

    // 롤링: 빠르게 무작위 숫자를 돌리다 점점 느려지며 착지
    const delays = [50, 50, 50, 50, 60, 60, 70, 80, 90, 110, 130, 160, 200];
    let acc = 0;
    for (const d of delays) {
      acc += d;
      this.time.delayedCall(acc, () => {
        num.setText(`+ ${Phaser.Math.Between(0, CARD_FX.gamblerMax)} G`);
        this.sfx.play('roll');
      });
    }

    this.time.delayedCall(acc + 240, () => {
      const jackpot = won >= CARD_FX.gamblerMax * 0.75;
      const bust = won < CARD_FX.gamblerMax * 0.25;
      num.setText(`+ ${won} G`);
      num.setColor(jackpot ? '#ffd75e' : bust ? '#8ea0bd' : '#eaf6ff');
      num.setScale(0.6);
      this.tweens.add({ targets: num, scale: jackpot ? 1.18 : 1, duration: 260, ease: 'Back.easeOut' });
      this.gold += won;
      this.sfx.play(jackpot ? 'gamblerWin' : bust ? 'gamblerLose' : 'card');
      if (jackpot) {
        this.hitSpark(cx, cy + 8, UI.goldHex, 18);
        this.shake(150, 0.003);
      }
      if (bust) label.setText('아쉽네요...');
      // 잠깐 보여준 뒤 페이드아웃
      this.tweens.add({
        targets: parts,
        alpha: 0,
        duration: 320,
        delay: jackpot ? 1500 : 1100,
        ease: 'Cubic.easeIn',
        onComplete: () => parts.forEach((p) => p.destroy()),
      });
    });
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
    if (this.mods.exposeWeakness && target.isHampered(this.gameNow)) {
      dmg *= 1 + CARD_FX.exposeWeaknessBonus;
    }
    target.takeDamage(dmg, this, source);
  }

  onEnemyDead(enemy: Enemy, killed: boolean, killer?: Placeable): void {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    // 분열형: 죽는 방식과 무관하게(처치·자폭 모두) 그 자리에서 갈라진다
    if (enemy.key === 'splitter' && this.phase === 'WAVE') this.splitEnemy(enemy);
    if (killed) {
      this.totalKills++;
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

  /** 분열형 사망 지점에 일반 적을 생성 (현재 웨이브 스케일링 적용) */
  private splitEnemy(e: Enemy): void {
    const hpScale = 1 + WAVE_HP_SCALE * this.waveIndex;
    for (let i = 0; i < SPLIT.count; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.enemies.push(
        new Enemy(this, SPLIT.child, e.x + Math.cos(ang) * SPLIT.offset, e.y + Math.sin(ang) * SPLIT.offset, hpScale),
      );
    }
    this.hitSpark(e.x, e.y, ENEMIES.splitter.color, 8);
  }

  damageCore(amount: number): void {
    if (this.phase === 'END') return;
    this.coreDamagedThisWave = true;
    this.coreHp -= amount;
    // 피격 체감: 화면 흔들림 (스팸 방지 스로틀)
    if (this.gameNow - this.lastShakeAt > 200) {
      this.lastShakeAt = this.gameNow;
      this.shake(120, 0.004);
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
    this.fires.push({ x, y, radius, until: this.gameNow + CARD_FX.fireGroundDuration * 1000, gfx });
  }

  private updateFires(dt: number): void {
    this.fires = this.fires.filter((f) => {
      if (this.gameNow > f.until) {
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

  /** 현재 배치 모드의 배치물 (HUD 카드 선택 상태 표시용) */
  get placementKey(): PlaceableKey | null {
    return this.ghost?.key ?? null;
  }

  enterPlacement(key: PlaceableKey): void {
    if (this.phase !== 'BUILD') return;
    // 같은 카드 재선택(클릭·단축키) = 배치 모드 취소 (토글)
    if (this.ghost?.key === key) {
      this.cancelPlacement();
      return;
    }
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
    // 그리드 밖 클릭은 배치 시도가 아님 (HUD 조작 등) — 조용히 무시
    if (!this.grid.isInside(cell.col, cell.row)) return;
    if (!this.grid.isFree(cell.col, cell.row) || this.gold < def.cost) {
      this.denyPlacement();
      return;
    }

    this.gold -= def.cost;
    const p = new Placeable(this, this.ghost.key, cell.col, cell.row);
    this.grid.occupy(cell.col, cell.row);
    this.placeables.push(p);
    this.previewDirty = true;
    this.sfx.play('place');
    // 연속 배치: 골드가 충분하면 배치 모드 유지 (우클릭·ESC·같은 카드 재클릭으로 종료)
    if (this.gold >= def.cost) this.updateGhost(pointer);
    else this.cancelPlacement();
  }

  /** 불가 셀 클릭 거부 — 경고음 + 고스트 좌우 흔들림 ("왜 안 되지" 제거) */
  private denyPlacement(): void {
    this.sfx.play('deny');
    const body = this.ghost?.body;
    if (!body || this.tweens.isTweening(body)) return;
    this.tweens.add({
      targets: body,
      angle: { from: -7, to: 7 },
      duration: 45,
      yoyo: true,
      repeat: 2,
      onComplete: () => body.setAngle(0),
    });
  }

  // ── 구조물 관리 (업그레이드 / 철거) ──────────────────────────

  onStructureClicked(p: Placeable): void {
    if (this.phase !== 'BUILD' || this.ghost || !p.alive) return;
    this.closeStructUi();

    const parts: { destroy(): void }[] = [];
    const cost = p.upgradeCost();
    const preview = p.upgradePreview(this);
    const refund = Math.floor(p.invested * this.mods.refundRate);
    const pw = 216;
    const ph = 150;
    // 구조물 위에 띄우되, 상단에 가리면 아래로
    let py = p.y - 104;
    if (py - ph / 2 < 64) py = p.y + 104;

    // 이 구조물의 사거리 표시 (판단 보조 — 무공격 구조물은 반경 0이라 표시 없음)
    const range = this.add
      .circle(p.x, p.y, p.range, p.def.color, 0.06)
      .setStrokeStyle(1, p.def.color, 0.45)
      .setDepth(9);
    parts.push(range);

    // 네온 패널
    const g = this.add.graphics().setDepth(11);
    panel(g, p.x - pw / 2, py - ph / 2, pw, ph, {
      fill: UI.panelFill,
      fillAlpha: 0.98,
      border: p.def.color,
      lineWidth: 2,
      cut: 12,
      bracket: true,
      bracketColor: p.def.color,
      bracketLen: 14,
    });
    parts.push(g);

    const title = this.add
      .text(p.x, py - ph / 2 + 17, `${p.def.name}${p.level > 0 ? ` +${p.level}` : ''}`, {
        fontSize: '15px',
        color: '#eaf2ff',
        fontFamily: UI.FONT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(12);
    parts.push(title);

    // 강화 전→후 대표 수치 미리보기 (강화 가치 판단 근거)
    if (preview) {
      const prev = this.add
        .text(p.x, py - ph / 2 + 33, `${preview.label} ${preview.from} → ${preview.to}`, {
          fontSize: '12.5px',
          color: '#8ffcd0',
          fontFamily: UI.FONT_DISPLAY,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(12);
      parts.push(prev);
    }

    // 3단계 특화 안내 (해금 전엔 예고, 해금 후엔 효과 설명)
    const specDef = SPECIALIZE[p.key];
    if (specDef) {
      const specText = p.isMaxLevel ? `★ ${specDef.name} — ${specDef.desc}` : `Lv3 특화: ${specDef.name} — ${specDef.desc}`;
      const spec = this.add
        .text(p.x, py - ph / 2 + 46, specText, {
          fontSize: '10.5px',
          color: p.isMaxLevel ? '#ffd75e' : UI.textDim,
          fontFamily: UI.FONT,
          align: 'center',
          wordWrap: { width: pw - 26 },
        })
        .setOrigin(0.5, 0)
        .setDepth(12);
      parts.push(spec);
    }

    // 강화 버튼
    const upLabel = cost === null ? '최대 강화' : `강화 → Lv${p.level + 1}    ${cost} G`;
    const upBtn = new TextButton(this, p.x, py + 18, pw - 22, 30, upLabel, {
      variant: 'default',
      fontSize: 13,
      depth: 12,
      cut: 8,
      onClick: () => {
        if (p.tryUpgrade(this)) {
          const sp = p.specialize;
          this.toast(sp ? `특화 해금 — ${sp.name}!` : `${p.def.name} 강화 Lv${p.level}`);
          this.sfx.play('upgrade');
        }
        this.closeStructUi();
      },
    });
    if (cost === null || this.gold < cost) upBtn.setEnabled(false);
    parts.push(upBtn);

    // 철거 버튼 (환급은 누적 투자 기준)
    const demoBtn = new TextButton(this, p.x, py + 54, pw - 22, 30, `철거    +${refund} G`, {
      variant: 'danger',
      fontSize: 13,
      depth: 12,
      cut: 8,
      onClick: () => this.demolish(p),
    });
    parts.push(demoBtn);

    this.structUi = { parts, openedAt: this.time.now };
  }

  // ── 유닛 정보·장비 팝업 (BUILD, 클릭 — 드래그와 구분) ──────────

  onUnitClicked(p: Placeable): void {
    if (this.phase !== 'BUILD' || this.ghost || this.drag || !p.alive) return;
    if (this.time.now - this.lastDragEndAt < 150) return;
    this.closeStructUi();

    const parts: { destroy(): void }[] = [];
    const eq = p.equipment;
    const pw = 216;
    const ph = 112;
    let py = p.y - 88;
    if (py - ph / 2 < 64) py = p.y + 88;

    // 사거리 원 (장비 보너스 반영)
    const range = this.add
      .circle(p.x, p.y, p.range, p.def.color, 0.06)
      .setStrokeStyle(1, p.def.color, 0.45)
      .setDepth(9);
    parts.push(range);

    const g = this.add.graphics().setDepth(11);
    panel(g, p.x - pw / 2, py - ph / 2, pw, ph, {
      fill: UI.panelFill,
      fillAlpha: 0.98,
      border: p.def.color,
      lineWidth: 2,
      cut: 12,
      bracket: true,
      bracketColor: p.def.color,
      bracketLen: 14,
    });
    parts.push(g);

    const title = this.add
      .text(p.x, py - ph / 2 + 17, `${p.def.name}${p.rank > 0 ? ` ${'★'.repeat(p.rank)}` : ''}`, {
        fontSize: '15px',
        color: '#eaf2ff',
        fontFamily: UI.FONT,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(12);
    parts.push(title);

    const rankName = p.rank > 0 ? VETERAN.rankNames[p.rank - 1] : '신병';
    const nextKills = p.isMaxRank ? null : VETERAN.killThresholds[p.rank];
    const info = this.add
      .text(p.x, py - ph / 2 + 38, `${rankName} · 킬 ${p.kills}${nextKills !== null ? ` · 진급까지 ${Math.max(0, nextKills - p.kills)}킬` : ''}`, {
        fontSize: '11px',
        color: UI.textDim,
        fontFamily: UI.FONT,
      })
      .setOrigin(0.5)
      .setDepth(12);
    parts.push(info);

    if (eq && p.equipped) {
      const owned = this.add
        .text(p.x, py + 26, `장비 보유 — ${eq.name} (${eq.desc})`, {
          fontSize: '12px',
          color: '#8ffcd0',
          fontFamily: UI.FONT,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(12);
      parts.push(owned);
    } else if (eq) {
      const buyBtn = new TextButton(this, p.x, py + 26, pw - 22, 30, `${eq.name} (${eq.desc})    ${eq.cost} G`, {
        variant: 'default',
        fontSize: 12,
        depth: 12,
        cut: 8,
        onClick: () => {
          if (p.buyEquipment(this)) {
            this.toast(`${p.def.name} 장비 — ${eq.name}`);
            this.sfx.play('upgrade');
            this.previewDirty = true;
          }
          this.closeStructUi();
        },
      });
      if (this.gold < eq.cost) buyBtn.setEnabled(false);
      parts.push(buyBtn);
    }

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
    this.previewDirty = true;
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
        .circle(p.x, p.y, p.range, p.def.color, 0.06)
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
      this.lastDragEndAt = this.time.now;
      const cell = this.grid.worldToCell(ptr.worldX, ptr.worldY);
      if (this.grid.isFree(cell.col, cell.row)) {
        p.setCell(cell.col, cell.row, this);
      } else {
        p.setCell(fromCol, fromRow, this);
      }
      this.previewDirty = true;
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

  /** 테슬라 연쇄 번개 — 경유점 사이를 지그재그로 잇는 발광 라인 (색 헤일로 + 흰 코어 2패스) */
  lightningVisual(points: { x: number; y: number }[], color: number): void {
    if (points.length < 2) return;
    // 각 구간을 지그재그 중간점으로 쪼갠 폴리라인 생성
    const path: { x: number; y: number }[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segs = 3;
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        const off = Phaser.Math.FloatBetween(-11, 11);
        path.push({ x: a.x + (b.x - a.x) * t + (nx / len) * off, y: a.y + (b.y - a.y) * t + (ny / len) * off });
      }
      path.push(b);
    }
    const g = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    const stroke = (width: number, c: number, alpha: number) => {
      g.lineStyle(width, c, alpha);
      g.beginPath();
      g.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) g.lineTo(path[i].x, path[i].y);
      g.strokePath();
    };
    stroke(6, color, 0.35);
    stroke(2.5, 0xffffff, 0.95);
    this.tweens.add({ targets: g, alpha: 0, duration: 160, ease: 'Cubic.easeIn', onComplete: () => g.destroy() });
    // 명중점 스파크 (시작점 = 테슬라 본체는 제외)
    for (let i = 1; i < points.length; i++) this.hitSpark(points[i].x, points[i].y, color, 4);
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
      .text(x, y, msg, { fontSize: '14px', color, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(6);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** 화면 중앙 상단 대형 배너 (웨이브 시작/클리어, 보스 경고, 영토 확장) */
  banner(msg: string, color: string, delay = 0): void {
    const t = this.add
      .text(WORLD.width / 2, 210, msg, { fontSize: '44px', color, fontFamily: UI.FONT_DISPLAY, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0)
      .setScale(0.7)
      .setLetterSpacing(4)
      .setShadow(0, 0, color, 16);
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 180, delay, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: delay + 950, duration: 300, onComplete: () => t.destroy() });
  }

  /** 안내 토스트 — 동시에 여러 개가 뜨면 겹치지 않게 세로로 쌓는다 */
  toast(msg: string): void {
    const y = 110 + this.toasts.length * 28;
    const t = this.add
      .text(WORLD.width / 2, y, msg, { fontSize: '18px', color: '#f0c674', fontFamily: UI.FONT })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);
    this.toasts.push(t);
    this.tweens.add({ targets: t, alpha: 1, duration: 140 });
    this.tweens.add({
      targets: t,
      y: y - 30,
      alpha: 0,
      duration: 1400,
      delay: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        const i = this.toasts.indexOf(t);
        if (i >= 0) this.toasts.splice(i, 1);
        t.destroy();
      },
    });
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
