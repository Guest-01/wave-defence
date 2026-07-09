import Phaser from 'phaser';
import { WORLD } from '../data/balance';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    this.add
      .text(cx, cy - 140, 'WAVE DEFENCE', { fontSize: '56px', color: '#f5d547', fontFamily: 'sans-serif' })
      .setOrigin(0.5);
    this.add
      .text(cx, cy - 80, '프로토타입 (M0~M3)', { fontSize: '18px', color: '#888888', fontFamily: 'sans-serif' })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        cy + 10,
        [
          '중앙의 코어를 지키세요. 웨이브 사이에 그리드 위에 유닛과 구조물을 배치합니다.',
          '적을 처치하면 골드와 XP를 얻고, 레벨업하면 배치 그리드가 넓어집니다.',
          '',
          '조작: 하단 버튼 클릭 → 그리드 클릭으로 배치 · 우클릭/ESC 취소',
          '유닛(원형)은 웨이브 사이에 드래그로 재배치할 수 있습니다',
        ].join('\n'),
        { fontSize: '16px', color: '#c8c8c8', fontFamily: 'sans-serif', align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(cx, cy + 140, 220, 56, 0x2f6b3a, 1)
      .setStrokeStyle(2, 0x7ee0a3, 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy + 140, '게임 시작', { fontSize: '22px', color: '#e8e8e8', fontFamily: 'sans-serif' })
      .setOrigin(0.5);
    btn.on('pointerdown', () => this.scene.start('Game'));
  }
}
