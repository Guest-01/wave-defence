import Phaser from 'phaser';
import { CARDS } from '../data/cards';
import { generateArtTextures } from '../systems/textures';
import { UI } from '../systems/ui';

// Pretendard는 동적 서브셋(글리프 묶음별 분할 로드)이라, 게임에서 실제로 쓰는
// 한글이 포함된 샘플 텍스트로 미리 로드해 둔다. Phaser 텍스트는 캔버스에 그려져
// 폰트가 늦게 오면 폴백 글꼴로 굳어버리기 때문.
const KOREAN_SAMPLE =
  '중앙의 코어를 지키세요 웨이브 사이에 그리드 위 유닛과 구조물을 배치합니다 적을 처치하면 골드와 XP를 얻고 레벨업하면 넓어집니다 ' +
  '하나를 선택하세요 강화 카드 시작 배속 사거리 표시 일시정지 계속하기 타이틀로 나가기 사운드 켜짐 꺼짐 승리 패배 파괴됨 다시 도전해 보세요 ' +
  '생존 처치 최종 영토 정예 베테랑 진급 획득 결과 이자 철거 환급 긴급 증원 검병 무료 훈장 수여 궁수 캐논 모르타르 프로스트 일반 고속 탱커 보스 ' +
  '특성 시너지 트레이드오프 즉발 준비되면 아래 또는 키로 클릭 우클릭 취소 드래그 재배치 조작 방향에서 온다 확장 도박사 버리기';

/** 에셋 로드 씬. 스프라이트는 코드 생성, 웹폰트만 문서에서 로드를 기다린다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateArtTextures(this);

    const cardText = Object.values(CARDS)
      .map((c) => c.name + c.desc)
      .join('');
    const sample = KOREAN_SAMPLE + cardText;

    const fonts = Promise.all([
      document.fonts.load('700 20px "Chakra Petch"', 'WAVE DEFENCE 0123456789'),
      document.fonts.load('600 20px "Chakra Petch"', 'WAVE 0123456789'),
      document.fonts.load('500 16px "Pretendard Variable"', sample),
      document.fonts.load('700 16px "Pretendard Variable"', sample),
    ]).catch(() => undefined);
    // CDN 실패 시에도 게임이 멈추지 않도록 상한을 둔다 (폴백 폰트로 진행)
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'LOADING', {
        fontSize: '16px',
        color: UI.textDim,
        fontFamily: UI.FONT_DISPLAY,
      })
      .setOrigin(0.5);

    void Promise.race([fonts, timeout]).then(() => this.scene.start('Title'));
  }
}
