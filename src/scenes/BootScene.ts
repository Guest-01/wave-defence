import Phaser from 'phaser';
import { generateArtTextures } from '../systems/textures';

/** 에셋 로드 씬. 스프라이트는 외부 파일 없이 코드로 생성한다 (네온 아레나 아트). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateArtTextures(this);
    this.scene.start('Title');
  }
}
