// 밸런스 데이터 테이블 — 기획 문서 3.5절의 수치를 그대로 옮긴 것.
// 수치 변경은 이 파일과 waves.ts에서만 한다.

export const WORLD = { width: 1280, height: 720 };

export const CORE = { maxHp: 100, radius: 24 };

export const START_GOLD = 100;

/** 구조물 철거 시 기본 환급 비율 (누적 투자 = 건설 + 업그레이드 기준) */
export const DEMOLISH_REFUND = 0.5;

/** 무피해 웨이브 클리어 보너스 골드 (PERFECT) — 실력 표현 축 */
export const PERFECT_BONUS = 10;

/** 구조물 업그레이드 (구조물만, 유닛 성장은 베테랑 + 장비) */
export const UPGRADE = {
  maxLevel: 3,
  /** 단계별 비용 = 기본가 × costPct[현재 레벨] */
  costPct: [1.0, 1.5, 2.25],
  /** 공격 구조물: 단계당 공격력 +50% */
  damagePerLevel: 0.5,
  /** 프로스트 전용: 단계당 감속률 +10%p */
  frostSlowPerLevel: 0.1,
  /** 발전기 전용: 단계당 수익 +50% */
  generatorIncomePerLevel: 0.5,
  /** 바리케이드 전용: 단계당 최대 HP +50% */
  barricadeHpPerLevel: 0.5,
};

/** 3단계 특화 — 최대 강화(Lv3) 도달 시 해금되는 구조물별 질적 효과 */
export interface SpecializeDef {
  name: string;
  desc: string;
  critChance?: number;
  critMult?: number;
  /** 모르타르: 확장된 폭발 반경 (기본 aoeRadius 대체) */
  aoeRadius?: number;
  /** 프로스트: 주기 공격 대신 사거리 내 상시 감속 오라 */
  aura?: boolean;
  /** 테슬라: 연쇄 대상 추가 */
  chainBonus?: number;
  /** 발전기: 수익 배율 */
  incomeMult?: number;
  /** 바리케이드: 파괴 시 폭발 */
  novaDamage?: number;
  novaRadius?: number;
}

export const SPECIALIZE: Partial<Record<PlaceableKey, SpecializeDef>> = {
  cannon:    { name: '과충전 탄두', desc: '25% 확률로 피해 2배',              critChance: 0.25, critMult: 2 },
  mortar:    { name: '광역 확장',   desc: '폭발 반경 60 → 80',                aoeRadius: 80 },
  frost:     { name: '절대 영도',   desc: '사거리 내 모든 적 상시 감속',       aura: true },
  tesla:     { name: '병렬 회로',   desc: '연쇄 대상 +1',                     chainBonus: 1 },
  generator: { name: '초과 출력',   desc: '수익 1.5배',                       incomeMult: 1.5 },
  barricade: { name: '반응 장갑',   desc: '파괴 시 주변 80px 적에게 60 피해',  novaDamage: 60, novaRadius: 80 },
};

/** 유닛 장비 — 유닛당 1회 골드 구매 (베테랑과 별개의 성장 축) */
export interface EquipmentDef {
  name: string;
  cost: number;
  desc: string;
  /** 최대 HP 배율 */
  hpMult?: number;
  /** 사거리 가산 */
  rangeBonus?: number;
}

export const EQUIPMENT: Partial<Record<PlaceableKey, EquipmentDef>> = {
  swordsman: { name: '강화 방패', cost: 25, desc: '최대 HP +30%', hpMult: 1.3 },
  archer:    { name: '강궁',     cost: 25, desc: '사거리 +30',    rangeBonus: 30 },
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

export type EnemyKey = 'grunt' | 'runner' | 'splitter' | 'tank' | 'boss';

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
  grunt:    { name: '일반', behavior: 'kamikaze', hp: 20,  speed: 60,  damage: 5,  gold: 5,   xp: 1,  radius: 10, color: 0xff5a4d },
  runner:   { name: '고속', behavior: 'kamikaze', hp: 10,  speed: 120, damage: 3,  gold: 4,   xp: 1,  radius: 7,  color: 0xff9f2e },
  // 죽으면 그 자리에서 일반 2기로 분열 (SPLIT 테이블) — 처치 위치가 중요해지는 적
  splitter: { name: '분열', behavior: 'kamikaze', hp: 30,  speed: 55,  damage: 5,  gold: 6,   xp: 2,  radius: 12, color: 0xff4d94 },
  tank:     { name: '탱커', behavior: 'attacker', hp: 80,  speed: 35,  damage: 5,  attackInterval: 1.0, gold: 15,  xp: 3,  radius: 14, color: 0xe0463b },
  // 보스 HP는 W5 기준값. 웨이브별 HP(W10 1200 / W15 2500 / W20 5000)는 M3에서 테이블화
  boss:     { name: '보스', behavior: 'attacker', hp: 500, speed: 30,  damage: 15, attackInterval: 1.0, gold: 100, xp: 15, radius: 22, color: 0xff2e6e },
};

