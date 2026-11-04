// Rewards: XP + levels, combo, lucky words, badges, streak freeze, daily-goal celebration, mystery chest, confetti, sounds.
// Everything persists in the existing 'meta' store (key 'rewards'), so there is no database change.
import * as db from './db.js';
import * as store from './store.js';
import { h } from './ui.js';
import { bi } from './bicons.js';
export { bi };

const KEY = 'rewards';
const XP_CORRECT = 10;
const LUCKY_CHANCE = 0.12;
const MAX_FREEZES = 3;
export const LEVELS = [['Beginner', 0], ['Learner', 100], ['Explorer', 300], ['Scholar', 700], ['Expert', 1400], ['Master', 2500]];
export const BADGES = [
  { id: 'first10', icon: 'rocket', name: 'First 10 words', hint: 'Practise 10 words' },
  { id: 'streak7', icon: 'fire', name: '7-day streak', hint: 'Study 7 days in a row' },
  { id: 'quiz100', icon: 'perfect', name: '100% quiz', hint: 'Finish a quiz with no mistakes' }
];

const rw = { xp: 0, badges: {}, freezes: 1, frozen: [], freezeAt: 0, chest: { date: '', state: 'locked' }, best: 0, goalDay: '', reels: { date: '', ids: [] } };
let notice = '';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const today = () => store.dayKey();
const save = () => db.put('meta', { key: KEY, value: rw }).catch(() => {});
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/* ---------- init ---------- */
export async function init() {
  try {
    const r = await db.get('meta', KEY);
    if (r && r.value) Object.assign(rw, r.value, { chest: { ...rw.chest, ...(r.value.chest || {}) }, reels: { ...rw.reels, ...(r.value.reels || {}) } });
  } catch { /* storage unavailable: rewards just won't persist */ }
  autoFreeze();
  streakRewards();
  let lastKey = today(), lastRev = store.today().reviewed;
  store.subscribe(() => {                                    // daily goal celebration: fires once, the moment the ring fills
    const k = today(), r = store.today().reviewed;
    if (k === lastKey && r > lastRev && r >= store.settings().goal && rw.goalDay !== k) {
      rw.goalDay = k; save();
      banner('goal', 'Daily goal reached!', `${r} words today`, 3400);
      sound('goal'); confetti(130);
    }
    lastKey = k; lastRev = r;
  });
}

/* ---------- XP + levels ---------- */
export const xp = () => rw.xp;
export function level(x = rw.xp) {
  let i = 0;
  LEVELS.forEach(([, base], j) => { if (x >= base) i = j; });
  const base = LEVELS[i][1], next = LEVELS[i + 1] ? LEVELS[i + 1][1] : null;
  return { i, name: LEVELS[i][0], base, next, pct: next == null ? 1 : (x - base) / (next - base), max: next == null };
}
const chips = new Set();
export function xpChip() { const el = h('span', { class: 'rw-xpchip' }, `${rw.xp} XP`); chips.add(el); return el; }
function addXp(n) {
  const before = level().i;
  rw.xp += n; save();
  chips.forEach(el => { if (el.isConnected) el.textContent = `${rw.xp} XP`; else chips.delete(el); });
  const after = level();
  if (after.i > before) { banner('up', 'Level up!', `You are now ${after.name}`, 3200); sound('level'); confetti(110); }
}
export function xpCard() {
  const l = level();
  return h('section', { class: 'card rw-xp' },
    h('div', { class: 'row-between' },
      h('strong', null, `Lv ${l.i + 1} · ${l.name}`),
      h('span', { class: 'muted' }, l.max ? `${rw.xp} XP · max level` : `${rw.xp} / ${l.next} XP`)),
    h('div', { class: 'rw-bar' }, h('i', { style: `width:${Math.round(l.pct * 100)}%` })));
}

