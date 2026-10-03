// Getting sound out of phones, iPhones above all.
//
// * A page may only start audio inside the tap itself. The audio engine is
//   therefore made the moment Start is pressed, before anything loads.
// * iPhones treat web audio like a ringtone: the silent switch mutes it. A
//   page can say it is a media player instead (navigator.audioSession, in
//   recent iOS); on older iPhones a looping, silent <audio> element does the
//   same, because media playback ignores the switch.
// * A call, the lock screen or another app suspends the audio ("interrupted").
//   The next tap anywhere brings it back, and a "Tap for sound" button shows
//   while it is stuck.

import { state, $ } from '../state.js';
import { AC, initAudio, resetGrid } from './engine.js';

const iOS = /iP(hone|od|ad)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS says it is a Mac
let media = null;

/** A tenth of a second of silence, as a WAV file. */
function silence() {
  const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Call inside a tap: makes the audio engine if there is none, asks for media
 *  playback rather than ringer sound, and wakes the engine up. */
export function unlockAudio() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
  } catch { /* not every browser lets it be set */ }
  initAudio();
  if (iOS && !navigator.audioSession) {
    if (!media) {
      media = new Audio(silence());
      media.loop = true;
      media.setAttribute('playsinline', '');
    }
    media.play().catch(() => {});
  }
  if (AC.state !== 'running') {
    AC.resume().then(resetGrid, () => {});
    // iOS also wants something actually played inside the tap.
    try {
      const src = AC.createBufferSource();
      src.buffer = AC.createBuffer(1, 1, 22050);
      src.connect(AC.destination);
      src.start(0);
    } catch {}
  }
}

/** Keep the sound alive for as long as the page is open. */
export function watchAudio() {
  const btn = $('tapsound');
  let timer = null;
  const wanted = () => state.browserSound && !state.muted;
  const check = () => {
    clearTimeout(timer);
    // A moment's grace: resuming is not instant, and a flash of the button is noise.
    timer = setTimeout(() => { btn.hidden = !AC || AC.state === 'running' || !wanted() || document.hidden; }, 900);
  };
  const wake = () => { if (AC && AC.state !== 'running') unlockAudio(); check(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wake, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && AC && AC.state !== 'running') AC.resume().then(resetGrid, () => {});
    check();
  });
  if (AC) AC.onstatechange = check;
  btn.onclick = () => { unlockAudio(); check(); };
  setInterval(check, 3000);
  check();
}
