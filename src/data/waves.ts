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

// 전체 20웨이브. 긴장 곡선: W1~5 한 방향 → W6~14 2방향 → W15~ 전방향.
// 보스 웨이브: 5 / 10 / 15 / 20 (보스 HP는 balance.ts의 BOSS_HP 테이블).
export const WAVES: WaveDef[] = [
  // W1 — 튜토리얼
  { groups: [{ enemy: 'grunt', count: 5, interval: 1.2, direction: 'right' }] },
  // W2 — 골드 모아 배치물 추가
  { groups: [{ enemy: 'grunt', count: 8, interval: 1.0, direction: 'right' }] },
  // W3 — 고속 첫 등장
  {
    groups: [
      { enemy: 'grunt', count: 6, interval: 1.0, direction: 'right' },
      { enemy: 'runner', count: 4, interval: 0.8, direction: 'right', startDelay: 3 },
    ],
  },
  // W4
  {
    groups: [
      { enemy: 'grunt', count: 8, interval: 0.9, direction: 'right' },
      { enemy: 'runner', count: 6, interval: 0.7, direction: 'right', startDelay: 2 },
    ],
  },
  // W5 — 첫 보스
  {
    groups: [
      { enemy: 'boss', count: 1, interval: 0, direction: 'right' },
      { enemy: 'grunt', count: 5, interval: 1.5, direction: 'right', startDelay: 2 },
    ],
  },
  // W6 — 탱커 첫 등장, 2방향 개시
  {
    groups: [
      { enemy: 'grunt', count: 8, interval: 0.8, direction: 'right' },
      { enemy: 'tank', count: 2, interval: 3, direction: 'left' },
    ],
  },
  // W7 — 좌우 교차
  {
    groups: [
      { enemy: 'grunt', count: 10, interval: 0.8, direction: 'right' },
      { enemy: 'runner', count: 6, interval: 0.7, direction: 'left', startDelay: 3 },
    ],
  },
  // W8 — 고속 물량 압박 (광역 검증)
  { groups: [{ enemy: 'runner', count: 12, interval: 0.5, direction: 'right' }] },
  // W9
  {
    groups: [
      { enemy: 'grunt', count: 10, interval: 0.8, direction: 'left' },
      { enemy: 'tank', count: 3, interval: 2.5, direction: 'right' },
    ],
  },
  // W10 — 보스 + 탱커
  {
    groups: [
      { enemy: 'boss', count: 1, interval: 0, direction: 'right' },
      { enemy: 'tank', count: 3, interval: 3, direction: 'left', startDelay: 2 },
    ],
  },
  // W11 — 상하 첫 등장 (재배치 강요)
  {
    groups: [
      { enemy: 'runner', count: 10, interval: 0.6, direction: 'top' },
      { enemy: 'grunt', count: 10, interval: 0.8, direction: 'bottom' },
    ],
  },
  // W12 — 탱커 종대 + 분열 첫 등장 (한 방향이라 학습 용이)
  {
    groups: [
      { enemy: 'tank', count: 4, interval: 2.5, direction: 'right' },
      { enemy: 'splitter', count: 4, interval: 1.2, direction: 'right', startDelay: 2 },
    ],
  },
  // W13
  {
    groups: [
      { enemy: 'grunt', count: 14, interval: 0.6, direction: 'left' },
      { enemy: 'tank', count: 3, interval: 2.5, direction: 'top', startDelay: 2 },
    ],
  },
  // W14 — 상하 물량 + 분열
  {
    groups: [
      { enemy: 'runner', count: 16, interval: 0.45, direction: 'bottom' },
      { enemy: 'splitter', count: 5, interval: 1.2, direction: 'top' },
    ],
  },
  // W15 — 보스 + 전방향 개시
  {
    groups: [
      { enemy: 'boss', count: 1, interval: 0, direction: 'right' },
      { enemy: 'grunt', count: 8, interval: 0.8, direction: 'left', startDelay: 1 },
      { enemy: 'runner', count: 8, interval: 0.7, direction: 'top', startDelay: 3 },
      { enemy: 'runner', count: 8, interval: 0.7, direction: 'bottom', startDelay: 5 },
    ],
  },
  // W16 — 양측 탱커
  {
    groups: [
      { enemy: 'tank', count: 4, interval: 2.2, direction: 'right' },
      { enemy: 'tank', count: 4, interval: 2.2, direction: 'left' },
      { enemy: 'runner', count: 12, interval: 0.5, direction: 'top', startDelay: 2 },
    ],
  },
  // W17 — 상하 물량 + 좌우 탱커 (하단은 분열 섞임)
  {
    groups: [
      { enemy: 'grunt', count: 14, interval: 0.55, direction: 'top' },
      { enemy: 'grunt', count: 8, interval: 0.55, direction: 'bottom' },
      { enemy: 'splitter', count: 3, interval: 1.4, direction: 'bottom', startDelay: 1 },
      { enemy: 'tank', count: 3, interval: 2.5, direction: 'left', startDelay: 3 },
      { enemy: 'tank', count: 3, interval: 2.5, direction: 'right', startDelay: 3 },
    ],
  },
  // W18 — 고속 러시
  {
    groups: [
      { enemy: 'runner', count: 16, interval: 0.4, direction: 'left' },
      { enemy: 'runner', count: 16, interval: 0.4, direction: 'right' },
      { enemy: 'tank', count: 4, interval: 2.2, direction: 'bottom', startDelay: 2 },
    ],
  },
  // W19 — 총력전 전초
  {
    groups: [
      { enemy: 'grunt', count: 12, interval: 0.5, direction: 'right' },
      { enemy: 'grunt', count: 6, interval: 0.5, direction: 'left' },
      { enemy: 'splitter', count: 4, interval: 1.2, direction: 'left', startDelay: 1 },
      { enemy: 'tank', count: 4, interval: 2, direction: 'top', startDelay: 2 },
      { enemy: 'runner', count: 12, interval: 0.5, direction: 'bottom', startDelay: 4 },
    ],
  },
  // W20 — 최종 보스 + 전 종류 혼합
  {
    groups: [
      { enemy: 'boss', count: 1, interval: 0, direction: 'right' },
      { enemy: 'tank', count: 4, interval: 2.5, direction: 'left', startDelay: 2 },
      { enemy: 'grunt', count: 8, interval: 0.7, direction: 'top', startDelay: 4 },
      { enemy: 'splitter', count: 4, interval: 1.3, direction: 'top', startDelay: 5 },
      { enemy: 'runner', count: 12, interval: 0.6, direction: 'bottom', startDelay: 6 },
    ],
  },
];
