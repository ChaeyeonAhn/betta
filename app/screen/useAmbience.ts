"use client";

import { useEffect, useRef } from "react";
import { audioContext, loadSound, unlockAudio } from "@/app/_components/sound";

// 09-glass-tank: a 90s seamless loop rendered offline with Tone.js.
const SRC = "/audio/ambient/09-glass-tank.mp3";
const LOOP_SECONDS = 90;
const VOLUME = 0.6;
const FADE_IN_S = 4;
/** Matches the grid fading out over the open tank. */
const FADE_OUT_S = 2.2;

/**
 * Loops the ambience while `playing`, fading in and out.
 *
 * Plays through Web Audio, not <audio loop>, so the loop has no gap. An MP3 may
 * still carry the encoder's leading silence after decoding, so the loop starts at
 * the first audible sample and runs exactly LOOP_SECONDS from there.
 *
 * Browsers keep audio suspended until a gesture; the operator's first key press
 * (Space / → to advance the stage) or click starts it.
 */
export function useAmbience(playing: boolean) {
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    unlockAudio();
    const ctx = audioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    let cancelled = false;
    let source: AudioBufferSourceNode | null = null;
    loadSound(SRC)
      .then((buffer) => {
        if (cancelled) return;
        const samples = buffer.getChannelData(0);
        const scan = Math.min(samples.length, Math.round(buffer.sampleRate * 0.2));
        let first = 0;
        while (first < scan && Math.abs(samples[first]) < 1e-3) first++;
        if (first === scan) first = 0;
        const loopStart = first / buffer.sampleRate;

        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.loopStart = loopStart;
        source.loopEnd = Math.min(buffer.duration, loopStart + LOOP_SECONDS);
        source.connect(gain);
        source.start(0, loopStart);
      })
      .catch((error) => console.warn("[betta] ambience failed to load", error));

    return () => {
      cancelled = true;
      gainRef.current = null;
      source?.stop();
      gain.disconnect();
    };
  }, []);

  useEffect(() => {
    const gain = gainRef.current;
    if (!gain) return;
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(playing ? VOLUME : 0, now + (playing ? FADE_IN_S : FADE_OUT_S));
  }, [playing]);
}
