// 표시 설정 (localStorage) — 접근성: 화면 흔들림 끄기. 볼륨은 Sfx가 관리(wd_volume).

const SHAKE_KEY = 'wd_shake';

export function shakeEnabled(): boolean {
  try {
    return localStorage.getItem(SHAKE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setShakeEnabled(on: boolean): void {
  try {
    localStorage.setItem(SHAKE_KEY, on ? '1' : '0');
  } catch {
    // localStorage 접근 불가 시 무시
  }
}
