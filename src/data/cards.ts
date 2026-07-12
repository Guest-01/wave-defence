// 드래프트 카드 데이터 테이블 — 기획 문서 3.5절.
// 카드 효과 수치는 전부 CARD_FX에 둔다.

export type CardKey =
  | 'pierce'
  | 'fireGround'
  | 'deepFreeze'
  | 'doubleShot'
  | 'thorns'
  | 'coreDischarge'
  | 'overloadCoil'
  | 'barbedWire'
  | 'exposeWeakness'
  | 'dividend'
  | 'bounty'
  | 'interest'
  | 'recycle'
  | 'glassCannon'
  | 'overheat'
  | 'gambler'
  | 'repair'
  | 'warFunds'
  | 'reinforcement'
  | 'medal'
  | 'bootCamp';

export type CardCategory = 'trait' | 'synergy' | 'tradeoff' | 'instant';

export interface CardDef {
  name: string;
  desc: string;
  category: CardCategory;
  /** true면 획득 시 카드 풀에서 제거 (한 판에 1회만 획득 가능) */
  unique: boolean;
  /** 카드에 표시할 관련 배치물/텍스처 키 (효과를 그림으로 전달) */
  icon: string;
  /** 범용 텍스처(spark 등)를 쓸 때의 틴트 */
  iconTint?: number;
}

/** 드래프트 제시 규칙 (리롤·스킵) */
export const DRAFT = {
  /** 다시 뽑기 비용 (제시당 1회) */
  rerollCost: 25,
  /** 건너뛰기 보상 골드 */
  skipGold: 15,
} as const;

/** 카드 효과 수치 */
export const CARD_FX = {
  pierceExtraRange: 80, // 관통탄이 사거리 밖으로 더 날아가는 거리
  fireGroundDps: 8,
  fireGroundDuration: 2,
  deepFreezeChance: 0.2,
  deepFreezeDuration: 1,
  doubleShotDamagePct: 0.6,
  doubleShotDelay: 0.15, // 1발째와 2발째 사이 간격 (초) — "따당" 리듬

  overloadCoilDecay: 0.15, // 과부하 코일: 연쇄 감쇠 30% → 15% (+연쇄 무제한)
  barbedWireDps: 5,
  dividendMult: 1.5,

  thornsReflectPct: 0.5,
  coreDischargeInterval: 3,
  coreDischargeRadius: 120,
  coreDischargeDamage: 15,
  exposeWeaknessBonus: 0.5,
  bountyMult: 2,
  interestRate: 0.1,
  interestCap: 30,
  recycleRefund: 0.9,
  glassCannonDamage: 1.4,
  glassCannonHp: 0.7,
  overheatRate: 1.25,
  overheatCoreHp: 20,
  gamblerMax: 200,
  repairAmount: 40,
  warFundsGold: 80,
} as const;

