import { settings } from './store.js';

export const supported = 'speechSynthesis' in window;

export function speak(text, force = false) {
  if (!supported || (!force && !settings().speech)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

export function stop() {
  if (supported) try { speechSynthesis.cancel(); } catch { /* ignore */ }
}
