import type { EnemyKey } from './balance';

export type Direction = 'top' | 'bottom' | 'left' | 'right';

export interface SpawnGroup {
  enemy: EnemyKey;
  count: number;
  /** 개체 간 스폰 간격 (초) */
  interval: number;
  direction: Direction;
  /** 웨이브 시작 후 첫 스폰까지 지연 (초) */
  startDelay?: number;
}

export interface WaveDef {
  groups: SpawnGroup[];
}

export const DIRECTION_KO: Record<Direction, string> = {
  top: '상단',
  bottom: '하단',
  left: '좌측',
  right: '우측',
};

// 프로토타입 범위: 웨이브 1~6 (기획 문서 3.5절 발췌 테이블).
// 전체 20웨이브는 M3에서 채운다.
export const WAVES: WaveDef[] = [
  { groups: [{ enemy: 'grunt', count: 5, interval: 1.2, direction: 'right' }] },
  { groups: [{ enemy: 'grunt', count: 8, interval: 1.0, direction: 'right' }] },
  {
    groups: [
      { enemy: 'grunt', count: 6, interval: 1.0, direction: 'right' },
      { enemy: 'runner', count: 4, interval: 0.8, direction: 'right', startDelay: 3 },
    ],
  },
  {
    groups: [
      { enemy: 'grunt', count: 8, interval: 0.9, direction: 'right' },
      { enemy: 'runner', count: 6, interval: 0.7, direction: 'right', startDelay: 2 },
    ],
  },
  {
    groups: [
      { enemy: 'boss', count: 1, interval: 0, direction: 'right' },
      { enemy: 'grunt', count: 5, interval: 1.5, direction: 'right', startDelay: 2 },
    ],
  },
  {
    groups: [
      { enemy: 'grunt', count: 8, interval: 0.8, direction: 'right' },
      { enemy: 'tank', count: 2, interval: 3, direction: 'left' },
    ],
  },
];
