/**
 * Local UI sounds under /sounds/*.wav (Vite public/). Does not affect SIP/WebRTC media.
 */
const BASE = '/sounds';

const files = {
  ringback: `${BASE}/ringback.wav`,
  busy: `${BASE}/busy.wav`,
  congestion: `${BASE}/congestion.wav`,
  disconnect: `${BASE}/disconnect.wav`,
} as const;

let ringbackEl: HTMLAudioElement | null = null;
let busyEl: HTMLAudioElement | null = null;
let congestionEl: HTMLAudioElement | null = null;
let disconnectEl: HTMLAudioElement | null = null;
let statusStopTimer: ReturnType<typeof setTimeout> | null = null;

function getRingback(): HTMLAudioElement {
  if (!ringbackEl) {
    ringbackEl = new Audio(files.ringback);
    ringbackEl.preload = 'auto';
  }
  ringbackEl.loop = true;
  return ringbackEl;
}

function getBusy(): HTMLAudioElement {
  if (!busyEl) {
    busyEl = new Audio(files.busy);
    busyEl.preload = 'auto';
  }
  return busyEl;
}

function getCongestion(): HTMLAudioElement {
  if (!congestionEl) {
    congestionEl = new Audio(files.congestion);
    congestionEl.preload = 'auto';
  }
  return congestionEl;
}

function getDisconnect(): HTMLAudioElement {
  if (!disconnectEl) {
    disconnectEl = new Audio(files.disconnect);
    disconnectEl.preload = 'auto';
  }
  return disconnectEl;
}

function pauseAndReset(a: HTMLAudioElement | null) {
  if (!a) return;
  a.pause();
  a.currentTime = 0;
}

function clearStatusTimer() {
  if (statusStopTimer !== null) {
    clearTimeout(statusStopTimer);
    statusStopTimer = null;
  }
}

/** Stop ringback only (keeps any status sound logic separate). */
export function stopRingback(): void {
  pauseAndReset(ringbackEl);
}

/** Stop ringback + status clips + pending auto-stop timer. */
export function stopAllCallSounds(): void {
  clearStatusTimer();
  pauseAndReset(ringbackEl);
  pauseAndReset(busyEl);
  pauseAndReset(congestionEl);
  pauseAndReset(disconnectEl);
}

/**
 * Outbound: play looping ringback while remote is ringing.
 * Safe if file missing (play() rejects — ignored).
 */
export function playRingback(): void {
  stopStatusClipsOnly();
  const r = getRingback();
  void r.play().catch(() => undefined);
}

function stopStatusClipsOnly(): void {
  clearStatusTimer();
  pauseAndReset(busyEl);
  pauseAndReset(congestionEl);
  pauseAndReset(disconnectEl);
}

function playClipOnce(audio: HTMLAudioElement, maxMs: number): void {
  audio.loop = false;
  void audio.play().catch(() => undefined);
  clearStatusTimer();
  statusStopTimer = setTimeout(() => {
    pauseAndReset(audio);
    statusStopTimer = null;
  }, maxMs);
}

/**
 * Play a short status tone after failed or ended outbound call.
 * 486/603 → busy, 480/503/404 → congestion, else disconnect.
 */
export function playOutboundTerminalSound(sipCode?: number): void {
  stopRingback();
  stopStatusClipsOnly();

  let clip: HTMLAudioElement;
  if (sipCode === 486 || sipCode === 603) {
    clip = getBusy();
  } else if (sipCode === 480 || sipCode === 503 || sipCode === 404) {
    clip = getCongestion();
  } else {
    clip = getDisconnect();
  }
  playClipOnce(clip, 3000);
}