/* ---------- streak (with freeze) ---------- */
export const freezes = () => rw.freezes;
export function streak() {                                   // like store.streak(), but a frozen day does not break the chain
  const d = new Date(), fz = new Set(rw.frozen);
  if (!(store.dayCount(store.dayKey(d)) > 0)) d.setDate(d.getDate() - 1);
  let n = 0;
  for (;;) {
    const k = store.dayKey(d);
    if (store.dayCount(k) > 0) n++;
    else if (!fz.has(k)) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function autoFreeze() {                                      // missed yesterday but had a streak -> spend a freeze to keep it
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yk = store.dayKey(y);
  if (rw.freezes < 1 || store.dayCount(yk) > 0 || rw.frozen.includes(yk)) return;
  const b = new Date(y); b.setDate(b.getDate() - 1);
  const bk = store.dayKey(b);
  if (store.dayCount(bk) > 0 || rw.frozen.includes(bk)) {
    rw.freezes--; rw.frozen = [...rw.frozen, yk].slice(-40); save();
    notice = 'Streak freeze saved your streak';
  }
}
function streakRewards() {                                   // +1 freeze for every 7 days of streak
  const s = streak(), step = Math.floor(s / 7) * 7;
  if (step > rw.freezeAt) {
    rw.freezeAt = step;
    if (rw.freezes < MAX_FREEZES) { rw.freezes++; banner('snow', 'Streak freeze earned', 'It protects one missed day'); }
    save();
  } else if (step < rw.freezeAt) { rw.freezeAt = step; save(); }
}
export function takeNotice() { const n = notice; notice = ''; return n; }

/* ---------- badges ---------- */
function earn(id) {
  const b = BADGES.find(x => x.id === id);
  rw.badges[id] = Date.now(); save();
  banner(b.icon, 'Badge unlocked', b.name, 3200); sound('level'); confetti(70);
}
function checkBadges(ctx = {}) {
  const t = store.totals();
  if (!rw.badges.first10 && t.total - t.new >= 10) earn('first10');
  if (!rw.badges.streak7 && streak() >= 7) earn('streak7');
  if (!rw.badges.quiz100 && ctx.quiz100) earn('quiz100');
}
export function badgesShelf() {
  return h('section', { class: 'card' }, h('strong', null, 'Badges'),
    h('div', { class: 'rw-badges' }, BADGES.map(b => h('div', { class: 'rw-badge' + (rw.badges[b.id] ? ' on' : '') },
      h('span', { class: 'rw-badge-ico' }, bi(b.icon, 30)), h('strong', null, b.name),
      h('small', { class: 'muted' }, rw.badges[b.id] ? 'Unlocked' : b.hint)))));
}

/* ---------- study / blitz session: combo, lucky word, feedback ---------- */
let combo = 0, lucky = false;
const comboEl = () => document.getElementById('rw-combo') || document.body.appendChild(h('div', { id: 'rw-combo' }));
const luckyEl = () => document.getElementById('rw-lucky') || document.body.appendChild(h('div', { id: 'rw-lucky' }, bi('clover', 16), ' Lucky word: 2x XP!'));
export function beginSession() { combo = 0; lucky = false; paintCombo(); luckyEl().classList.remove('show'); }
export function endSession() { combo = 0; lucky = false; paintCombo(); document.getElementById('rw-lucky')?.classList.remove('show'); }
export function beginWord(first = true) {                    // random bonus: sometimes a word is worth double
  lucky = !!first && Math.random() < LUCKY_CHANCE;
  const el = luckyEl();
  el.classList.toggle('show', lucky);
  if (lucky) { sound('lucky'); vibrate([20, 30, 20]); }
}
function paintCombo(pop) {
  const el = comboEl();
  el.classList.toggle('show', combo >= 3);
  if (combo >= 3) {
    el.replaceChildren(bi('fire', 20), ` x${combo}`);
    if (pop && !reduce()) el.animate([{ transform: 'translateX(-50%) scale(1.45)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 260, easing: 'ease-out' });
  }
}
export function answered(correct, anchor) {                  // call once per first attempt, after store.record()
  const gain = lucky ? XP_CORRECT * 2 : XP_CORRECT;
  luckyEl().classList.remove('show');
  if (correct) {
    combo++;
    addXp(gain);
    float(lucky ? [`+${gain} XP `, bi('clover', 22)] : `+${gain} XP`, anchor);
    sound('ok'); vibrate(25); flash(true, anchor);
    paintCombo(true);
    if (combo >= 5 && combo % 5 === 0) { sound('combo'); confetti(30); }
  } else {
    combo = 0; paintCombo();
    sound('bad'); vibrate([70, 40, 70]); flash(false, anchor);
  }
  lucky = false;
  streakRewards(); checkBadges();
}
function flash(ok, anchor) {                                 // green pulse / shake, via Web Animations so nothing else is disturbed
  if (reduce()) return;
  const rgb = ok ? '34,197,94' : '239,68,68';
  let f = document.getElementById('rw-flash');
  if (!f) f = document.body.appendChild(h('div', { id: 'rw-flash' }));
  f.animate([{ boxShadow: `inset 0 0 0 0 rgba(${rgb},0)` }, { boxShadow: `inset 0 0 80px 14px rgba(${rgb},.55)` }, { boxShadow: `inset 0 0 0 0 rgba(${rgb},0)` }], { duration: 520, easing: 'ease-out' });
  if (anchor && anchor.isConnected) {
    if (ok) anchor.animate([{ transform: 'scale(1)', boxShadow: `0 0 0 0 rgba(${rgb},.6)` }, { transform: 'scale(1.05)', boxShadow: `0 0 0 14px rgba(${rgb},0)` }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
  }
  if (!ok) {
    const box = document.querySelector('.study-body, .bz-body') || anchor;
    if (box && box.animate) box.animate([0, -12, 12, -9, 9, -4, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 420, easing: 'ease-in-out' });
  }
}

/* ---------- finishing a study session ---------- */
export function starsEl(acc) {
  const n = acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
  return h('div', { class: 'rw-stars', 'aria-label': `${n} of 3 stars` }, [1, 2, 3].map(i =>
    h('span', { class: 'rw-star' + (i <= n ? ' on' : ''), style: `animation-delay:${0.25 + i * 0.28}s` }, bi('star', 54))));
}
export function completeSession({ acc, total, mode, clean = true }) {
  const n = acc >= 90 ? 3 : acc >= 70 ? 2 : 1;
  confetti(40 + n * 40);
  [1, 2, 3].slice(0, n).forEach(i => setTimeout(() => sound('star'), 250 + i * 280));
  checkBadges({ quiz100: clean && mode === 'quiz' && acc === 100 && total >= 5 });
  sessionDone();
}

/* ---------- daily mystery chest ---------- */
export const chestState = () => (rw.chest.date === today() ? rw.chest.state : 'locked');
const chestChanged = () => window.dispatchEvent(new Event('rw-chest'));
export function sessionDone() {                              // first finished session of the day unlocks the chest
  if (chestState() !== 'locked') return;
  rw.chest = { date: today(), state: 'ready' }; save(); chestChanged();
  setTimeout(openChest, 900);
}
export function openChest() {
  if (chestState() !== 'ready' || document.querySelector('.rw-modal')) return;
  const ico = h('div', { class: 'rw-chest-ico' }, bi('gift', 92));
  const title = h('h2', null, 'Daily mystery chest');
  const sub = h('p', { class: 'muted' }, 'Tap the chest to open it');
  const done = h('button', { class: 'btn primary wide', hidden: true }, 'Nice!');
  const later = h('button', { class: 'btn ghost wide' }, 'Later');
  const ov = h('div', { class: 'rw-modal' }, h('div', { class: 'rw-modal-box' }, h('button', { class: 'rw-chest-btn', 'aria-label': 'Open chest' }, ico), title, sub, done, later));
  const close = () => ov.remove();
  later.onclick = close; done.onclick = close;
  let opened = false;
  ov.querySelector('.rw-chest-btn').onclick = () => {
    if (opened) return;
    opened = true;
    rw.chest = { date: today(), state: 'opened' };
    const r = Math.random();
    let text;
    if (r < 0.7) { const g = rand(20, 50); addXp(g); text = `+${g} XP`; }
    else if (r < 0.93 || rw.freezes >= MAX_FREEZES) { const g = r < 0.93 ? rand(60, 100) : 100; addXp(g); text = `+${g} XP · jackpot!`; }
    else { rw.freezes++; text = '+1 streak freeze'; }
    save(); chestChanged();
    sound('chest'); vibrate([30, 40, 60]);
    if (!reduce()) ico.animate([0, -14, 14, -10, 10, -5, 0].map(x => ({ transform: `rotate(${x}deg)` })), { duration: 600 });
    setTimeout(() => {
      ico.replaceChildren(bi('stars', 92)); title.textContent = text; sub.textContent = 'Come back tomorrow for another';
      later.hidden = true; done.hidden = false; confetti(140);
    }, reduce() ? 0 : 600);
  };
  document.body.append(ov);
}
export function chestCard(tile = false) {
  const el = h('button', { class: 'card action rw-chest', type: 'button' });
  const paint = () => {
    const s = chestState();
    el.className = (tile ? 'card tile' : 'card action') + ' rw-chest' + (s === 'ready' ? ' hot' : '');
    if (tile) return el.replaceChildren(
      h('div', { class: 'action-ico' }, bi(s === 'opened' ? 'check' : s === 'ready' ? 'gift' : 'lock', 24)),
      h('div', { class: 'action-title' }, 'Chest'),
      h('div', { class: 'muted' }, s === 'ready' ? 'Open it!' : s === 'opened' ? 'Opened' : 'Locked'));
    el.replaceChildren(
      h('div', { class: 'action-ico' }, bi(s === 'opened' ? 'check' : s === 'ready' ? 'gift' : 'lock', 26)),
      h('div', { class: 'grow' },
        h('div', { class: 'action-title' }, s === 'ready' ? 'Open your chest' : 'Mystery chest'),
        h('div', { class: 'muted' }, s === 'ready' ? 'Tap to open' : s === 'opened' ? 'Opened today' : 'Opens after your first session')));
  };
  el.onclick = () => { if (chestState() === 'ready') openChest(); };
  const on = () => { if (!el.isConnected) return window.removeEventListener('rw-chest', on); paint(); };
  window.addEventListener('rw-chest', on);
  paint();
  return el;
}

/* ---------- reels: live "words learned today" ---------- */
export function reelsToday() { return rw.reels.date === today() ? rw.reels.ids.length : 0; }
export function reelSeen(id) {
  if (rw.reels.date !== today()) rw.reels = { date: today(), ids: [] };
  const isNew = !rw.reels.ids.includes(id);
  if (isNew) { rw.reels.ids.push(id); addXp(2); save(); checkBadges(); }
  return { count: rw.reels.ids.length, isNew };
}

/* ---------- timed challenge high score ---------- */
export const best = () => rw.best;
export function setBest(n) { if (n > rw.best) { rw.best = n; save(); return true; } return false; }

/* ---------- visual + audio helpers ---------- */
export function float(text, anchor, cls = '') {
  const el = h('div', { class: 'rw-float ' + cls }, text);
  let x = innerWidth / 2, y = innerHeight * 0.38;
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    if (r.width || r.height) { x = r.left + r.width / 2; y = r.top + r.height / 2 - 10; }
  }
  el.style.left = Math.max(50, Math.min(innerWidth - 50, x)) + 'px';
  el.style.top = y + 'px';
  document.body.append(el);
  setTimeout(() => el.remove(), 1200);
}

const bq = [];
let bShowing = false;
export function banner(ico, title, sub, ms = 2800) { bq.push({ ico, title, sub, ms }); if (!bShowing) nextBanner(); }
function nextBanner() {
  const b = bq.shift();
  if (!b) { bShowing = false; return; }
  bShowing = true;
  const el = h('div', { class: 'rw-banner', role: 'status' }, h('span', { class: 'rw-banner-ico rw-ic-' + b.ico }, bi(b.ico, 30)), h('div', null, h('strong', null, b.title), b.sub ? h('small', null, b.sub) : null));
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.remove(); nextBanner(); }, 300); }, b.ms);
}

let parts = [], raf = 0, cv = null;
const COLORS = ['#3b5bfd', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];
export function confetti(n = 90) {
  if (reduce()) return;
  if (!cv) cv = document.body.appendChild(h('canvas', { id: 'rw-confetti' }));
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  for (let i = 0; i < n; i++) {
    parts.push({ x: W / 2 + rand(-60, 60), y: H * 0.4, vx: (Math.random() - 0.5) * 14, vy: -rand(5, 15), s: rand(6, 11), c: COLORS[rand(0, COLORS.length - 1)], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
  }
  if (raf) return;
  const ctx = cv.getContext('2d');
  const step = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    parts = parts.filter(p => p.y < H + 30);
    for (const p of parts) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(step);
    else { raf = 0; ctx.clearRect(0, 0, W, H); }
  };
  raf = requestAnimationFrame(step);
}

let ac = null;
function tone(f, t0, dur, type = 'sine', vol = 0.16) {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  ok: () => { tone(660, 0, 0.1); tone(880, 0.09, 0.16); },
  bad: () => { tone(200, 0, 0.18, 'sawtooth', 0.1); tone(140, 0.14, 0.22, 'sawtooth', 0.1); },
  combo: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.14)),
  level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.2)),
  goal: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.1, 0.22)),
  lucky: () => { tone(988, 0, 0.1); tone(1319, 0.1, 0.18); },
  star: () => { tone(1175, 0, 0.12); tone(1568, 0.08, 0.2); },
  chest: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.2)),
  tick: () => tone(880, 0, 0.06, 'square', 0.07),
  end: () => { tone(784, 0, 0.14); tone(659, 0.14, 0.14); tone(523, 0.28, 0.3); }
};
export function sound(name) {                                // respects the Audio switch in Progress → Settings
  if (!store.settings().speech) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    SFX[name] && SFX[name]();
  } catch { /* audio unavailable */ }
}
export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch { /* unsupported */ } }
