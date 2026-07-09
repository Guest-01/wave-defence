import Phaser from 'phaser';

/** 에셋 로드 씬. 프로토타입은 도형만 사용하므로 바로 타이틀로 넘어간다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Title');
  }
}