/** 분열형: 죽는 방식과 무관하게 그 자리에서 child가 count기 생성된다 */
export const SPLIT = { child: 'grunt' as EnemyKey, count: 2, offset: 14 };

// 웨이브당 적 HP 증가율: hp × (1 + 0.10 × (웨이브 − 1))
export const WAVE_HP_SCALE = 0.10;

export type PlaceableKey = 'swordsman' | 'archer' | 'cannon' | 'mortar' | 'frost' | 'tesla' | 'generator' | 'barricade';

/** 발사체 비행 속도 기본값 (px/초). 명중 시점에 피해가 적용되므로 게임플레이에 영향 있음 */
export const PROJECTILE_SPEED = 520;

export interface PlaceableDef {
  name: string;
  short: string;
  /** 배치 바 툴팁에 표시되는 한 줄 역할 설명 */
  role: string;
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
  /** 테슬라: 즉시 명중 연쇄 공격 (발사체 없음). radius = 다음 대상 탐색 반경 */
  chain?: { targets: number; decay: number; radius: number };
  /** 발전기: 웨이브 클리어 시 골드 수익 */
  income?: number;
  color: number;
}

export const PLACEABLES: Record<PlaceableKey, PlaceableDef> = {
  // 사거리는 그리드 대비 짧게 유지 — 배치 위치가 곧 커버리지가 되도록 (그리드 확장의 가치)
  swordsman: { name: '검병',     short: '검', role: '블로커 — 전선을 유지하고 적의 발을 묶는다', kind: 'unit',      cost: 30, hp: 60,  damage: 8,  rate: 1,   range: 52,  melee: true, color: 0x4aa8ff },
  archer:    { name: '궁수',     short: '궁', role: '기동 딜러 — 재배치로 화력을 집중한다',     kind: 'unit',      cost: 40, hp: 30,  damage: 10, rate: 1,   range: 150, projectileSpeed: 360, color: 0x35e3c8 },
  cannon:    { name: '캐논',     short: '캐', role: '단일 고딜 — 탱커·보스를 뚫는다',           kind: 'structure', cost: 70, hp: 100, damage: 25, rate: 0.8, range: 170, projectileSpeed: 360, color: 0x7c8cff },
  mortar:    { name: '모르타르', short: '모', role: '광역 폭발 — 몰려오는 물량을 지운다',       kind: 'structure', cost: 90, hp: 80,  damage: 10, rate: 0.5, range: 160, projectileSpeed: 220, aoeRadius: 60, color: 0xb98bff },
  frost:     { name: '프로스트', short: '프', role: '감속 유틸 — 적의 진격을 늦춘다',           kind: 'structure', cost: 50, hp: 80,  damage: 2,  rate: 1,   range: 120, slow: { pct: 0.4, duration: 1.5 }, color: 0x8fd8ff },
  tesla:     { name: '테슬라',   short: '테', role: '연쇄 번개 — 몰려 있는 적을 튀며 지진다',   kind: 'structure', cost: 80, hp: 90,  damage: 6,  rate: 1.2, range: 130, chain: { targets: 3, decay: 0.3, radius: 90 }, color: 0xbfefff },
  generator: { name: '발전기',   short: '발', role: '경제 — 웨이브 클리어마다 골드를 생산한다', kind: 'structure', cost: 60, hp: 50,  damage: 0,  rate: 0,   range: 0,   income: 12, color: 0x7ee0a3 },
  barricade: { name: '바리케이드', short: '바', role: '장애물 — 최저가로 적의 길을 막는다',     kind: 'structure', cost: 20, hp: 150, damage: 0,  rate: 0,   range: 0,   color: 0x8195b5 },
};

export const PLACEABLE_ORDER: PlaceableKey[] = ['swordsman', 'archer', 'cannon', 'mortar', 'frost', 'tesla', 'generator', 'barricade'];
