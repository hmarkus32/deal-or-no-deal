'use strict';

// Each voice is [delay, pitch, end pitch, attack, duration, peak, waveform].
// Keep the fundamental or its harmony in the range of a small speaker.
function DONDSound(isMuted, createContext = () => new (window.AudioContext || window.webkitAudioContext)()) {
  const cues = {
    deal: [
      [0, 196, 147, .028, .42, .13, 'triangle'],
      [.035, 392, 392, .035, .64, .10],
      [.095, 494, 494, .04, .72, .085],
      [.16, 587, 587, .045, .8, .08],
      [.25, 784, 784, .05, .88, .065]
    ],
    'no-deal': [
      [0, 185, 98, .045, .95, .16, 'triangle'],
      [.04, 277, 147, .07, .84, .11],
      [.12, 370, 196, .085, .70, .055]
    ],
    low: [[0, 660, 660, .025, .48, .10], [.085, 990, 990, .03, .59, .065]],
    high: [[0, 294, 165, .055, .67, .12, 'triangle'], [.04, 220, 124, .06, .72, .085]],
    ring: [
      [0, 440, 440, .035, .31, .09], [0, 554, 554, .04, .32, .06],
      [.42, 440, 440, .035, .34, .09], [.42, 554, 554, .04, .35, .06]
    ]
  };
  let context;
  const voices = new Set();

  function unlock() {
    try {
      if (isMuted()) return;
      if (!context || context.state === 'closed') context = createContext();
      if (context.state !== 'running') context.resume().catch(() => {});
    } catch { /* Audio is optional, including on the first user gesture. */ }
  }

  function release(voice) {
    voices.delete(voice);
    for (const node of [voice.osc, voice.envelope, voice.output]) {
      try { node?.disconnect(); } catch { /* Already disconnected. */ }
    }
  }

  function play(kind) {
    try {
      if (isMuted() || context?.state !== 'running') return;
      const start = context.currentTime + .02;
      for (const [delay, pitch, endPitch, attack, duration, peak, waveform = 'sine'] of cues[kind]) {
        const voice = {kind};
        try {
          const osc = voice.osc = context.createOscillator();
          const envelope = voice.envelope = context.createGain();
          // Independent output gain allows a short mute fade even during a scheduled attack.
          const output = voice.output = context.createGain();
          const at = Math.max(start + delay, context.currentTime + .005);
          const end = at + duration;
          osc.type = waveform;
          osc.frequency.setValueAtTime(pitch, at);
          osc.frequency.linearRampToValueAtTime(endPitch, end);
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(peak, at + attack);
          envelope.gain.exponentialRampToValueAtTime(.0001, end - .015);
          envelope.gain.linearRampToValueAtTime(0, end);
          osc.connect(envelope).connect(output).connect(context.destination);
          voices.add(voice);
          osc.onended = () => release(voice);
          osc.start(at);
          osc.stop(Math.max(end, context.currentTime) + .01);
        } catch {
          try { voice.osc?.stop(); } catch { /* May never have started. */ }
          release(voice);
          return;
        }
      }
    } catch { /* A suspended or interrupted audio device must never interrupt play. */ }
  }

  function silence(kind) {
    for (const voice of voices) {
      if (kind && voice.kind !== kind) continue;
      try {
        const now = context.currentTime;
        voice.output.gain.setValueAtTime(1, now);
        voice.output.gain.linearRampToValueAtTime(0, now + .02);
        voice.osc.stop(Math.max(now + .025, context.currentTime + .005));
        voices.delete(voice); // onended disconnects after the fade.
      } catch {
        release(voice);
      }
    }
  }
  return {unlock, play, silence};
}

if (typeof module !== 'undefined') module.exports = DONDSound;