export const CARDS: Record<CardKey, CardDef> = {
  // ① 특성 — 빌드를 정의
  pierce:         { name: '관통탄',       desc: '캐논 발사체가 적을 관통해 경로상 모든 적을 타격합니다.',              category: 'trait',    unique: true,  icon: 'cannon' },
  fireGround:     { name: '화염 지대',    desc: '모르타르 폭발 지점에 2초간 불바닥이 남아 초당 8 피해를 줍니다.',       category: 'trait',    unique: true,  icon: 'mortar' },
  deepFreeze:     { name: '급속 냉동',    desc: '프로스트 명중 시 20% 확률로 적을 1초간 빙결시킵니다.',                category: 'trait',    unique: true,  icon: 'frost' },
  doubleShot:     { name: '이중 사격',    desc: '궁수가 한 번에 2발을 쏩니다 (발당 피해 60%).',                        category: 'trait',    unique: true,  icon: 'archer' },
  thorns:         { name: '가시 갑옷',    desc: '검병이 피격 시 공격자에게 받은 피해의 50%를 반사합니다.',              category: 'trait',    unique: true,  icon: 'swordsman' },
  coreDischarge:  { name: '코어 방전',    desc: '코어가 3초마다 주변 120px 내 모든 적에게 15 피해를 줍니다.',           category: 'trait',    unique: true,  icon: 'core' },
  overloadCoil:   { name: '과부하 코일',  desc: '테슬라의 연쇄가 무제한이 되고, 연쇄 감쇠가 30% → 15%로 줄어듭니다.',   category: 'trait',    unique: true,  icon: 'tesla' },
  barbedWire:     { name: '가시 철조망',  desc: '바리케이드에 접촉한 적이 초당 5 피해를 받습니다.',                     category: 'trait',    unique: true,  icon: 'barricade' },
  // ② 시너지 — 조합 유도
  exposeWeakness: { name: '약점 포착',    desc: '슬로우·빙결 상태의 적에게 모든 공격이 +50% 피해를 줍니다.',            category: 'synergy',  unique: true,  icon: 'frost' },
  bounty:         { name: '현상금 사냥',  desc: '탱커·보스 처치 시 골드를 2배로 받습니다.',                            category: 'synergy',  unique: true,  icon: 'tank' },
  interest:       { name: '이자',         desc: '웨이브 시작 시 보유 골드의 10%를 이자로 받습니다 (최대 +30G).',        category: 'synergy',  unique: true,  icon: 'spark', iconTint: 0xffcf5a },
  recycle:        { name: '재활용',       desc: '구조물 철거 환급이 50% → 90%로 늘어납니다.',                          category: 'synergy',  unique: true,  icon: 'barricade' },
  bootCamp:       { name: '신병 훈련소',  desc: '이후 배치되는 유닛(긴급 증원 포함)이 베테랑 계급으로 시작합니다.',      category: 'synergy',  unique: true,  icon: 'swordsman' },
  dividend:       { name: '복리 배당',    desc: '발전기 수익이 1.5배가 됩니다.',                                       category: 'synergy',  unique: true,  icon: 'generator' },
  // ③ 트레이드오프 — 리스크/리턴
  glassCannon:    { name: '유리 대포',    desc: '모든 배치물 공격력 +40%. 대신 구조물 HP −30%.',                       category: 'tradeoff', unique: true,  icon: 'cannon' },
  overheat:       { name: '과열 엔진',    desc: '모든 배치물 공속 +25%. 대신 코어 최대 HP −20.',                       category: 'tradeoff', unique: true,  icon: 'tesla' },
  gambler:        { name: '전투 도박사',  desc: '즉시 골드 +0~200 무작위 (평균 100).',                                 category: 'tradeoff', unique: true,  icon: 'shard', iconTint: 0xffcf5a },
  // ④ 즉발 — 위기 탈출 (반복 등장 가능)
  repair:         { name: '응급 수리',    desc: '코어 HP를 40 회복합니다.',                                            category: 'instant',  unique: false, icon: 'core' },
  warFunds:       { name: '군자금',       desc: '즉시 골드 +80.',                                                      category: 'instant',  unique: false, icon: 'generator' },
  reinforcement:  { name: '긴급 증원',    desc: '다음 웨이브 시작 시 검병 1기가 빈 셀에 무료 배치됩니다.',              category: 'instant',  unique: false, icon: 'swordsman' },
  medal:          { name: '훈장 수여',    desc: '킬 수가 가장 많은 유닛 1기가 즉시 진급합니다.',                        category: 'instant',  unique: false, icon: 'archer' },
};

export const CARD_CATEGORY_INFO: Record<CardCategory, { label: string; color: number }> = {
  trait:    { label: '특성',         color: 0xf0c674 },
  synergy:  { label: '시너지',       color: 0x7ee0a3 },
  tradeoff: { label: '트레이드오프', color: 0xe05555 },
  instant:  { label: '즉발',         color: 0x63c3d1 },
};
