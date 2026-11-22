"use client";

// One AudioContext per page, shared by the ambience and the bubble one-shots.
// Browsers keep it suspended until a gesture: call unlockAudio() once on mount
// and any later tap, click or key press starts it.

let ctx: AudioContext | null = null;
const loading = new Map<string, Promise<AudioBuffer>>();
/** One-shots past this many at once are dropped, so a burst of collisions stays legible. */
const MAX_VOICES = 6;
let voices = 0;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  // iOS 17+: play through the ringer switch, like media, instead of being muted by it.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";
  const resume = () => {
    const c = audioContext();
    if (c.state === "suspended") void c.resume();
  };
  for (const type of ["pointerdown", "touchend", "keydown"]) window.addEventListener(type, resume);
}

export function loadSound(url: string): Promise<AudioBuffer> {
  let buffer = loading.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((response) => response.arrayBuffer())
      .then((data) => audioContext().decodeAudioData(data));
    buffer.catch(() => loading.delete(url));
    loading.set(url, buffer);
  }
  return buffer;
}

/** Fire and forget. rate also shifts pitch (2 = an octave up); pan is -1 … 1. */
export function playSound(buffer: AudioBuffer, { rate = 1, gain = 1, pan = 0 } = {}) {
  const c = audioContext();
  if (c.state !== "running" || voices >= MAX_VOICES) return;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const level = c.createGain();
  level.gain.value = gain;
  const panner = c.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(level).connect(panner).connect(c.destination);
  voices++;
  source.onended = () => {
    voices--;
    source.disconnect();
    panner.disconnect();
  };
  source.start();
}
