/*
 * Parrot Pal sound effects, synthesized with the Web Audio API so there are
 * no audio files to load. Browsers only allow sound after the player has
 * interacted with the page, so nothing plays until the first click or key.
 */
(function (root) {
  'use strict';

  const PREF_KEY = 'parrot-pal-sound';
  let ctx = null;
  let unlocked = false;
  let enabled = true;
  try { enabled = root.localStorage.getItem(PREF_KEY) !== 'off'; } catch (e) { /* storage blocked */ }

  function audio() {
    if (!ctx) {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(from, to, start, dur, type, gain) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain || 0.07, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    chirp() { tone(1900, 2900, 0, 0.09); tone(2100, 3300, 0.12, 0.08); },
    eat() { [0, 0.11, 0.22].forEach((t) => tone(420, 300, t, 0.05, 'triangle', 0.06)); },
    fail() { tone(900, 480, 0, 0.2, 'triangle', 0.05); },
    sleep() { tone(700, 380, 0, 0.4, 'sine', 0.05); },
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, i * 0.1, 0.18, 'triangle', 0.07)); },
    whistle() { [1568, 1976, 2349, 1976, 2637].forEach((f, i) => tone(f, f * 1.02, i * 0.16, 0.14, 'sine', 0.05)); },
    music() { [392, 494, 587, 494, 659, 587].forEach((f, i) => tone(f, f, i * 0.14, 0.12, 'square', 0.025)); },
  };

  function unlock() {
    unlocked = true;
    if (enabled) audio();
    root.removeEventListener('pointerdown', unlock);
    root.removeEventListener('keydown', unlock);
  }
  root.addEventListener('pointerdown', unlock);
  root.addEventListener('keydown', unlock);

  root.ParrotSound = {
    play(name) {
      if (!enabled || !unlocked || !SOUNDS[name]) return;
      try { SOUNDS[name](); } catch (e) { /* audio unavailable */ }
    },
    isEnabled: () => enabled,
    setEnabled(value) {
      enabled = !!value;
      try { root.localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    },
  };
})(window);
