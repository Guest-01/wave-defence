// 런 저장(이어하기) · 최고 기록 — localStorage 기반 (기획 문서 4.5절).
// 저장 시점: 웨이브 시작 직전 + 드래프트 카드 선택 직후. 런 종료·새 게임 시 삭제.

import type { PlaceableKey } from '../data/balance';
import type { CardKey } from '../data/cards';
import type { Mods } from '../scenes/GameScene';

const RUN_KEY = 'wd_run';
const BEST_KEY = 'wd_best';

export interface SavedPlaceable {
  key: PlaceableKey;
  col: number;
  row: number;
  level: number;
  invested: number;
  kills: number;
  rank: number;
  equipped: boolean;
  hp: number;
  maxHp: number;
}

export interface RunSave {
  v: 1;
  waveIndex: number;
  gold: number;
  xp: number;
  coreHp: number;
  coreMaxHp: number;
  totalKills: number;
  mods: Mods;
  acquired: CardKey[];
  /** 선택한 카드 전체 이력 (결과 화면 빌드 요약용). 구버전 저장엔 없을 수 있다 */
  cardHistory?: CardKey[];
  placeables: SavedPlaceable[];
}

export interface BestRecord {
  /** 도달 웨이브 (패배 시 진행 중이던 웨이브, 승리 시 전체 웨이브 수) */
  reached: number;
  victory: boolean;
}

export function saveRun(s: RunSave): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(s));
  } catch {
    // localStorage 접근 불가 시 무시 (이어하기 없이 진행)
  }
}

export function loadRun(): RunSave | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunSave;
    return s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    // 무시
  }
}

export function loadBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as BestRecord) : null;
  } catch {
    return null;
  }
}

/** 기록 갱신 시도 — 신기록이면 저장하고 true 반환 */
export function updateBest(reached: number, victory: boolean): boolean {
  const cur = loadBest();
  const isNew = !cur || reached > cur.reached || (victory && !cur.victory);
  if (isNew) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ reached, victory } satisfies BestRecord));
    } catch {
      // 무시
    }
  }
  return isNew;
}
