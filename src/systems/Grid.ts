import { GRID, WORLD } from '../data/balance';

export interface Cell {
  col: number;
  row: number;
}

/**
 * 코어 중심 배치 그리드. 셀 좌표는 코어를 (0,0)으로 하는 정수 오프셋.
 * 레벨업 시 half-extent가 한 겹씩 늘어난다 (5×5 → 7×7 → …).
 */
export class Grid {
  level = 1;
  readonly cx = WORLD.width / 2;
  readonly cy = WORLD.height / 2;
  readonly cellSize = GRID.cellSize;
  private occupied = new Set<string>();

  get maxLevel(): number {
    return GRID.halfExtents.length;
  }

  get halfExtent(): number {
    return GRID.halfExtents[this.level - 1];
  }

  private key(col: number, row: number): string {
    return `${col},${row}`;
  }

  cellToWorld(col: number, row: number): { x: number; y: number } {
    return { x: this.cx + col * this.cellSize, y: this.cy + row * this.cellSize };
  }

  worldToCell(x: number, y: number): Cell {
    return {
      col: Math.round((x - this.cx) / this.cellSize),
      row: Math.round((y - this.cy) / this.cellSize),
    };
  }

  isInside(col: number, row: number): boolean {
    return Math.abs(col) <= this.halfExtent && Math.abs(row) <= this.halfExtent;
  }

  isCore(col: number, row: number): boolean {
    return col === 0 && row === 0;
  }

  isFree(col: number, row: number): boolean {
    return this.isInside(col, row) && !this.isCore(col, row) && !this.occupied.has(this.key(col, row));
  }

  occupy(col: number, row: number): void {
    this.occupied.add(this.key(col, row));
  }

  vacate(col: number, row: number): void {
    this.occupied.delete(this.key(col, row));
  }

  /** 레벨업 — 그리드 한 겹 확장. 이미 최대면 false */
  expand(): boolean {
    if (this.level >= this.maxLevel) return false;
    this.level++;
    return true;
  }
}
