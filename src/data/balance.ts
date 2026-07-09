// 밸런스 데이터 테이블 — 기획 문서 3.5절의 수치를 그대로 옮긴 것.
// 수치 변경은 이 파일과 waves.ts에서만 한다.

export const WORLD = { width: 1280, height: 720 };

export const CORE = { maxHp: 100, radius: 24 };

export const START_GOLD = 100;

/** 구조물 철거 시 기본 환급 비율 (누적 투자 = 건설 + 업그레이드 기준) */
export const DEMOLISH_REFUND = 0.5;

/** 구조물 업그레이드 (구조물만, 유닛 성장은 드래프트 카드로) */
export const UPGRADE = {
  maxLevel: 3,
  /** 단계별 비용 = 기본가 × costPct[현재 레벨] */
  costPct: [1.0, 1.5, 2.25],
  /** 단계당 공격력 +50% */
  damagePerLevel: 0.5,
  /** 프로스트 전용: 단계당 감속률 +10%p */
  frostSlowPerLevel: 0.1,
};

/** 보스 HP 테이블 (웨이브 번호 → HP). 등록되지 않은 웨이브는 ENEMIES.boss.hp 사용 */
export const BOSS_HP: Record<number, number> = { 5: 500, 10: 1200, 15: 2500, 20: 5000 };

/** 유닛 베테랑 진급 (막타 킬 기준). 사망·부활해도 킬과 계급 유지. 구조물 성장은 골드 업그레이드 */
export const VETERAN = {
  /** 계급별 필요 누적 킬 (index 0 → 계급 1) */
  killThresholds: [5, 15],
  /** 계급별 공격력 보너스 */
  damageBonus: [0.3, 0.6],
  /** 최고 계급(정예) 도달 시 최대 HP 보너스 */
  eliteHpBonus: 0.3,
  rankNames: ['베테랑', '정예'],
};

export const GRID = {
  cellSize: 64,
  // 레벨별 half-extent (1 → 3×3, 2 → 5×5, 3 → 7×7, 4 → 9×9)
  // 공간이 희소자원이 되도록 작게 시작한다. 확장 = 커버리지를 스폰 방향으로 전진
  halfExtents: [1, 2, 3, 4],
};

// 레벨 2/3/4 도달에 필요한 누적 XP
export const XP_THRESHOLDS = [20, 60, 140];

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
  // 사거리는 그리드 대비 짧게 유지 — 배치 위치가 곧 커버리지가 되도록 (그리드 확장의 가치)
  swordsman: { name: '검병',     short: '검', kind: 'unit',      cost: 30, hp: 60,  damage: 8,  rate: 1,   range: 72,  melee: true, color: 0x4d7dd0 },
  archer:    { name: '궁수',     short: '궁', kind: 'unit',      cost: 40, hp: 30,  damage: 10, rate: 1,   range: 150, projectileSpeed: 360, color: 0x5dbb63 },
  cannon:    { name: '캐논',     short: '캐', kind: 'structure', cost: 70, hp: 100, damage: 25, rate: 0.8, range: 170, projectileSpeed: 360, color: 0x3a5a8c },
  mortar:    { name: '모르타르', short: '모', kind: 'structure', cost: 90, hp: 80,  damage: 10, rate: 0.5, range: 160, projectileSpeed: 220, aoeRadius: 60, color: 0xc9863a },
  frost:     { name: '프로스트', short: '프', kind: 'structure', cost: 50, hp: 80,  damage: 2,  rate: 1,   range: 120, slow: { pct: 0.4, duration: 1.5 }, color: 0x63c3d1 },
};

export const PLACEABLE_ORDER: PlaceableKey[] = ['swordsman', 'archer', 'cannon', 'mortar', 'frost'];
