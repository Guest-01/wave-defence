// 밸런스 데이터 테이블 — 기획 문서 3.5절의 수치를 그대로 옮긴 것.
// 수치 변경은 이 파일과 waves.ts에서만 한다.

export const WORLD = { width: 1280, height: 720 };

export const CORE = { maxHp: 100, radius: 24 };

export const START_GOLD = 100;

export const GRID = {
  cellSize: 64,
  // 레벨별 half-extent (2 → 5×5, 3 → 7×7, 4 → 9×9, 5 → 11×11)
  halfExtents: [2, 3, 4, 5],
};

// 레벨 2/3/4 도달에 필요한 누적 XP
export const XP_THRESHOLDS = [30, 90, 200];

export type EnemyKey = 'grunt' | 'runner' | 'tank' | 'boss';

export interface EnemyDef {
  name: string;
  behavior: 'kamikaze' | 'attacker';
  hp: number;
  speed: number;
  /** kamikaze: 접촉 시 1회 피해, attacker: attackInterval마다 1회 피해 */
  damage: number;
  /** attacker 전용: 타격 주기 (초). 첫 타격도 접촉 후 이 시간이 지나야 발생 */
  attackInterval?: number;
  gold: number;
  xp: number;
  radius: number;
  color: number;
}

export const ENEMIES: Record<EnemyKey, EnemyDef> = {
  grunt:  { name: '일반',   behavior: 'kamikaze', hp: 20,  speed: 60,  damage: 5,  gold: 5,   xp: 1,  radius: 10, color: 0xe05555 },
  runner: { name: '고속',   behavior: 'kamikaze', hp: 10,  speed: 120, damage: 3,  gold: 4,   xp: 1,  radius: 7,  color: 0xe08bd0 },
  tank:   { name: '탱커',   behavior: 'attacker', hp: 80,  speed: 35,  damage: 5,  attackInterval: 1.0, gold: 15,  xp: 3,  radius: 14, color: 0x9e3030 },
  // 보스 HP는 W5 기준값. 웨이브별 HP(W10 1200 / W15 2500 / W20 5000)는 M3에서 테이블화
  boss:   { name: '보스',   behavior: 'attacker', hp: 500, speed: 30,  damage: 15, attackInterval: 1.0, gold: 100, xp: 15, radius: 22, color: 0x8844cc },
};

// 웨이브당 적 HP 증가율: hp × (1 + 0.10 × (웨이브 − 1))
export const WAVE_HP_SCALE = 0.10;

export type PlaceableKey = 'swordsman' | 'archer' | 'cannon' | 'mortar' | 'frost';

/** 발사체 비행 속도 기본값 (px/초). 명중 시점에 피해가 적용되므로 게임플레이에 영향 있음 */
export const PROJECTILE_SPEED = 520;

export interface PlaceableDef {
  name: string;
  short: string;
  kind: 'unit' | 'structure';
  cost: number;
  hp: number;
  damage: number;
  /** 초당 공격 횟수 */
  rate: number;
  range: number;
  /** true면 발사체 없이 즉시 타격 (근접) */
  melee?: boolean;
  /** 발사체 속도 (px/초). 생략 시 PROJECTILE_SPEED */
  projectileSpeed?: number;
  aoeRadius?: number;
  slow?: { pct: number; duration: number };
  color: number;
}

export const PLACEABLES: Record<PlaceableKey, PlaceableDef> = {
  swordsman: { name: '검병',     short: '검', kind: 'unit',      cost: 30, hp: 60,  damage: 8,  rate: 1,   range: 72,  melee: true, color: 0x4d7dd0 },
  archer:    { name: '궁수',     short: '궁', kind: 'unit',      cost: 40, hp: 30,  damage: 10, rate: 1,   range: 200, projectileSpeed: 360, color: 0x5dbb63 },
  cannon:    { name: '캐논',     short: '캐', kind: 'structure', cost: 70, hp: 100, damage: 25, rate: 0.8, range: 250, projectileSpeed: 360, color: 0x3a5a8c },
  mortar:    { name: '모르타르', short: '모', kind: 'structure', cost: 90, hp: 80,  damage: 10, rate: 0.5, range: 200, projectileSpeed: 220, aoeRadius: 60, color: 0xc9863a },
  frost:     { name: '프로스트', short: '프', kind: 'structure', cost: 50, hp: 80,  damage: 2,  rate: 1,   range: 150, slow: { pct: 0.4, duration: 1.5 }, color: 0x63c3d1 },
};

export const PLACEABLE_ORDER: PlaceableKey[] = ['swordsman', 'archer', 'cannon', 'mortar', 'frost'];
