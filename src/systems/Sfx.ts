// WebAudio 기반 생성 효과음 (jsfxr류). 에셋 파일 없이 오실레이터/노이즈로 합성한다.
// 추후 Kenney 오디오 팩 등으로 교체 시 play() 호출부는 그대로 두고 내부만 바꾸면 된다.

export type SfxName =
  | 'shoot'
  | 'zap'
  | 'melee'
  | 'hit'
  | 'explosion'
  | 'death'
  | 'place'
  | 'deny'
  | 'demolish'
  | 'upgrade'
  | 'promote'
  | 'card'
  | 'cardHover'
  | 'cardDeal'
  | 'roll'
  | 'gamblerWin'
  | 'gamblerLose'
  | 'bossSpawn'
  | 'coreHit'
  | 'waveStart'
  | 'levelup'
  | 'victory'
  | 'defeat';

const MUTE_KEY = 'wd_muted';
const VOLUME_KEY = 'wd_volume';
const MASTER_VOLUME = 0.25;

/** BGM 모드 — BUILD/드래프트: 차분 / WAVE: 베이스+아르페지오 / 보스: 저음 강조 */
export type BgmMode = 'build' | 'wave' | 'boss';

const BGM_VOLUME = 0.5; // 마스터(0.25) 아래에 곱해지는 BGM 버스 볼륨
const BGM_STEP = 0.144; // 16분음표 길이 (≈104 BPM)
const BGM_STEPS = 4 * 16; // 4마디 루프
// A단조 진행 Am–F–C–G (신스웨이브 상투 진행) — 마디별 [루트, 3화음]
const BGM_ROOTS = [110, 87.31, 130.81, 98];
const BGM_CHORDS = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastPlayed = new Map<SfxName, number>();
  private muted: boolean;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmMode: BgmMode = 'build';
  private bgmWanted = false;
  private bgmStep = 0;
  private bgmNextTime = 0;

  /** 사용자 볼륨 (0~1, localStorage 저장). 마스터 볼륨에 곱해진다 */
  private volume: number;

  constructor() {
    let stored = false;
    let vol = 1;
    try {
      stored = localStorage.getItem(MUTE_KEY) === '1';
      const raw = localStorage.getItem(VOLUME_KEY);
      if (raw !== null) vol = Number.parseFloat(raw);
    } catch {
      stored = false;
    }
    this.muted = stored;
    this.volume = Number.isFinite(vol) ? Math.min(Math.max(vol, 0), 1) : 1;
  }

  isMuted(): boolean {
    return this.muted;
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number): void {
    this.volume = Math.min(Math.max(v, 0), 1);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // localStorage 접근 불가 시 무시
    }
    this.applyMasterGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      // localStorage 접근 불가 시 무시 (세션 내 상태만 유지)
    }
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER_VOLUME * this.volume;
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
        this.master.connect(this.ctx.destination);
        this.applyMasterGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx.state === 'running';
    } catch {
      return false;
    }
  }

  // ── BGM (WebAudio 생성 신스웨이브 루프, 룩어헤드 스케줄러) ────

  /** BGM 시작. AudioContext가 아직 잠겨 있으면(자동재생 정책) 다음 효과음 재생 시 자동 재시도 */
  bgmStart(mode: BgmMode): void {
    this.bgmWanted = true;
    this.bgmMode = mode;
    this.tryStartBgm();
  }

  /** 모드 전환 — 다음 스케줄 스텝부터 반영 */
  bgmSetMode(mode: BgmMode): void {
    this.bgmMode = mode;
    if (this.bgmWanted && this.bgmTimer === null) this.tryStartBgm();
  }

  bgmStop(): void {
    this.bgmWanted = false;
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.ctx && this.bgmGain) {
      const t = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(t);
      this.bgmGain.gain.setValueAtTime(Math.max(this.bgmGain.gain.value, 0.0001), t);
      this.bgmGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    }
  }

  private tryStartBgm(): void {
    if (this.bgmTimer !== null || !this.ensure() || !this.ctx || !this.master) return;
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.master); // 마스터 버스 공유 → 음소거가 BGM에도 적용
    }
    const t = this.ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setValueAtTime(0.0001, t);
    this.bgmGain.gain.exponentialRampToValueAtTime(BGM_VOLUME, t + 1.2);
    this.bgmStep = 0;
    this.bgmNextTime = t + 0.05;
    this.bgmTimer = window.setInterval(() => this.bgmTick(), 40);
  }

  private bgmTick(): void {
    if (!this.ctx) return;
    // 룩어헤드: 현재 시각보다 0.18초 앞까지의 스텝을 미리 스케줄
    while (this.bgmNextTime < this.ctx.currentTime + 0.18) {
      this.bgmScheduleStep(this.bgmStep, this.bgmNextTime);
      this.bgmStep = (this.bgmStep + 1) % BGM_STEPS;
      this.bgmNextTime += BGM_STEP;
    }
  }

  private bgmScheduleStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const root = BGM_ROOTS[bar];
    const chord = BGM_CHORDS[bar];
    const mode = this.bgmMode;

    // 패드: 마디 첫 박에 코드 전체 (느린 어택, 한 마디 지속). 보스는 어두운 필터 + 서브 베이스
    if (pos === 0) {
      const cutoff = mode === 'boss' ? 320 : 620;
      for (const f of chord) this.bgmTone(f, t, BGM_STEP * 16, 'sawtooth', 0.045, cutoff, 0.5);
      if (mode === 'boss') this.bgmTone(root / 2, t, BGM_STEP * 16, 'sine', 0.14, 200, 0.3);
    }
    // 베이스: 8분음표 펄스 (전투에서만), 마디 끝에서 옥타브 점프
    if (mode !== 'build' && pos % 2 === 0) {
      const f = mode === 'boss' ? root / 2 : root;
      this.bgmTone(pos === 14 ? f * 2 : f, t, 0.14, 'triangle', 0.11, 900, 0.005);
    }
    // 아르페지오: WAVE는 16분 코드 톤 순환, BUILD는 드문 종소리, 보스는 4분 저음 스타카토
    if (mode === 'wave') {
      this.bgmTone(chord[pos % 3] * 2, t, 0.1, 'square', 0.03, 2200, 0.005);
    } else if (mode === 'build' && (pos === 4 || pos === 12)) {
      this.bgmTone(chord[(bar + pos / 4) % 3] * 2, t, 0.5, 'sine', 0.05, undefined, 0.01);
    } else if (mode === 'boss' && pos % 4 === 0) {
      this.bgmTone(chord[0], t, 0.12, 'square', 0.05, 700, 0.005);
    }
  }

  /** BGM 전용 톤 — 어택/릴리즈 엔벨로프 + 선택적 로패스, bgmGain 버스로 출력 */
  private bgmTone(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    filterFreq?: number,
    attack = 0.01,
  ): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head: AudioNode = osc;
    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, t);
      osc.connect(filter);
      head = filter;
    }
    head.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  play(name: SfxName): void {
    if (this.muted) return;
    if (!this.ensure()) return;
    // 자동재생 정책으로 미뤄진 BGM을 사용자 입력 기반 재생 시점에 시작
    if (this.bgmWanted && this.bgmTimer === null) this.tryStartBgm();
    // 다발성 사운드(발사·명중·슬롯 롤링)는 최소 간격으로 스팸 방지
    const now = performance.now();
    const minGap = name === 'roll' ? 25 : name === 'shoot' || name === 'hit' ? 45 : 90;
    if (now - (this.lastPlayed.get(name) ?? 0) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'shoot':
        this.tone(700, 180, 0.07, 'square', 0.35);
        break;
      case 'zap':
        // 테슬라 연쇄 번개 — 고음 급강하 + 지직 노이즈
        this.tone(1400, 220, 0.09, 'sawtooth', 0.22);
        this.noise(0.06, 0.18, 2400);
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
      case 'deny':
        // 골드 부족 등 거부 피드백 — 낮은 이중 버즈
        this.tone(220, 150, 0.07, 'square', 0.2);
        this.tone(160, 110, 0.1, 'square', 0.2, 0.08);
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
      case 'cardHover':
        this.tone(950, 1050, 0.035, 'sine', 0.1);
        break;
      case 'cardDeal':
        this.tone(500, 750, 0.06, 'sine', 0.18);
        this.tone(600, 900, 0.06, 'sine', 0.18, 0.09);
        this.tone(700, 1050, 0.08, 'sine', 0.18, 0.18);
        break;
      case 'roll':
        this.tone(1400, 1200, 0.025, 'square', 0.08);
        break;
      case 'gamblerWin':
        this.tone(523, 523, 0.1, 'square', 0.28);
        this.tone(659, 659, 0.1, 'square', 0.28, 0.09);
        this.tone(784, 784, 0.1, 'square', 0.28, 0.18);
        this.tone(1047, 1047, 0.25, 'square', 0.3, 0.27);
        break;
      case 'gamblerLose':
        this.tone(360, 180, 0.28, 'sawtooth', 0.2);
        break;
      case 'bossSpawn':
        this.tone(70, 32, 0.6, 'sawtooth', 0.5);
        this.noise(0.4, 0.3, 200);
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
