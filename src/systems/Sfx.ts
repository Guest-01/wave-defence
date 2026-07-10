// WebAudio 기반 생성 효과음 (jsfxr류). 에셋 파일 없이 오실레이터/노이즈로 합성한다.
// 추후 Kenney 오디오 팩 등으로 교체 시 play() 호출부는 그대로 두고 내부만 바꾸면 된다.

export type SfxName =
  | 'shoot'
  | 'melee'
  | 'hit'
  | 'explosion'
  | 'death'
  | 'place'
  | 'demolish'
  | 'upgrade'
  | 'promote'
  | 'card'
  | 'coreHit'
  | 'waveStart'
  | 'levelup'
  | 'victory'
  | 'defeat';

const MUTE_KEY = 'wd_muted';
const MASTER_VOLUME = 0.25;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SfxName, number>();
  private muted: boolean;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      stored = false;
    }
    this.muted = stored;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // localStorage 접근 불가 시 무시 (세션 내 상태만 유지)
    }
    if (this.master) this.master.gain.value = m ? 0 : MASTER_VOLUME;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** 브라우저 자동재생 정책 때문에 첫 사용자 입력 이후에만 생성 가능 */
  private ensure(): boolean {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }

  play(name: SfxName): void {
    if (this.muted) return;
    if (!this.ensure()) return;
    // 다발성 사운드(발사·명중)는 최소 간격으로 스팸 방지
    const now = performance.now();
    const minGap = name === 'shoot' || name === 'hit' ? 45 : 90;
    if (now - (this.lastPlayed.get(name) ?? 0) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'shoot':
        this.tone(700, 180, 0.07, 'square', 0.35);
        break;
      case 'melee':
        this.tone(180, 320, 0.06, 'triangle', 0.3);
        break;
      case 'hit':
        this.tone(260, 120, 0.05, 'triangle', 0.3);
        break;
      case 'explosion':
        this.noise(0.35, 0.5, 900);
        this.tone(120, 40, 0.3, 'sine', 0.4);
        break;
      case 'death':
        this.tone(320, 70, 0.18, 'sawtooth', 0.25);
        break;
      case 'place':
        this.tone(300, 300, 0.06, 'sine', 0.35);
        this.tone(450, 450, 0.06, 'sine', 0.35, 0.07);
        break;
      case 'demolish':
        this.noise(0.2, 0.35, 500);
        break;
      case 'upgrade':
        this.tone(330, 330, 0.08, 'square', 0.3);
        this.tone(440, 440, 0.08, 'square', 0.3, 0.09);
        this.tone(550, 550, 0.12, 'square', 0.3, 0.18);
        break;
      case 'promote':
        this.tone(440, 440, 0.1, 'square', 0.35);
        this.tone(660, 660, 0.18, 'square', 0.35, 0.11);
        break;
      case 'card':
        this.tone(880, 1320, 0.15, 'sine', 0.25);
        break;
      case 'coreHit':
        this.tone(90, 40, 0.25, 'sawtooth', 0.55);
        this.noise(0.15, 0.35, 300);
        break;
      case 'waveStart':
        this.tone(180, 240, 0.35, 'sawtooth', 0.3);
        break;
      case 'levelup':
        this.tone(300, 900, 0.35, 'sine', 0.35);
        break;
      case 'victory':
        this.tone(523, 523, 0.15, 'square', 0.3);
        this.tone(659, 659, 0.15, 'square', 0.3, 0.16);
        this.tone(784, 784, 0.3, 'square', 0.3, 0.32);
        break;
      case 'defeat':
        this.tone(300, 300, 0.2, 'sawtooth', 0.3);
        this.tone(230, 230, 0.2, 'sawtooth', 0.3, 0.22);
        this.tone(150, 100, 0.4, 'sawtooth', 0.3, 0.44);
        break;
    }
  }

  private tone(
    freqFrom: number,
    freqTo: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(freqFrom, 1), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noise(duration: number, volume: number, filterFreq: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(filterFreq * 0.2, 40), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }
}
