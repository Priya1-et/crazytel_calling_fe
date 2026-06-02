/**
 * Local UI sounds under /sounds/*.wav (Vite public/). Does not affect SIP/WebRTC media.
 */
const BASE = '/sounds';

const files = {
  ringback: `${BASE}/ringback.wav`,
  incomingRing: `${BASE}/incoming-ring.wav`,
  busy: `${BASE}/busy.wav`,
  congestion: `${BASE}/congestion.wav`,
  disconnect: `${BASE}/disconnect.wav`,
} as const;

let ringbackEl: HTMLAudioElement | null = null;
let incomingRingEl: HTMLAudioElement | null = null;
let busyEl: HTMLAudioElement | null = null;
let congestionEl: HTMLAudioElement | null = null;
let disconnectEl: HTMLAudioElement | null = null;
let statusStopTimer: ReturnType<typeof setTimeout> | null = null;
let audioUnlocked = false;

let syntheticCtx: AudioContext | null = null;
let syntheticRingTimer: ReturnType<typeof setInterval> | null = null;
let syntheticBurstTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumps on stop — in-flight async playIncomingRing must not restart audio after answer. */
let incomingRingGeneration = 0;
let inboundRingSessionActive = false;

function getRingback(): HTMLAudioElement {
  if (!ringbackEl) {
    ringbackEl = new Audio(files.ringback);
    ringbackEl.preload = 'auto';
  }
  ringbackEl.loop = true;
  return ringbackEl;
}

function getIncomingRing(): HTMLAudioElement {
  if (!incomingRingEl) {
    incomingRingEl = new Audio(files.incomingRing);
    incomingRingEl.preload = 'auto';
  }
  incomingRingEl.loop = true;
  return incomingRingEl;
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

function stopSyntheticIncomingRing(): void {
  if (syntheticRingTimer !== null) {
    clearInterval(syntheticRingTimer);
    syntheticRingTimer = null;
  }
  if (syntheticBurstTimer !== null) {
    clearTimeout(syntheticBurstTimer);
    syntheticBurstTimer = null;
  }
  if (syntheticCtx) {
    void syntheticCtx.close().catch(() => undefined);
    syntheticCtx = null;
  }
}

function playSyntheticBurst(): void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!syntheticCtx || syntheticCtx.state === 'closed') {
    syntheticCtx = new Ctx();
  }
  void syntheticCtx.resume().then(() => {
    if (!syntheticCtx) return;
    const t0 = syntheticCtx.currentTime;
    const gain = syntheticCtx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
    gain.gain.setValueAtTime(0.2, t0 + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1);
    gain.connect(syntheticCtx.destination);

    for (const freq of [440, 480]) {
      const osc = syntheticCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + 1);
    }
  });
}

function startSyntheticIncomingRing(): void {
  stopSyntheticIncomingRing();
  playSyntheticBurst();
  syntheticRingTimer = setInterval(playSyntheticBurst, 3000);
}

async function tryPlayLooping(audio: HTMLAudioElement): Promise<boolean> {
  audio.loop = true;
  audio.currentTime = 0;
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

/**
 * Browsers block audio until a user gesture. Call after mic permission or first click.
 */
export async function unlockCallAudio(): Promise<void> {
  if (audioUnlocked) return;
  const clips = [getIncomingRing(), getRingback()];
  for (const clip of clips) {
    clip.volume = 0.001;
    clip.loop = false;
    try {
      await clip.play();
      clip.pause();
      clip.currentTime = 0;
      clip.volume = 1;
      audioUnlocked = true;
      return;
    } catch {
      clip.pause();
      clip.currentTime = 0;
      clip.volume = 1;
    }
  }
}

/** Stop ringback only (keeps incoming ring / status clips separate). */
export function stopRingback(): void {
  pauseAndReset(ringbackEl);
}

/** Stop inbound ring tone (WAV or synthetic fallback). */
export function stopIncomingRing(): void {
  incomingRingGeneration += 1;
  if (inboundRingSessionActive) {
    pauseAndReset(ringbackEl);
  }
  inboundRingSessionActive = false;
  pauseAndReset(incomingRingEl);
  stopSyntheticIncomingRing();
}

export function isIncomingRingPlaying(): boolean {
  if (!inboundRingSessionActive) return false;
  if (syntheticRingTimer !== null) return true;
  if (incomingRingEl && !incomingRingEl.paused) return true;
  return Boolean(ringbackEl && !ringbackEl.paused);
}

/** Stop ringback + incoming ring + status clips + pending auto-stop timer. */
export function stopAllCallSounds(): void {
  clearStatusTimer();
  pauseAndReset(ringbackEl);
  stopIncomingRing();
  pauseAndReset(busyEl);
  pauseAndReset(congestionEl);
  pauseAndReset(disconnectEl);
}

/**
 * Inbound: looping ring while the incoming-call modal is shown.
 * Tries incoming-ring.wav, then ringback.wav, then a built-in two-tone pattern.
 */
export function playIncomingRing(): void {
  stopRingback();
  incomingRingGeneration += 1;
  const gen = incomingRingGeneration;
  inboundRingSessionActive = true;
  pauseAndReset(incomingRingEl);
  stopSyntheticIncomingRing();

  void (async () => {
    const incoming = getIncomingRing();
    incoming.volume = 0.65;
    if (gen !== incomingRingGeneration) return;
    if (await tryPlayLooping(incoming)) return;

    const fallback = getRingback();
    fallback.volume = 0.65;
    if (gen !== incomingRingGeneration) return;
    if (await tryPlayLooping(fallback)) return;

    if (gen !== incomingRingGeneration) return;
    startSyntheticIncomingRing();
  })();
}

/**
 * Outbound: play looping ringback while remote is ringing.
 * Safe if file missing (play() rejects — ignored).
 */
export function playRingback(): void {
  stopIncomingRing();
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
  stopIncomingRing();
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
