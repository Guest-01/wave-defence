import Phaser from 'phaser';
import { WORLD } from '../data/balance';
import { TextButton, UI } from '../systems/ui';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    // 배경 (게임과 같은 아레나 톤)
    this.add.image(cx, cy, 'bg').setDepth(-1);

    // 발광 코어 아이콘 + 맥동
    const core = this.add.image(cx, cy - 168, 'core').setScale(0.62);
    this.tweens.add({ targets: core, scale: 0.68, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add
      .text(cx, cy - 96, 'WAVE DEFENCE', { fontSize: '58px', color: '#eafcff', fontFamily: UI.FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3ff0e0', 18);
    this.add
      .text(cx, cy - 52, '프로토타입 (M0~M3)', { fontSize: '17px', color: UI.textDim, fontFamily: UI.FONT })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        cy + 24,
        [
          '중앙의 코어를 지키세요. 웨이브 사이에 그리드 위에 유닛과 구조물을 배치합니다.',
          '적을 처치하면 골드와 XP를 얻고, 레벨업하면 배치 그리드가 넓어집니다.',
          '',
          '조작: 하단 버튼(또는 1~5) → 그리드 클릭으로 배치 · 우클릭/ESC 취소',
          '유닛은 웨이브 사이에 드래그로 재배치 · ESC/P 로 일시정지',
        ].join('\n'),
        { fontSize: '16px', color: '#b7c4da', fontFamily: UI.FONT, align: 'center', lineSpacing: 7 },
      )
      .setOrigin(0.5);

    new TextButton(this, cx, cy + 150, 240, 58, '게임 시작', {
      variant: 'primary',
      fontSize: 23,
      onClick: () => this.scene.start('Game'),
    });
  }
}
