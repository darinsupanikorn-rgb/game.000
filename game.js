'use strict';
/* ================= PIXEL QUEST — platformer 3 ด่าน + บอส =================
   เล่นได้ทั้งคีย์บอร์ดและจอย (Gamepad API + สั่น) */

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = 480, H = 270, T = 16, HUDH = 26, ROWS = 15;
const GRAV = 0.35, MOVE = 1.9, JUMPV = 7.8;

/* ---------------- เสียง (WebAudio, ไม่ใช้ไฟล์) ---------------- */
let AC = null, muted = false;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type, slideTo, vol) {
  if (muted) return;
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, ac.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + d);
  g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + d);
}
function sfx(n) {
  switch (n) {
    case 'jump': tone(280, 0.14, 'square', 620); break;
    case 'coin': tone(990, 0.08, 'square'); setTimeout(() => tone(1320, 0.18, 'square'), 70); break;
    case 'stomp': tone(420, 0.12, 'square', 90); break;
    case 'bump': tone(140, 0.09, 'square'); break;
    case 'brick': tone(300, 0.15, 'sawtooth', 80); break;
    case 'sprout': tone(200, 0.3, 'sine', 800); break;
    case 'power': tone(523, 0.1, 'square'); setTimeout(() => tone(659, 0.1, 'square'), 90); setTimeout(() => tone(784, 0.2, 'square'), 180); break;
    case 'fire': tone(700, 0.09, 'sawtooth', 250); break;
    case 'hurt': tone(320, 0.3, 'sawtooth', 70); break;
    case 'bosshit': tone(180, 0.2, 'sawtooth', 60); break;
    case 'warn': tone(880, 0.12, 'square'); setTimeout(() => tone(880, 0.12, 'square'), 150); break;
    case 'clear': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square'), i * 120)); break;
    case 'over': [400, 350, 300, 200].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle'), i * 160)); break;
    case 'kick': tone(500, 0.1, 'square', 1000); break;
  }
}

/* ---------------- อินพุต: คีย์บอร์ด + จอย ---------------- */
const keys = {};
const pressed = {}; // edge (กดครั้งเดียว)
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  audio();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('pointerdown', () => { pressed.Click = true; audio(); });

let padOn = false, padPrev = [];
window.addEventListener('gamepadconnected', () => { padOn = true; });
window.addEventListener('gamepaddisconnected', () => { padOn = false; padPrev = []; });
function getPad() {
  const ps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of ps) if (p && p.connected) return p;
  return null;
}
function padBtn(p, i) { return !!(p.buttons[i] && p.buttons[i].pressed); }
function padEdge(p, i) { return padBtn(p, i) && !padPrev[i]; }
function rumble(ms, strong) {
  try {
    const p = getPad();
    if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
      p.vibrationActuator.playEffect('dual-rumble', {
        duration: ms || 120, strongMagnitude: strong || 0.7, weakMagnitude: 0.4
      });
    }
  } catch (e) { /* จอยไม่รองรับสั่นก็ข้าม */ }
}
function readInput() {
  const p = getPad();
  const dz = v => Math.abs(v) < 0.22 ? 0 : v;
  let ax = 0;
  if (p) {
    ax = dz(p.axes[0] || 0);
    if (padBtn(p, 15)) ax = -1;
    if (padBtn(p, 14)) ax = 1;
    if (padBtn(p, 15)) ax = -1;
  }
  let kb = 0;
  if (keys.ArrowLeft || keys.KeyA) kb = -1;
  if (keys.ArrowRight || keys.KeyD) kb = 1;
  const move = kb !== 0 ? kb : ax;
  const jumpHeld = !!(keys.Space || keys.ArrowUp || keys.KeyW || keys.KeyZ || (p && padBtn(p, 0)));
  const jumpHit = !!(pressed.Space || pressed.ArrowUp || pressed.KeyW || pressed.KeyZ || (p && padEdge(p, 0)));
  const slashHit = !!(pressed.KeyX || pressed.KeyJ || (p && padEdge(p, 2)));
  const shootHit = !!(pressed.KeyC || pressed.KeyK || (p && padEdge(p, 5)) || (p && padEdge(p, 7)));
  const startHit = !!(pressed.Enter || pressed.Click || (p && padEdge(p, 9)));
  const pauseHit = !!((pressed.KeyP || pressed.Escape) || (p && padEdge(p, 9)));
  const muteHit = !!pressed.KeyM;
  const fullHit = !!pressed.KeyF;
  const downHeld = !!(keys.ArrowDown || keys.KeyS || (p && padBtn(p, 13)) || (p && (p.axes[1] || 0) > 0.5));
  const downHit = !!(pressed.ArrowDown || pressed.KeyS || (p && padEdge(p, 13)));
  const enterHit = !!(pressed.KeyE || (p && padEdge(p, 3)));
  if (p) padPrev = p.buttons.map(b => b.pressed);
  for (const k in pressed) pressed[k] = false;
  return { move, analog: Math.min(1, Math.abs(ax)), jumpHeld, jumpHit, slashHit, shootHit, fireHit: slashHit, startHit, pauseHit, muteHit, fullHit, downHeld, downHit, enterHit };
}

/* ---------------- ด่าน ---------------- */
// legend: . ว่าง | # บล็อก | B อิฐ | ? กล่องผักกาด | F กล่องปืน | C กล่องเหรียญ
//         P ท่อ | o เหรียญ | E ศัตรู | G เสาธง | M บอส
const LEVELS = [
  {
    name: 'ด่าน 1 — ทุ่งผักกาด', w: 100, pits: [[30, 32], [65, 68]], boss: true, crabKing: true,
    rects: [[44, 8, 4, 1], [88, 12, 1, 1], [89, 11, 1, 2], [90, 10, 1, 3], [91, 9, 1, 4]],
    place: [[20, 10, '?'], [40, 10, 'B'], [41, 10, '?'], [42, 10, 'B'], [55, 10, 'F'],
            [33, 10, 'C'], [21, 11, 'o'], [22, 11, 'o'], [23, 11, 'o'],
            [29, 9, 'o'], [30, 9, 'o'], [31, 9, 'o'], [32, 9, 'o'], [33, 9, 'o'],
            [56, 9, 'o'], [57, 9, 'o'],
            [78, 11, 'P'], [79, 11, 'P'], [78, 12, 'P'], [79, 12, 'P'],
            [35, 12, 'E'], [50, 12, 'E'], [60, 12, 'E'], [62, 12, 'E'], [75, 12, 'E'], [80, 12, 'M'], [95, 12, 'G']]
  },
  {
    name: 'หมู่บ้านทุ่งทอง — แวะพัก', w: 70, pits: [], town: true,
    rects: [[30, 10, 6, 1], [10, 8, 5, 1], [48, 8, 5, 1]],
    place: [[15, 11, 'o'], [16, 11, 'o'], [11, 7, 'o'], [12, 7, 'o'], [13, 7, 'o'],
            [31, 9, 'o'], [32, 9, 'o'], [33, 9, 'o'], [49, 7, 'o'], [50, 7, 'o'], [51, 7, 'o'],
            [25, 10, '?'], [55, 11, 'o'], [56, 11, 'o'], [64, 12, 'G']],
    npcs: []
  },
  {
    name: 'ด่าน 2 — ปราสาทโบราณ', w: 120, pits: [[25, 28], [60, 63], [95, 98]], boss: true, crabKing: true,
    rects: [[36, 9, 6, 1], [70, 8, 5, 1], [108, 10, 4, 1]],
    place: [[15, 10, '?'], [38, 5, 'C'], [50, 10, 'B'], [51, 10, '?'], [52, 10, 'B'],
            [75, 10, 'F'], [100, 10, 'B'], [101, 10, '?'], [102, 10, 'B'],
            [37, 6, 'o'], [39, 6, 'o'], [71, 5, 'o'], [72, 5, 'o'], [73, 5, 'o'],
            [66, 11, 'P'], [67, 11, 'P'], [66, 12, 'P'], [67, 12, 'P'],
            [20, 12, 'E'], [30, 12, 'E'], [45, 12, 'E'], [55, 12, 'E'], [58, 12, 'E'],
            [80, 12, 'E'], [90, 12, 'E'], [103, 12, 'M'], [110, 12, 'E'], [112, 12, 'E'], [115, 12, 'G']]
  },
  {
    name: 'หมู่บ้านริมวัด — ก่อนรบ', w: 70, pits: [], town: true,
    rects: [[28, 10, 6, 1], [8, 8, 5, 1], [48, 8, 5, 1]],
    place: [[14, 11, 'o'], [15, 11, 'o'], [9, 7, 'o'], [10, 7, 'o'], [11, 7, 'o'],
            [29, 9, 'o'], [30, 9, 'o'], [31, 9, 'o'], [49, 7, 'o'], [50, 7, 'o'],
            [24, 10, 'C'], [55, 11, 'o'], [56, 11, 'o'], [64, 12, 'G']],
    npcs: []
  },
  {
    name: 'ด่าน 3 — รังควายยักษ์', w: 40, pits: [], boss: true,
    rects: [[0, 0, 1, 15], [39, 8, 1, 7], [15, 8, 8, 1]],
    place: [[10, 9, 'o'], [11, 9, 'o'], [12, 9, 'o'], [13, 9, 'o'], [14, 9, 'o'],
            [25, 12, 'M'], [36, 12, 'G']]
  }
];

function buildRows(def) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) rows.push(new Array(def.w).fill('.'));
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < def.w && y < ROWS) rows[y][x] = ch; };
  for (let x = 0; x < def.w; x++) {
    const pit = def.pits.some(([a, b]) => x >= a && x <= b);
    if (!pit) { rows[13][x] = '#'; rows[14][x] = '#'; }
  }
  (def.rects || []).forEach(([x, y, w, h, ch]) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) set(x + i, y + j, ch || '#');
  });
  (def.place || []).forEach(([x, y, ch]) => set(x, y, ch));
  return rows;
}
const SOLID = { '#': 1, B: 1, '?': 1, F: 1, C: 1, U: 1, P: 1 };

/* ---------------- สถานะเกม ---------------- */
let screen = 'title'; // title|intro|play|pause|clear|win|over
let lvl = 0, score = 0, coins = 0, lives = 3;
let rows = [], enemies = [], items = [], shots = [], parts = [], pops = [], bumps = [];
let npcs = [], talkNpc = null, talkT = 0;
let player = null, boss = null, camX = 0, time = 0, introT = 0, msg = '', msgT = 0;
let fireCd = 0, combo = 0, comboT = 0, pipeCd = 0;
let mini = null, pipeUsed = false; // มินิเกมในท่อ (ครั้งเดียวต่อด่าน กันลูป)
let foodG = 100, donateTotal = 0, foodHurtCd = 0, doorCd = 0;
let doors = []; // ประตูตึก {x,y,name,toX,toY,kind,exit}
const unlocked = [true, false, false, false, false];

function loadLevel(i) {
  const def = LEVELS[i];
  rows = buildRows(def);
  enemies = []; items = []; shots = []; parts = []; pops = []; bumps = [];
  npcs = []; talkNpc = null; talkT = 0;
  boss = null; fireCd = 0; combo = 0; comboT = 0; pipeCd = 0; mini = null; pipeUsed = false;
  doors = []; doorCd = 0; foodHurtCd = 0;
  if (def.town) npcs = (def.npcs || []).map(n => ({ x: n.x * T, yT: n.y, li: -1, gave: false, def: n }));
  if (def.doors) doors = def.doors.map(d => ({ x: d.x * T, y: (d.y !== undefined ? d.y : 13) * T, name: d.name, toX: d.toX * T, toY: d.toY * T, kind: d.kind || '', exit: !!d.exit }));
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < def.w; x++) {
    const ch = rows[y][x];
    if (ch === 'E') { rows[y][x] = '.'; enemies.push(mkWalker(x * T, y * T)); }
    if (ch === 'M') { rows[y][x] = '.'; boss = mkBoss(x * T, y * T, def.crabKing ? 'crab' : 'buffalo'); }
  }
  // เหรียญที่ลอยอยู่เก็บออกจาก rows
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < def.w; x++)
    if (rows[y][x] === 'o') rows[y][x] = '.';
  // วางเหรียญลอยเป็น entity
  coinsOnMap(def);
  player = { x: 2 * T, y: 8 * T, w: 12, h: 15, vx: 0, vy: 0, dir: 1, onG: false,
             pow: 2, coyote: 0, buf: 0, ifr: 0, anim: 0, dead: false, swing: 0, swingCd: 0,
             air: 1, slide: 0, slideCd: 0, food: foodG };
  camX = 0;
}
let coinEnts = [];
function coinsOnMap(def) {
  coinEnts = [];
  // เก็บตำแหน่งเหรียญจาก place (เรารู้อยู่แล้วว่า rows ถูกลบ o ออก — เก็บใหม่จาก def)
  (def.place || []).forEach(([x, y, ch]) => {
    if (ch === 'o') coinEnts.push({ x: x * T + 3, y: y * T + 3, t: Math.random() * 60 });
  });
}
function mkWalker(x, y) {
  return { kind: 'c', x, y: y + 4, w: 14, h: 12, vx: -0.5, vy: 0, dir: -1,
           dead: 0, anim: Math.random() * 60, st: 'walk', t: 0, cd: 0, spd: 0.75 + Math.random() * 0.3 };
}
function mkBoss(x, y, kind) {
  if (kind === 'crab') {
    return { kind: 'crab', x: x - 10, y: y - 6, w: 34, h: 22, vx: 0, vy: 0, hp: 3, maxhp: 3,
             st: 'idle', t: 0, ifr: 0, alive: true, dir: -1, homeX: x - 10, homeY: y - 6 };
  }
  return { kind: 'buffalo', x: x - 6, y: y - 14, w: 28, h: 30, vx: 0, vy: 0, hp: 5, maxhp: 5,
           st: 'idle', t: 0, ifr: 0, alive: true, dir: -1, homeX: x - 6, homeY: y - 14 };
}
function tileAt(px, py) {
  const tx = Math.floor(px / T), ty = Math.floor(py / T);
  if (tx < 0 || tx >= rows[0].length) return '#';
  if (ty < 0 || ty >= ROWS) return '.';
  return rows[ty][tx];
}
function solidAt(px, py) { return !!SOLID[tileAt(px, py)]; }
function popup(x, y, text, col) { pops.push({ x, y, text, t: 50, col: col || '#fff' }); }
function burst(x, y, col, n, spd) {
  for (let i = 0; i < (n || 8); i++)
    parts.push({ x, y, vx: (Math.random() - 0.5) * (spd || 3), vy: -Math.random() * 3 - 1,
                 life: 30 + Math.random() * 20, col });
}

/* ---------------- ฟิสิกส์ ---------------- */
function moveBody(b, useGrav) {
  if (useGrav) b.vy = Math.min(b.vy + GRAV, 9);
  b.hitWall = 0; // รีเซ็ตทุกเฟรมกันค่าค้างทำมอน/บอสติด
  // แกน X
  b.x += b.vx;
  if (b.vx > 0) {
    if (solidAt(b.x + b.w, b.y + 1) || solidAt(b.x + b.w, b.y + b.h - 1) || solidAt(b.x + b.w, b.y + b.h / 2)) {
      b.x = Math.floor((b.x + b.w) / T) * T - b.w - 0.01; b.hitWall = 1;
    }
  } else if (b.vx < 0) {
    if (solidAt(b.x, b.y + 1) || solidAt(b.x, b.y + b.h - 1) || solidAt(b.x, b.y + b.h / 2)) {
      b.x = (Math.floor(b.x / T) + 1) * T + 0.01; b.hitWall = -1;
    }
  }
  // แกน Y
  b.y += b.vy; b.onG = false; b.hitHead = null;
  if (b.vy > 0) {
    if (solidAt(b.x + 1, b.y + b.h) || solidAt(b.x + b.w - 1, b.y + b.h)) {
      b.y = Math.floor((b.y + b.h) / T) * T - b.h; b.vy = 0; b.onG = true;
    }
  } else if (b.vy < 0) {
    const tx1 = Math.floor((b.x + 1) / T), tx2 = Math.floor((b.x + b.w - 1) / T);
    const ty = Math.floor(b.y / T);
    if (solidAt(b.x + 1, b.y) || solidAt(b.x + b.w - 1, b.y)) {
      b.y = (ty + 1) * T + 0.01; b.vy = 0;
      b.hitHead = { x: (solidAt(b.x + 1, b.y - 1) ? tx1 : tx2), y: ty };
    }
  }
}
function groundAhead(b) {
  const aheadX = b.dir > 0 ? b.x + b.w + 2 : b.x - 2;
  return solidAt(aheadX, b.y + b.h + 2);
}
function onPipeLater(b) {
  try {
    const tx = Math.floor((b.x + b.w / 2) / T), ty = Math.floor((b.y + b.h + 2) / T);
    return !!(rows[ty] && rows[ty][tx] === 'P');
  } catch (e) { return false; }
}

/* ---------------- บล็อก ---------------- */
function bumpTile(tx, ty) {
  const ch = rows[ty] && rows[ty][tx];
  if (!ch) return;
  bumps.push({ tx, ty, t: 8 });
  if (ch === '?') { rows[ty][tx] = 'U'; sfx('sprout'); items.push({ x: tx * T + 1, y: ty * T - 14, w: 14, h: 14, vx: 0, vy: 0, type: 'shroom', rise: 26 }); }
  else if (ch === 'F') { rows[ty][tx] = 'U'; sfx('sprout'); items.push({ x: tx * T + 1, y: ty * T - 14, w: 14, h: 14, vx: 0, vy: 0, type: 'flower', rise: 26 }); }
  else if (ch === 'C') { rows[ty][tx] = 'U'; coins++; score += 100; sfx('coin'); popup(tx * T + 8, ty * T - 8, '+100', '#ffd34d'); burst(tx * T + 8, ty * T - 6, '#ffd34d', 6, 2); }
  else if (ch === 'B') {
    if (player.pow >= 1) {
      rows[ty][tx] = '.'; score += 50; sfx('brick'); popup(tx * T + 8, ty * T - 8, '+50', '#fff');
      burst(tx * T + 8, ty * T + 8, '#c96b32', 10, 3);
      // ศัตรูที่ยืนบนอิฐก้อนนี้ตายด้วย
      enemies.forEach(e => {
        if (!e.dead && e.x + e.w > tx * T && e.x < tx * T + T && Math.abs((e.y + e.h) - ty * T) < 6) {
          e.dead = -1; score += 200; popup(e.x, e.y - 6, '+200', '#fff'); sfx('kick');
        }
      });
    } else { sfx('bump'); }
  }
  else sfx('bump');
}

/* ---------------- ผู้เล่น ---------------- */
function hurtPlayer(fromX) {
  if (player.ifr > 0 || player.dead) return;
  combo = 0; comboT = 0; // โดนที combo หลุด
  if (player.pow > 0) {
    player.pow--; player.ifr = 60; player.vx = (player.x < fromX ? -3 : 3); player.vy = -4;
    sfx('hurt'); rumble(150, 0.8); burst(player.x + 6, player.y, '#ff5566', 8, 2);
  } else {
    player.dead = true; sfx('hurt'); rumble(300, 1);
  }
}
function killPlayer(fell) {
  if (!fell) { player.vy = -6; }
  lives--; combo = 0; comboT = 0;
  sfx('over');
  setTimeout(() => {}, 0);
  if (lives <= 0) { screen = 'over'; }
  else { loadLevel(lvl); msg = 'เหลือ ' + lives + ' ชีวิต!'; msgT = 120; }
}
function updatePlayer(inp) {
  const p = player;
  // เดิน (อนาล็อกจอยปรับความเร็ว)
  const spd = MOVE * (inp.analog > 0 && inp.move !== 0 && !keys.ArrowLeft && !keys.ArrowRight && !(keys.KeyA || keys.KeyD) ? (0.5 + inp.analog * 0.5) : 1);
  if (inp.move < 0) { p.vx = -spd; p.dir = -1; }
  else if (inp.move > 0) { p.vx = spd; p.dir = 1; }
  else p.vx *= (p.onG ? 0.6 : 0.9);
  // โดด: buffer + coyote + โดด 2 ชั้น + ปล่อยปุ่มโดดเตี้ย
  if (p.onG) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
  if (p.onG) p.air = 1; // รีเซ็ตโดดกลางอากาศเมื่อแตะพื้น
  if (inp.jumpHit) p.buf = 7; else if (p.buf > 0) p.buf--;
  if (p.buf > 0 && (p.onG || p.coyote > 0)) {
    p.vy = -JUMPV; p.onG = false; p.coyote = 0; p.buf = 0; sfx('jump');
    burst(p.x + 6, p.y + p.h, '#aab', 4, 1);
  } else if (inp.jumpHit && !p.onG && p.air > 0 && p.slide <= 0) {
    // โดดคอมโบครั้งที่ 2 กลางอากาศ
    p.air--; p.vy = -JUMPV * 0.85; p.buf = 0; sfx('jump');
    burst(p.x + 6, p.y + p.h, '#7CFCff', 6, 2);
    popup(p.x, p.y - 8, 'โดด 2!', '#7CFCff');
  }
  // สไลด์: กด ↓ + เดินบนพื้น (พุ่งเร็ว+ตัวเตี้ย)
  if (p.slideCd > 0) p.slideCd--;
  if (p.slide > 0) {
    p.slide--;
    p.vx = p.dir * 3.4;
    if (p.slide === 0) { p.h = 15; p.y -= 5; } // ลุก (กันจมพื้น)
    else if (Math.floor(time / 4) % 2 === 0) burst(p.x + 6, p.y + p.h, '#c8c8d8', 1, 1);
  } else if ((inp.downHeld || inp.downHit) && inp.move !== 0 && p.onG && p.slideCd <= 0) {
    // กันชนกับท่อ: ถ้ายืนบนท่อให้ลงท่อแทน ไม่สไลด์
    if (!onPipeLater(p)) {
      p.slide = 18; p.slideCd = 45; p.dir = inp.move > 0 ? 1 : -1;
      p.h = 10; p.y += 5; sfx('kick');
    }
  }
  if (!inp.jumpHeld && p.vy < -2.5) p.vy = -2.5; // ปล่อยปุ่ม = โดดเตี้ย
  moveBody(p, true);
  if (p.hitHead) bumpTile(p.hitHead.x, p.hitHead.y);
  if (p.ifr > 0) p.ifr--;
  if (fireCd > 0) fireCd--;
  if (p.swingCd > 0) p.swingCd--;
  p.anim++;
  // ยิงปืนกูประดิษฐ์ (ปุ่มยิงแยก)
  if (inp.shootHit && p.pow >= 2 && fireCd <= 0 && shots.length < 3) {
    shots.push({ x: p.x + (p.dir > 0 ? p.w : -8), y: p.y + 2, w: 8, h: 8, vx: 4 * p.dir, vy: 1 });
    fireCd = 14; sfx('fire');
  }
  // ฟันดาบปราบควาย (X ฟันเสมอ) — ยกเว้นตอนยืนคุยกับชาวบ้าน
  const nearTalk = LEVELS[lvl].town && npcs.find(n => Math.abs((p.x + p.w / 2) - (n.x + 8)) < 24 && Math.abs((p.y + p.h) - ((n.yT !== undefined ? n.yT * T : 13 * T))) < 44);
  if (inp.slashHit && p.swingCd <= 0 && !nearTalk) {
    p.swing = 16; p.swingCd = 26; sfx('fire');
  }
  if (p.swing > 0) {
    p.swing--;
    const spin = combo >= 5; // ท่าไม้ตาย: ฟันหมุนกว้าง 2 เท่า
    const hw = spin ? 30 : 16;
    const hb = { x: p.dir > 0 ? p.x + p.w - 2 : p.x - hw + 2, y: p.y - 4, w: spin ? 44 : 16, h: 20 };
    if (spin) { p.swing = Math.max(p.swing, 10); burst(p.x + 6, p.y + 7, '#fff', 3, 2); }
    enemies.forEach(e => {
      if (!e.dead && overlap(hb, e)) {
        e.dead = -1; const pts = 200 * comboMult(); score += pts;
        popup(e.x, e.y - 8, '+' + pts, '#fff'); addCombo(e.x, e.y);
        sfx('kick'); burst(e.x + 7, e.y + 6, '#fff', 6, 2);
      }
    });
    if (boss && boss.alive && overlap(hb, boss)) hitBoss(spin ? 2 : 1);
  }
  // เหยียบปู / ชน
  const feetY = p.y + p.h;
  enemies.forEach(e => {
    if (e.dead) return;
    if (overlap(p, e)) {
      const snapping = e.st === 'warn' || e.st === 'snap';
      if (p.vy > 0.5 && feetY - e.y < 10 && !snapping) {
        e.dead = 30; const pts = 200 * comboMult(); score += pts;
        popup(e.x, e.y - 8, '+' + pts, '#fff'); addCombo(e.x, e.y);
        p.vy = (inp.jumpHeld ? -7 : -4.5); sfx('stomp'); rumble(60, 0.4);
        burst(e.x + 7, e.y, '#fff', 6, 2);
      } else hurtPlayer(e.x + e.w / 2);
    }
  });
  // บอส
  if (boss && boss.alive && overlap(p, boss)) {
    if (p.vy > 0.5 && feetY - boss.y < 14) {
      hitBoss(); p.vy = -7;
    } else hurtPlayer(boss.x + boss.w / 2);
  }
  // เก็บเหรียญลอย
  for (let i = coinEnts.length - 1; i >= 0; i--) {
    const c = coinEnts[i];
    if (p.x < c.x + 10 && p.x + p.w > c.x && p.y < c.y + 10 && p.y + p.h > c.y) {
      coinEnts.splice(i, 1); coins++; score += 100; sfx('coin');
      popup(c.x, c.y - 6, '+100', '#ffd34d');
    }
  }
  // ไอเทม
  items.forEach(it => {
    if (overlap(p, it)) {
      it.got = true;
      if (it.type === 'shroom') { p.pow = Math.min(2, p.pow + 1); score += 1000; popup(p.x, p.y - 10, '+1000 ผักกาดขาว! (+พลัง)', '#7CFC98'); }
      else { p.pow = 2; score += 1000; popup(p.x, p.y - 10, '+1000 ปืนกูประดิษฐ์!', '#ff9f43'); }
      sfx('power'); burst(p.x + 6, p.y, '#fff', 10, 2); rumble(80, 0.5);
    }
  });
  items = items.filter(i => !i.got);
  // คุยกับชาวบ้าน (เฉพาะด่านหมู่บ้าน)
  const def = LEVELS[lvl];
  if (def.town) {
    const near = npcs.find(n => Math.abs((p.x + p.w / 2) - (n.x + 8)) < 24 && Math.abs((p.y + p.h) - ((n.yT !== undefined ? n.yT * T : 13 * T))) < 44);
    if (near && inp.fireHit) {
      near.li = (near.li + 1) % near.def.lines.length;
      talkNpc = near; talkT = 220;
      sfx('kick');
      const g = near.def.gift;
      if (g === 'life' && !near.gave) {
        near.gave = true;
        if (lives < 5) { lives++; popup(p.x, p.y - 12, 'ชีวิต +1!', '#ff6b81'); }
        else { score += 500; popup(p.x, p.y - 12, '+500 อิ่มแล้ว!', '#ffd34d'); }
        sfx('power');
      }
      else if (g === 'gun' && !near.gave) { near.gave = true; p.pow = 2; popup(p.x, p.y - 12, 'ได้ปืนกูประดิษฐ์!', '#69db7c'); sfx('power'); }
    } else if (!near) { if (talkT <= 0) talkNpc = null; }
    if (talkT > 0) talkT--;
  }
  // ท่อเขียว: ยืนบนปากท่อ + กด ↓ = เข้ามินิเกมรับเหรียญ (ครั้งเดียวต่อด่าน) จบแล้วข้ามไปด่านต่อไป
  if (pipeCd > 0) pipeCd--;
  const feetTX = Math.floor((p.x + p.w / 2) / T), feetTY = Math.floor((p.y + p.h + 2) / T);
  const onPipe = p.onG && rows[feetTY] && rows[feetTY][feetTX] === 'P';
  if (onPipe && !pipeUsed && pipeCd <= 0 && msgT <= 0) { msg = 'กด ↓ ลงท่อไปมินิเกม!'; msgT = 60; }
  if (onPipe && !pipeUsed && (inp.downHit || inp.downHeld) && pipeCd <= 0) {
    pipeUsed = true; pipeCd = 90;
    startMini();
    return;
  }
  if (onPipe && pipeUsed && pipeCd <= 0 && msgT <= 0) { msg = 'ท่อนี้ใช้แล้ว!'; msgT = 50; }
  // เสาธง
  checkGoal();
  // ตกเหว
  if (p.y > H + 20 && !p.dead) { p.dead = true; killPlayer(true); return; }
  // กล้อง
  const maxCam = Math.max(0, rows[0].length * T - W);
  camX = Math.max(0, Math.min(maxCam, p.x + p.w / 2 - W / 2));
}
function addCombo(x, y) {
  combo++; comboT = 180;
  if (combo >= 2) popup(x, y - 12, 'x' + combo + ' COMBO!', '#ffd34d');
}
function comboMult() { return combo >= 5 ? 2 : 1; }
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function checkGoal() {
  const p = player, def = LEVELS[lvl];
  const gx = def.place.find(q => q[2] === 'G')[0] * T;
  const gy = 13 * T;
  if (p.x + p.w > gx && p.x < gx + 8 && p.y + p.h > gy - 8 * T && p.y < gy) {
    if (def.boss && boss && boss.alive) {
      const nm = boss.kind === 'crab' ? 'ปูยักษ์' : 'ควายยักษ์';
      if (msgT <= 0) { msg = 'ปราบ' + nm + 'ก่อน! (' + boss.hp + '❤)'; msgT = 90; sfx('warn'); }
      return;
    }
    score += 1000; sfx('clear');
    unlocked[Math.min(lvl + 1, LEVELS.length - 1)] = true; refreshDash();
    if (lvl >= LEVELS.length - 1) screen = 'win';
    else { screen = 'clear'; introT = 140; }
  }
}
function hitBoss(dmg) {
  if (!boss || !boss.alive || boss.ifr > 0) return;
  boss.hp -= (dmg || 1); boss.ifr = 50; score += 500;
  addCombo(boss.x + 14, boss.y);
  popup(boss.x + 14, boss.y - 8, '-1!', '#ff5566');
  sfx('bosshit'); rumble(200, 1); burst(boss.x + 14, boss.y + 10, '#ff5566', 12, 3);
  if (boss.hp <= 0) {
    boss.alive = false; score += 5000;
    popup(boss.x + 14, boss.y - 10, boss.kind === 'crab' ? '+5000 ปูยักษ์ล้มแล้ว!' : '+5000 ควายยักษ์ล้มแล้ว!', '#ffd34d');
    burst(boss.x + 14, boss.y + 15, '#ff9f43', 30, 5);
    burst(boss.x + 14, boss.y + 15, '#fff', 20, 4);
    sfx('clear'); rumble(400, 1);
  }
}

/* ---------------- มินิเกมในท่อ: รับเหรียญ 15 วิ → รับรางวัล → ข้ามด่าน ----------------
   กติกา: ขยับ ←/→ (หรืออนาล็อก) รับเหรียญ หนีระเบิด หมดเวลารับรางวัลแล้วข้ามไปด่านต่อไปทันที */
function startMini() {
  screen = 'mini';
  mini = { t: 0, dur: 900, bx: W / 2, items: [], caught: 0, bombs: 0, done: false };
  sfx('sprout');
  msg = 'มินิเกม! รับเหรียญให้ได้เยอะๆ!'; msgT = 150;
}
function updateMini(inp) {
  if (!mini || mini.done) return;
  mini.t++;
  const spd = 3.2;
  if (inp.move < 0) mini.bx -= spd;
  if (inp.move > 0) mini.bx += spd;
  if (mini.bx < 14) mini.bx = 14;
  if (mini.bx > W - 14) mini.bx = W - 14;
  // เสกของตก
  if (mini.t % 22 === 0 && mini.items.length < 12) {
    const isBomb = Math.random() < 0.22;
    mini.items.push({ x: 14 + Math.random() * (W - 28), y: HUDH + 6, vy: 1.4 + Math.random() * 1.2 + mini.t / 900,
                      bomb: isBomb, spin: Math.random() * 60 });
  }
  const by = H - 34;
  for (let i = mini.items.length - 1; i >= 0; i--) {
    const it = mini.items[i];
    it.y += it.vy; it.spin++;
    if (it.y >= by - 8 && it.y <= by + 10 && Math.abs(it.x - mini.bx) < 18) {
      mini.items.splice(i, 1);
      if (it.bomb) { mini.bombs++; sfx('hurt'); rumble(120, 0.6); burst(mini.bx, by, '#ff4444', 8, 2); }
      else { mini.caught++; score += 50; sfx('coin'); burst(mini.bx, by - 8, '#ffd34d', 5, 2); }
      continue;
    }
    if (it.y > H + 10) mini.items.splice(i, 1);
  }
  if (mini.t >= mini.dur || inp.startHit) finishMini();
}
function finishMini() {
  if (!mini || mini.done) return;
  mini.done = true;
  const c = mini.caught;
  coins += c; score += c * 100;
  let bonus = '';
  if (c >= 14) { if (lives < 5) lives++; score += 1000; bonus = 'ชีวิต +1! '; }
  else if (c >= 9) { if (player) player.pow = 2; score += 500; bonus = 'ปืนเต็ม! '; }
  else if (c >= 5) { score += 200; bonus = ''; }
  msg = 'มินิเกมจบ! รับ ' + c + ' เหรียญ ' + bonus + '→ ข้ามด่าน!'; msgT = 170;
  sfx('clear');
  // ข้ามไปด่านต่อไปทันที (ท่อทางลัด) — ปลดล็อกเหมือนแตะธง
  setTimeout(() => {
    unlocked[Math.min(lvl + 1, LEVELS.length - 1)] = true;
    if (typeof refreshDash === 'function') { try { refreshDash(); } catch (e) {} }
    if (lvl >= LEVELS.length - 1) { screen = 'win'; }
    else { lvl++; loadLevel(lvl); screen = 'intro'; introT = 110; }
    mini = null;
  }, 900);
}
function drawMini(t) {
  // ฉากท่อใต้ดิน
  ctx.fillStyle = '#0d2a1a'; ctx.fillRect(0, HUDH, W, H - HUDH);
  ctx.fillStyle = '#123a24';
  for (let b = 0; b < 12; b++) px(b * 42 - (t * 0.3 % 42), HUDH + 20, 20, 60, '#123a24');
  px(0, HUDH, W, 4, '#2f9e44');
  txt('ท่อมินิเกม — รับเหรียญ! เหลือ ' + Math.ceil((mini.dur - mini.t) / 60) + 'วิ', W / 2, HUDH + 16, 10, '#7CFC98', 'center');
  txt('รับแล้ว ' + mini.caught + '  ระเบิดโดน ' + mini.bombs, W / 2, HUDH + 30, 9, '#ffd34d', 'center');
  // เส้นเวลา
  px(40, HUDH + 36, W - 80, 4, '#222'); px(40, HUDH + 36, (W - 80) * (1 - mini.t / mini.dur), 4, '#7CFC98');
  // ของตก
  mini.items.forEach(it => {
    if (it.bomb) { px(it.x - 5, it.y - 5, 10, 10, '#333'); px(it.x - 3, it.y - 7, 6, 3, '#ff4444'); px(it.x - 2, it.y - 2, 4, 4, '#ff8787'); }
    else { const sw = 4 + Math.abs(Math.cos(it.spin / 14)) * 6; px(it.x - sw / 2, it.y - 5, sw, 10, '#ffd34d'); }
  });
  // ตะกร้าไทย
  const by = H - 34;
  px(mini.bx - 16, by, 32, 10, '#8a6d3b'); px(mini.bx - 16, by, 32, 3, '#d9a441');
  px(mini.bx - 12, by - 6, 24, 6, '#ffd9a8'); // หัวไทยโผล่
  px(mini.bx - 14, by + 10, 28, 3, 'rgba(0,0,0,0.35)');
  drawHUD();
}

/* ---------------- ศัตรู / ไอเทม / กระสุน ---------------- */
function updateEnemies() {
  const p = player;
  enemies.forEach(e => {
    if (e.dead === -1) return;
    if (e.dead > 0) { e.dead--; if (e.dead <= 0) e.dead = -1; return; } // แบนแล้วหาย ไม่ฟื้น
    e.anim++;
    if (e.cd > 0) e.cd--;
    const dx = (p.x + p.w / 2) - (e.x + e.w / 2), dy = Math.abs((p.y + p.h / 2) - (e.y + e.h / 2));
    if (e.st === 'walk') {
      e.vx = (e.spd || 0.85) * e.dir;
      moveBody(e, true);
      if (e.hitWall) { e.dir = -e.hitWall; e.vx = (e.spd || 0.85) * e.dir; }
      else if (e.onG && !groundAhead(e)) e.dir *= -1;
      // เห็นผู้เล่นใกล้ๆ → เตรียมหนีบ (ไวกว่าเดิม)
      if (!p.dead && Math.abs(dx) < 58 && dy < 28 && e.cd <= 0) {
        e.st = 'warn'; e.t = 0; e.vx = 0;
      }
    } else if (e.st === 'warn') {
      e.vx = 0; moveBody(e, true);
      e.dir = dx > 0 ? 1 : -1;
      if (++e.t > 16) { e.st = 'snap'; e.t = 0; e.vx = e.dir * 3.1; sfx('fire'); }
    } else if (e.st === 'snap') {
      moveBody(e, true);
      if (++e.t > 22) { e.st = 'walk'; e.cd = 55; }
      if (e.hitWall) { e.st = 'walk'; e.cd = 55; }
    }
    if (e.y > H + 40) e.dead = -1;
  });
  enemies = enemies.filter(e => e.dead !== -1);
}
function updateItems() {
  items.forEach(it => {
    if (it.rise > 0) { it.rise--; it.y -= 14 / 26; return; }
    if (it.type === 'shroom') it.vx = 0.8;
    moveBody(it, true);
    if (it.hitWall) it.vx = 0;
    else if (it.type === 'shroom') it.vx = (it.vx < 0 ? -0.8 : 0.8);
    if (it.y > H + 40) it.got = true;
  });
  items = items.filter(i => !i.got);
}
function updateShots() {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.vy = Math.min(s.vy + 0.25, 4);
    s.x += s.vx; s.y += s.vy;
    if (solidAt(s.x + (s.vx > 0 ? s.w : 0), s.y + s.h / 2)) { burst(s.x, s.y, '#ff9f43', 5, 2); shots.splice(i, 1); continue; }
    if (solidAt(s.x + s.w / 2, s.y + s.h)) { s.y = Math.floor((s.y + s.h) / T) * T - s.h; s.vy = -2.5; }
    let hit = false;
    enemies.forEach(e => {
      if (!e.dead && overlap(s, e)) {
        e.dead = -1; const pts = 200 * comboMult(); score += pts;
        popup(e.x, e.y - 6, '+' + pts, '#fff'); addCombo(e.x, e.y); sfx('kick'); hit = true;
      }
    });
    if (!hit && boss && boss.alive && overlap(s, boss)) { hitBoss(); hit = true; }
    if (hit || s.x < camX - 30 || s.x > camX + W + 30 || s.y > H) shots.splice(i, 1);
  }
}
function updateBoss() {
  if (!boss || !boss.alive) return;
  if (boss.ifr > 0) boss.ifr--;
  boss.t++;
  const p = player;
  if (boss.kind === 'crab') {
    // ปูยักษ์: เดินปู เตือน แล้วพุ่งชน (บัฟแล้ว)
    if (boss.st === 'idle') {
      boss.vx = 1.1 * boss.dir;
      moveBody(boss, true);
      if (boss.hitWall) boss.dir = -boss.hitWall;
      else if (boss.onG && !groundAhead(boss)) boss.dir *= -1;
      const dx = (p.x + p.w / 2) - (boss.x + boss.w / 2);
      if (!p.dead && Math.abs(dx) < 110 && Math.abs(p.y - boss.y) < 50) {
        boss.st = 'warn'; boss.t = 0; sfx('warn');
      }
    } else if (boss.st === 'warn') {
      boss.vx *= 0.8; moveBody(boss, true);
      if (boss.t > 22) {
        boss.st = 'charge'; boss.t = 0;
        boss.dir = p.x > boss.x ? 1 : -1;
        boss.vx = boss.dir * 3.8;
      }
    } else if (boss.st === 'charge') {
      moveBody(boss, true);
      if (boss.t > 30 || boss.hitWall) { boss.st = 'idle'; boss.t = 0; }
      // ชาร์จเจอเหวให้หยุด (ไม่พุ่งตกตาม)
      if (boss.onG && !groundAhead(boss)) { boss.st = 'idle'; boss.t = 0; boss.vx = 0; }
    }
    if (boss.x < T) { boss.x = T; boss.vx = 0; }
    if (boss.x + boss.w > rows[0].length * T - T) { boss.x = rows[0].length * T - T - boss.w; boss.vx = 0; }
    if (boss.y > H + 30) {
      boss.x = boss.homeX; boss.y = boss.homeY; boss.vx = 0; boss.vy = 0; boss.st = 'idle'; boss.t = 0;
      burst(boss.x + 14, boss.y, '#ff8787', 8, 2);
    }
    return;
  }
  const aggr = 5 - boss.hp; // ยิ่งเจ็บยิ่งดุ (บัฟแล้ว)
  if (boss.st === 'idle') {
    boss.vx *= 0.8;
    moveBody(boss, true);
    if (boss.t > Math.max(22, 60 - aggr * 10)) { boss.st = 'warn'; boss.t = 0; sfx('warn'); }
  } else if (boss.st === 'warn') {
    if (boss.t > 20) {
      boss.st = 'jump'; boss.t = 0;
      boss.dir = p.x > boss.x ? 1 : -1;
      boss.vx = boss.dir * (2.0 + aggr * 0.5);
      boss.vy = -8.2;
    }
  } else if (boss.st === 'jump') {
    moveBody(boss, true);
    if (boss.onG && boss.t > 5) {
      boss.st = 'idle'; boss.t = 0;
      burst(boss.x + 14, boss.y + 30, '#8b93b0', 10, 3);
      rumble(100, 0.5);
    }
  }
  // กันบอสตกเหว/หลุดฉาก (บอสตกไม่ได้: เจอเหวให้กลับตัว, หลุดให้วาร์ปกลับบ้าน)
  if (boss.x < T) { boss.x = T; boss.vx = 0; }
  if (boss.x + boss.w > rows[0].length * T - T) { boss.x = rows[0].length * T - T - boss.w; boss.vx = 0; }
  if (boss.onG && !groundAhead(boss) && boss.st !== 'jump') { boss.dir *= -1; boss.vx = boss.dir * 1; if (boss.st === 'charge') { boss.st = 'idle'; boss.t = 0; } }
  if (boss.y > H + 30) { // หลุดไปแล้ว (เช่นกระโดดข้ามเหว) วาร์ปกลับจุดเกิด HP เท่าเดิม
    boss.x = boss.homeX; boss.y = boss.homeY; boss.vx = 0; boss.vy = 0; boss.st = 'idle'; boss.t = 0;
    burst(boss.x + 14, boss.y, '#ff8787', 8, 2);
  }
}
function updateFx() {
  parts.forEach(q => {
    q.x += q.vx; q.y += q.vy;
    if (q.float) { q.vy = -0.15; q.vx += Math.sin((q.life + time) / 18) * 0.03; }
    else q.vy += 0.2;
    q.life--;
  });
  parts = parts.filter(q => q.life > 0);
  pops.forEach(q => { q.y -= 0.5; q.t--; });
  pops = pops.filter(q => q.t > 0);
  bumps.forEach(b => b.t--);
  bumps = bumps.filter(b => b.t > 0);
  coinEnts.forEach(c => c.t++);
  if (msgT > 0) msgT--;
  if (comboT > 0 && --comboT <= 0) combo = 0; // combo หมดเวลา
}

/* ---------------- UI บน DOM (ข้อความคมทุกจอ) ---------------- */
const uiCache = {};
function uiEl(id) {
  try {
    if (!(id in uiCache)) uiCache[id] = $(id);
    return uiCache[id] || null;
  } catch (e) { return null; }
}
let uS = 1, uOX = 0, uOY = 0;
function uiCal() {
  try {
    const r = cv.getBoundingClientRect();
    const w = $('wrap').getBoundingClientRect();
    if (!r || !w || !r.width) return false;
    uS = r.width / W; uOX = r.left - w.left; uOY = r.top - w.top;
    return true;
  } catch (e) { return false; }
}
const uiSigns = []; // ป้ายร้านจากฉาก: {x,y,text,col}
let popPool = [], tagPool = [], signPool = [];
function uiDiv(cls, parent) {
  try {
    const d = document.createElement('div');
    d.className = cls;
    (parent || uiEl('ui')).appendChild(d);
    return d;
  } catch (e) { return null; }
}
function setTxt(el, v) { try { if (el && el.textContent !== v) el.textContent = v; } catch (e) {} }
function setShow(el, on, disp) {
  try { if (el) el.style.display = on ? (disp || '') : 'none'; } catch (e) {}
}
function uiSync() {
  if (!uiCal()) return;
  const X = wx => uOX + (wx - camX) * uS, Y = wy => uOY + wy * uS;
  // HUD
  let hearts = '';
  for (let i = 0; i < 3; i++) hearts += i < lives ? '♥' : '♡';
  setTxt(uiEl('hHearts'), hearts);
  setTxt(uiEl('hScore'), 'SCORE ' + score);
  setTxt(uiEl('hCoins'), '● ' + coins);
  setTxt(uiEl('hLevel'), LEVELS[lvl].name);
  const pw = player && player.pow >= 2 ? ['ปืน', '#69db7c'] : (player && player.pow >= 1 ? ['โต', '#7CFC98'] : ['เล็ก', '#ff8787']);
  const hPow = uiEl('hPow');
  setTxt(hPow, '[' + pw[0] + ']');
  try { if (hPow) hPow.style.color = pw[1]; } catch (e) {}
  setTxt(uiEl('hPad'), getPad() ? '🎮' : '⌨');
  // คอมโบ
  const cb = uiEl('combo');
  setShow(cb, combo >= 2);
  if (combo >= 2) setTxt(cb, 'x' + combo + ' COMBO' + (combo >= 5 ? ' 🔥ท่าไม้ตายพร้อม!' : ''));
  // แถบเลือดบอส
  const bb = uiEl('bossbar');
  const showB = !!(boss && boss.alive && (screen === 'play' || screen === 'pause'));
  setShow(bb, showB);
  if (showB) {
    const nm = uiEl('bossbar') ? uiEl('bossbar').querySelector('.nm') : null;
    const fl = uiEl('bossbar') ? uiEl('bossbar').querySelector('.fl') : null;
    setTxt(nm, (boss.kind === 'crab' ? '🦀 ปูยักษ์' : '🐃 ควายยักษ์') + '  ' + boss.hp + '/' + boss.maxhp);
    try { if (fl) fl.style.width = (100 * boss.hp / boss.maxhp) + '%'; } catch (e) {}
  }
  // แบนเนอร์
  const bn = uiEl('banner');
  setShow(bn, msgT > 0);
  if (msgT > 0) setTxt(bn, msg);
  // ป้ายชวนคุย
  const pr = uiEl('prompt');
  let prOn = false;
  if (LEVELS[lvl].town && player && !player.dead && screen === 'play') {
    const near = npcs.find(n => Math.abs((player.x + player.w / 2) - (n.x + 8)) < 24 && Math.abs((player.y + player.h) - ((n.yT !== undefined ? n.yT * T : 13 * T))) < 40);
    if (near && (!talkNpc || talkT <= 0)) {
      prOn = true;
      setTxt(pr, 'กด X คุยกับ' + near.def.name);
      try {
        pr.style.left = (uOX + (near.x + 8 - camX) * uS) + 'px';
        pr.style.top = (uOY + ((near.yT !== undefined ? near.yT * T : 13 * T) - 26) * uS) + 'px';
      } catch (e) {}
    }
  }
  setShow(pr, prOn);
  // กล่องคุย
  const tk = uiEl('talk');
  const tkOn = !!(talkNpc && talkT > 0);
  setShow(tk, tkOn);
  if (tkOn) {
    setTxt(tk.querySelector('.nm'), '◆ ' + talkNpc.def.name);
    setTxt(tk.querySelector('.tx'), talkNpc.def.lines[talkNpc.li < 0 ? 0 : talkNpc.li]);
  }
  // ป๊อปอัพคะแนน
  while (popPool.length < pops.length) {
    const d = uiDiv('pop', uiEl('pops'));
    if (!d) break;
    popPool.push(d);
  }
  popPool.forEach((d, i) => {
    const q = pops[i];
    if (!q) { setShow(d, false); return; }
    setShow(d, true);
    setTxt(d, q.text);
    try {
      d.style.color = q.col;
      d.style.left = X(q.x) + 'px'; d.style.top = Y(q.y) + 'px';
    } catch (e) {}
  });
  // ป้ายชื่อ NPC
  while (tagPool.length < npcs.length) {
    const d = uiDiv('ntag');
    if (!d) break;
    tagPool.push(d);
  }
  tagPool.forEach((d, i) => {
    const n = npcs[i];
    if (!n || screen !== 'play') { setShow(d, false); return; }
    setShow(d, true);
    setTxt(d, n.def.name);
    try {
      d.style.left = (uOX + (n.x + 8 - camX) * uS) + 'px';
      d.style.top = (uOY + ((n.yT !== undefined ? n.yT * T : 13 * T) - 22) * uS) + 'px';
    } catch (e) {}
  });
  // ป้ายร้านในฉาก
  while (signPool.length < uiSigns.length) {
    const d = uiDiv('sign');
    if (!d) break;
    signPool.push(d);
  }
  signPool.forEach((d, i) => {
    const s2 = uiSigns[i];
    if (!s2) { setShow(d, false); return; }
    const sx = uOX + s2.x * uS; // s2.x เป็นพิกัดจอแล้ว (wx - camX*0.55) ห้ามลบ camX ซ้ำไม่งั้นตัวหนังสือไหล
    setShow(d, sx > -60 && sx < W * uS + 60);
    setTxt(d, s2.text);
    try {
      d.style.color = s2.col;
      d.style.left = sx + 'px'; d.style.top = (uOY + s2.y * uS) + 'px';
    } catch (e) {}
  });
  // จอกลาง
  const ct = uiEl('center');
  const h2 = ct ? ct.querySelector('h2') : null;
  const ps = ct ? ct.querySelectorAll('p') : [];
  const btn = ct ? ct.querySelector('button') : null;
  let mode = null;
  if (screen === 'intro') mode = ['t', LEVELS[lvl].name, '× ' + lives + ' ชีวิต', '', ''];
  else if (screen === 'pause') mode = ['t', 'หยุดพัก', 'กด P / Start หรือปุ่มล่างเพื่อเล่นต่อ', '', 'เล่นต่อ ▶'];
  else if (screen === 'clear') mode = ['t', 'ผ่านด่าน! +1000', 'SCORE ' + score, '', ''];
  else if (screen === 'win') mode = ['t', '🏆 ชนะแล้ว! ปราบควายยักษ์สำเร็จ', 'SCORE ' + score + ' · เหรียญ ' + coins, '', 'กลับหน้าแรก'];
  else if (screen === 'over') mode = ['t', 'GAME OVER', 'SCORE ' + score, '', 'กลับหน้าแรก'];
  else if (screen === 'title') mode = ['t', 'PIXEL QUEST', 'กด Enter / Start เพื่อเริ่ม', '', 'เริ่มเลย ▶'];
  setShow(ct, !!mode);
  if (mode && ct) {
    setTxt(h2, mode[1]);
    if (ps[0]) setTxt(ps[0], mode[2]);
    if (ps[1]) setTxt(ps[1], mode[3]);
    if (btn) {
      setTxt(btn, mode[4]);
      setShow(btn, !!mode[4]);
      btn.onclick = () => {
        audio();
        if (screen === 'pause') screen = 'play';
        else if (screen === 'win' || screen === 'over') showDash();
        else if (screen === 'intro' || screen === 'clear') screen = screen === 'intro' ? 'play' : screen;
        else if (screen === 'title') { lvl = 0; score = 0; coins = 0; lives = 3; loadLevel(0); screen = 'intro'; introT = 110; }
      };
    }
  }
}

/* ---------------- วาด ---------------- */
const FONT = '"Leelawadee UI","TH Sarabun New",monospace';
function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }
// ตัวหนังสือมีขอบดำ อ่านชัดบนทุกพื้นหลัง (ใช้เฉพาะไอคอนในฉาก — ข้อความ UI อยู่บน DOM)
function txt(s, x, y, size, col, align, noOl) {
  ctx.font = 'bold ' + size + 'px ' + FONT;
  ctx.textAlign = align || 'left';
  if (!noOl) { ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
function drawTile(ch, x, y, t) {
  const X = x * T - camX, Y = y * T;
  if (X < -T || X > W + T) return;
  let off = 0;
  bumps.forEach(b => { if (b.tx === x && b.ty === y) off = -Math.sin((b.t / 8) * Math.PI) * 5; });
  const yy = Y + off;
  switch (ch) {
    case '#':
      px(X, yy, T, T, '#5b8c5a'); px(X, yy, T, 3, '#7bc47f'); px(X, yy + 13, T, 3, '#3d6b3f');
      px(X + 3, yy + 5, 3, 3, '#6aa86f'); px(X + 10, yy + 8, 3, 3, '#6aa86f');
      px(X + ((x * 7 + y * 3) % 11), yy + 6, 2, 2, '#4c7a4e'); // ลายดิน
      px(X + (x % 2 ? 2 : 9), yy - 2, 3, 3, '#7bc47f'); px(X + (x % 2 ? 6 : 12), yy - 1, 2, 2, '#95d5a0'); // หญ้าขอบบน
      break;
    case 'B': px(X, yy, T, T, '#c96b32'); px(X, yy, T, 2, '#e8955a'); px(X, yy + 7, T, 2, '#8a4a20');
      px(X + 7, yy, 2, T, '#8a4a20'); px(X + 2, yy + 2, 3, 2, '#f0b27a'); break;
    case '?': case 'F': case 'C': {
      const blink = Math.floor(t / 20) % 2;
      px(X, yy, T, T, blink ? '#e8a13c' : '#d98a2b'); px(X, yy, T, 2, '#ffe1a1');
      px(X + 1, yy + 1, 2, 2, '#7a4d12'); px(X + 13, yy + 1, 2, 2, '#7a4d12');
      px(X + 1, yy + 13, 2, 2, '#7a4d12'); px(X + 13, yy + 13, 2, 2, '#7a4d12');
      const shine = (t / 25 + x) % 16;
      px(X + 2 + shine, yy + 3, 2, 10, 'rgba(255,255,255,0.35)');
      txt(ch === '?' ? '?' : (ch === 'F' ? 'F' : 'C'), X + 8, yy + 12, 9, '#fff', 'center'); break;
    }
    case 'U': px(X, yy, T, T, '#7a5c3e'); px(X, yy, T, 2, '#a0845c'); break;
    case 'P': px(X, yy, T, T, '#2f9e44'); px(X, yy, 4, T, '#63d68a'); px(X, yy, T, 3, '#267a35');
      px(X, yy, T, 3, '#3db85c'); px(X + 11, yy + 3, 3, T - 3, '#1f6b2a'); break;
    case 'G': { // ประตูวัดไทย
      const open = !(boss && boss.alive);
      const pil = open ? '#c0392b' : '#666', gold = open ? '#ffd34d' : '#888';
      px(X, yy - 5 * T, 4, 5 * T + T, pil); px(X + 12, yy - 5 * T, 4, 5 * T + T, pil); // เสาคู่
      for (let r = 0; r < 3; r++) { // หลังคาซ้อน 3 ชั้น
        px(X - 4 + r * 2, yy - 5 * T + r * 7 - 8, 24 - r * 4, 5, r === 1 ? gold : pil);
      }
      px(X + 6, yy - 5 * T - 14, 4, 8, gold); // ยอด
      px(X + 3, yy - 3 * T, 10, 12, gold); // โคมแขวน
      const fl = Math.floor(t / 8) % 2;
      px(X + 5, yy - 3 * T + 3, 6, 6, open ? (fl ? '#fff3a1' : '#ffd34d') : '#555'); // โคมกะพริบ
      // คบเพลิง 2 ข้างประตู (ปักถึงพื้น)
      [[-8], [20]].forEach(([ox]) => {
        px(X + ox, yy - 14, 3, 22, '#5c4a2a');
        px(X + ox - 1, yy - 18 + (fl ? 0 : 1), 5, 5, fl ? '#ff9f43' : '#e8590c');
        px(X + ox, yy - 17 + (fl ? 0 : 1), 3, 3, '#ffe066');
      });
      break;
    }
  }
}
function drawPlayer(t) {
  const p = player;
  if (p.ifr > 0 && Math.floor(t / 4) % 2) return; // กะพริบตอนอมตะ
  const X = p.x - camX, Y = p.y;
  px(X + 1, Y + 15, 10, 2, 'rgba(0,0,0,0.3)'); // เงา
  const run = p.onG && Math.abs(p.vx) > 0.2 ? Math.floor(t / 8) % 2 : 0;
  const air = !p.onG;
  const skin = '#ffd9a8', hair = '#16161f', shirt = '#e03131', shirtY = '#ffd34d', pants = '#51a351';
  ctx.save(); ctx.translate(X + p.w / 2, 0); ctx.scale(p.dir, 1); ctx.translate(-p.w / 2, 0);
  // ผมหนามสไตล์ไทย
  px(2, Y, 8, 2, hair); px(1, Y + 1, 2, 3, hair); px(4, Y - 1, 2, 2, hair); px(7, Y - 1, 2, 2, hair); px(9, Y + 1, 2, 3, hair);
  px(3, Y, 2, 1, '#44444f'); // เงาผม
  // หน้า
  px(2, Y + 3, 8, 4, skin); px(7, Y + 4, 3, 2, '#fff'); px(8, Y + 4, 2, 2, '#222');
  // เสื้อแดงแถบเหลือง
  px(1, Y + 7, 10, 3, shirt); px(3, Y + 7, 4, 3, shirtY); px(1, Y + 10, 10, 1, '#a11');
  px(1, Y + 7, 2, 4, '#a11'); // รอยพับเสื้อ
  // กางเกงเขียว
  if (air) { px(0, Y + 11, 4, 4, pants); px(8, Y + 10, 4, 3, pants); }
  else if (run) { px(1, Y + 11, 4, 4, pants); px(7, Y + 11, 4, 4, '#3a7d3a'); }
  else { px(1, Y + 11, 4, 4, pants); px(7, Y + 11, 4, 4, pants); }
  // ปืนกูประดิษฐ์ (ตอนมีปืน)
  if (p.pow >= 2) {
    px(10, Y + 7, 8, 5, '#4dabf7'); px(11, Y + 8, 4, 3, '#ffe066');
    px(18, Y + 8, 7, 3, '#69db7c'); px(10, Y + 5, 5, 2, '#e03131');
  }
  // ดาบปราบควาย (ตอนฟัน)
  if (p.swing > 0) {
    const k = p.swing / 16; // 1 → 0
    px(10, Y + 2 + Math.floor((1 - k) * 6), 12, 3, 'rgba(255,255,255,0.7)');
    px(11, Y + 4 + Math.floor((1 - k) * 6), 11, 3, '#c0c4d4');
    px(20, Y + 3 + Math.floor((1 - k) * 6), 4, 2, '#868e96');
    px(8, Y + 6, 3, 3, '#f783ac'); px(9, Y + 9, 2, 3, '#69db7c');
  }
  ctx.restore();
}
function drawWalker(e) {
  // ปู: ตัวแดง ก้ามตามสถานะ (walk = หุบ, warn/snap = อ้า)
  const X = e.x - camX, Y = e.y;
  if (e.dead > 0) { px(X, Y + 8, e.w, 4, '#8a2a1a'); return; } // แบน
  px(X + 2, Y + 12, 10, 2, 'rgba(0,0,0,0.3)'); // เงา
  const open = e.st !== 'walk';
  const f = Math.floor(e.anim / 10) % 2;
  px(X + 2, Y + 5, 10, 6, '#d9481c'); px(X + 2, Y + 5, 10, 2, '#f2734d'); // กระดอง
  px(X + 5, Y + 7, 2, 2, '#fff'); px(X + 8, Y + 7, 2, 2, '#fff');
  px(X + 5, Y + 8, 1, 1, '#222'); px(X + 8, Y + 8, 1, 1, '#222');
  // ขาปู
  px(X + (f ? 0 : 10), Y + 9, 4, 3, '#a02c12'); px(X + (f ? 10 : 0), Y + 9, 4, 3, '#a02c12');
  // ก้าม (ซ้าย/ขวา)
  const cy = open ? Y + 1 : Y + 4;
  px(X - 3, cy, 4, open ? 7 : 4, '#e8590c'); px(X - 3, cy + (open ? 0 : 3), 4, 1, '#7a1f08');
  px(X + 13, cy, 4, open ? 7 : 4, '#e8590c'); px(X + 13, cy + (open ? 0 : 3), 4, 1, '#7a1f08');
  if (e.st === 'warn') { px(X + 5, Y - 4, 4, 3, '#ff0'); } // เครื่องหมายเตือน
}
function drawNpc(n, t) {
  const X = n.x - camX, Y = (n.yT !== undefined ? n.yT * T - 15 : 13 * T - 15);
  px(X + 2, Y + 15, 12, 2, 'rgba(0,0,0,0.3)'); // เงา
  const bob = Math.floor(t / 30) % 2;
  px(X + 1, Y + 4, 14, 7, n.def.shirt); // เสื้อ
  px(X + 3, Y, 10, 5, '#ffd9a8'); // หัว
  px(X + 2, Y - 2 + bob, 12, 3, '#333'); // ผม/หมวก
  px(X + 3, Y + 11, 4, 4, '#5c4a3a'); px(X + 9, Y + 11, 4, 4, '#5c4a3a'); // ขา
  // (ชื่อ NPC วาดบน DOM)
}
function drawItem(it) {  const X = it.x - camX, Y = it.y;
  if (it.type === 'shroom') {
    // ผักกาดขาว: ใบขาวซ้อนเขียวอ่อน
    px(X + 2, Y + 7, 10, 7, '#f1f8e9'); px(X + 2, Y + 7, 10, 2, '#fff');
    px(X, Y + 3, 14, 5, '#a9dfbf'); px(X + 2, Y, 4, 4, '#7fbf7f'); px(X + 8, Y, 4, 4, '#7fbf7f');
    px(X + 5, Y + 9, 2, 2, '#33691e'); px(X + 8, Y + 9, 2, 2, '#33691e');
  } else {
    px(X + 5, Y + 9, 4, 5, '#2f9e44');
    px(X + 1, Y + 3, 12, 7, '#ff9f43'); px(X + 5, Y + 5, 4, 3, '#ffe1a1');
  }
}
function drawBoss(t) {
  if (boss.kind === 'crab') { drawCrabKing(t); return; }
  const b = boss, X = b.x - camX, Y = b.y;
  const flash = (b.st === 'warn' && Math.floor(t / 4) % 2) || (b.ifr > 0 && Math.floor(t / 3) % 2);
  const c = flash ? '#fff' : '#6b4a2f', dark = flash ? '#fff' : '#3f2a18';
  px(X, Y + 6, 28, 20, c); px(X, Y + 6, 28, 4, dark);
  px(X + 1, Y - 2, 5, 10, '#e8dcc0'); px(X + 22, Y - 2, 5, 10, '#e8dcc0'); // เขาโค้งควาย
  px(X + 6, Y + 12, 5, 5, '#ff0'); px(X + 17, Y + 12, 5, 5, '#ff0');
  px(X + 7, Y + 13, 3, 3, '#a00'); px(X + 18, Y + 13, 3, 3, '#a00');
  px(X + 11, Y + 20, 6, 3, '#e8dcc0'); px(X + 13, Y + 23, 2, 3, '#fff'); // ห่วงจมูก
  px(X + 4, Y + 22, 20, 3, dark);
  px(X + (b.dir > 0 ? 20 : 2), Y + 26, 8, 4, dark);
  // (แถบเลือดวาดบน DOM #bossbar)
  // มาร์กเงาตอนกระโดด
  if (b.st === 'warn') { px(X + 4, 13 * T - 2, 20, 2, '#ff0'); }
}
function drawCrabKing(t) {
  const b = boss, X = b.x - camX, Y = b.y;
  const flash = (b.st === 'warn' && Math.floor(t / 4) % 2) || (b.ifr > 0 && Math.floor(t / 3) % 2);
  const c = flash ? '#fff' : '#c93a1e', dark = flash ? '#fff' : '#7a1f08';
  const open = b.st !== 'idle';
  px(X + 3, Y + 8, 28, 12, c); px(X + 3, Y + 8, 28, 3, '#f2734d'); // กระดองยักษ์
  px(X + 12, Y + 11, 4, 4, '#fff'); px(X + 20, Y + 11, 4, 4, '#fff');
  px(X + 13, Y + 12, 2, 2, '#a00'); px(X + 21, Y + 12, 2, 2, '#a00');
  px(X + 6, Y + 18, 6, 4, dark); px(X + 22, Y + 18, 6, 4, dark); // ขา
  const cy = open ? Y + 2 : Y + 8, chh = open ? 12 : 6;
  px(X - 6, cy, 8, chh, '#e8590c'); px(X - 6, cy, 8, 2, dark); // ก้ามซ้าย
  px(X + 32, cy, 8, chh, '#e8590c'); px(X + 32, cy, 8, 2, dark); // ก้ามขวา
  px(X + 13, Y - 4, 8, 4, '#ffd34d'); // มงกุฎจิ๋ว
  px(X, Y - 10, 34, 4, '#333'); px(X, Y - 10, 34 * (b.hp / b.maxhp), 4, '#e03131');
  if (b.st === 'warn') { px(X + 12, Y - 16, 10, 5, '#ff0'); }
}
function drawBack() {
  uiSigns.length = 0; // ล้างป้ายร้านรอบที่แล้ว (วาดใหม่บน DOM)
  // 4 ชั้น: SKY(ไล่สี) / FAR(0.25) / MID(0.55) / FORE(0.85)
  const SKY = [
    ['#5aa9e6', '#cfeef7', '#ffe9c4'], // 0 นาเช้า
    ['#6a3f7d', '#e2605a', '#ffd9a0'], // 1 ตลาดเย็น
    ['#2c1f4d', '#7a3a5e', '#e07840'], // 2 ปราสาทค่ำ
    ['#05081c', '#141c46', '#2c3a6e'], // 3 ตลาดกลางคืน
    ['#3d1424', '#8a2f3d', '#e07840']  // 4 สนามรบ
  ][lvl] || ['#10142a', '#10142a', '#10142a'];
  const g = ctx.createLinearGradient(0, HUDH, 0, H);
  g.addColorStop(0, SKY[0]); g.addColorStop(0.62, SKY[1]); g.addColorStop(1, SKY[2]);
  ctx.fillStyle = g; ctx.fillRect(0, HUDH, W, H - HUDH);
  const offF = (camX * 0.25), offM = (camX * 0.55), offN = (camX * 0.85);
  const wrap = (v, m) => ((v % m) + m) % m;
  // ---------- ชั้น SKY: ดวง + เมฆ + ดาว ----------
  if (lvl === 0) {
    px(W - 72, HUDH + 14, 22, 22, '#fff6c9');
    px(W - 76, HUDH + 18, 30, 14, 'rgba(255,246,201,0.35)');
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 3; i++) {
      const cx = W - wrap(time * 0.12 + i * 220, W + 140) + 40;
      ctx.fillRect(cx, HUDH + 30 + i * 22, 52, 9); ctx.fillRect(cx + 10, HUDH + 24 + i * 22, 30, 9);
    }
    ctx.fillStyle = '#3a4a5a';
    for (let i = 0; i < 2; i++) {
      const bx = wrap(time * 0.5 + i * 260, W + 40) - 20;
      ctx.fillRect(bx, 56 + i * 14, 6, 2); ctx.fillRect(bx + 6, 56 + i * 14, 6, 2);
    }
  }
  if (lvl === 1) {
    px(W - 100, HUDH + 52, 34, 34, '#ffdf8a');
    px(W - 108, HUDH + 44, 50, 50, 'rgba(255,180,90,0.3)');
    ctx.fillStyle = 'rgba(255,170,170,0.8)';
    for (let i = 0; i < 4; i++) {
      const cx = W - wrap(time * 0.08 + i * 170, W + 120) + 20;
      ctx.fillRect(cx, HUDH + 24 + (i % 3) * 20, 60, 7); ctx.fillRect(cx + 12, HUDH + 19 + (i % 3) * 20, 34, 7);
    }
  }
  if (lvl === 2 || lvl === 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 30; i++) { const sx = (i * 97) % W, sy = HUDH + 6 + (i * 53) % 70; ctx.fillRect(sx, sy, 1, 1); }
    if (lvl === 3) { px(52, HUDH + 16, 18, 18, '#e8e4c9'); px(48, HUDH + 20, 26, 10, 'rgba(232,228,201,0.25)'); }
    if (lvl === 2) { px(W - 90, HUDH + 66, 26, 26, '#ffb35c'); }
  }
  if (lvl === 4) {
    px(W - 86, HUDH + 44, 36, 36, '#c22a3e');
    px(W - 94, HUDH + 36, 52, 52, 'rgba(200,60,60,0.28)');
  }
  // ---------- ชั้น FAR (0.25): ภูเขา/วัด/เมืองไกลแบบมีหมอก ----------
  const far = (camX * 0.25);
  if (lvl === 0) {
    ctx.fillStyle = '#6fae9e';
    for (let x = -wrap(far, 200); x < W; x += 200) {
      ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 50, H - 84); ctx.lineTo(x + 100, H); ctx.fill();
    }
    ctx.fillStyle = 'rgba(240,244,240,0.85)'; // เจดีย์ขาวไกล
    const jx = W - wrap(far + 60, W + 200) + 60;
    ctx.beginPath(); ctx.moveTo(jx - 14, H - 70); ctx.lineTo(jx, H - 120); ctx.lineTo(jx + 14, H - 70); ctx.fill();
    px(jx - 2, H - 132, 4, 12, 'rgba(240,244,240,0.85)');
  }
  if (lvl === 1) {
    // หลังคาวัด + บ้านไกลในหมอกเย็น
    ctx.fillStyle = 'rgba(150,80,90,0.55)';
    for (let x = -wrap(far, 240); x < W; x += 240) {
      ctx.beginPath(); ctx.moveTo(x - 45, H - 70); ctx.lineTo(x, H - 130); ctx.lineTo(x + 45, H - 70); ctx.fill();
      px(x - 3, H - 144, 6, 14, 'rgba(150,80,90,0.55)');
      ctx.fillRect(x + 55, H - 88, 60, 30);
      ctx.beginPath(); ctx.moveTo(x + 49, H - 88); ctx.lineTo(x + 85, H - 112); ctx.lineTo(x + 121, H - 88); ctx.fill();
    }
  }
  if (lvl === 2) {
    // ปรางค์ไกล 2 องค์
    ctx.fillStyle = 'rgba(70,50,95,0.8)';
    for (let x = -wrap(far, 320); x < W; x += 320) {
      px(x, H - 130, 44, 70, 'rgba(70,50,95,0.8)');
      px(x + 8, H - 152, 28, 24, 'rgba(70,50,95,0.8)');
      px(x + 16, H - 170, 12, 20, 'rgba(70,50,95,0.8)');
      px(x + 130, H - 100, 34, 50, 'rgba(70,50,95,0.6)');
      px(x + 138, H - 118, 18, 20, 'rgba(70,50,95,0.6)');
    }
  }
  if (lvl === 3) {
    // ตึกกลางคืน + หน้าต่างไฟ (ฟีลเมือง)
    for (let x = -wrap(far, 190); x < W; x += 190) {
      const bh = 90 + (Math.abs(Math.sin(x * 3.7)) * 50 | 0);
      ctx.fillStyle = 'rgba(16,22,52,0.95)'; ctx.fillRect(x, H - bh, 64, bh);
      ctx.fillStyle = 'rgba(255,205,100,0.85)';
      for (let wy = 0; wy < 5; wy++) for (let wx = 0; wx < 4; wx++) {
        if ((wx * 7 + wy * 3 + (x | 0)) % 3) ctx.fillRect(x + 8 + wx * 13, H - bh + 10 + wy * 14, 6, 8);
      }
    }
  }
  if (lvl === 4) {
    // วัดร้างไกล
    ctx.fillStyle = 'rgba(60,25,35,0.85)';
    for (let x = -wrap(far, 280); x < W; x += 280) {
      ctx.beginPath(); ctx.moveTo(x - 35, H - 70); ctx.lineTo(x, H - 125); ctx.lineTo(x + 35, H - 70); ctx.fill();
      px(x + 60, H - 90, 26, 40, 'rgba(60,25,35,0.7)');
    }
  }
  // ---------- ชั้น MID (0.55): ตึก/ตลาด/ปราสาท ----------
  const off2 = (camX * 0.55) % 240;
  if (lvl === 0) {
    // นาข้าว + กระท่อม + ต้นตาล
    ctx.fillStyle = '#4c9a4e';
    for (let r = 0; r < 3; r++) ctx.fillRect(0, H - 46 + r * 10, W, 3);
    for (let x = -off2; x < W; x += 240) {
      px(x, H - 80, 34, 26, '#8a6d3b'); // กระท่อม
      ctx.fillStyle = '#5c4a2a';
      ctx.beginPath(); ctx.moveTo(x - 5, H - 80); ctx.lineTo(x + 17, H - 100); ctx.lineTo(x + 39, H - 80); ctx.fill();
      // ต้นตาล
      px(x + 70, H - 110, 6, 56, '#6e5230');
      ctx.fillStyle = '#2f7d32';
      for (let f = -1; f <= 1; f++) {
        ctx.beginPath(); ctx.moveTo(x + 73, H - 110); ctx.lineTo(x + 73 + f * 22, H - 96); ctx.lineTo(x + 73 + f * 10, H - 90); ctx.fill();
      }
      px(x + 66, H - 74, 5, 6, '#8a6d3b'); px(x + 75, H - 74, 5, 6, '#8a6d3b'); // ลูกตาล
    }
    // นก
    ctx.fillStyle = '#333';
    const bx = (time * 0.5) % (W + 40) - 20;
    ctx.fillRect(bx, 60, 6, 2); ctx.fillRect(bx + 6, 60, 6, 2);
    // เมฆ
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const cl = (time * 0.15) % (W + 120);
    ctx.fillRect(W - cl, HUDH + 22, 46, 8); ctx.fillRect(W - cl + 10, HUDH + 16, 26, 8);
    // ชาวนาดำนา (2 คน ขยับก้ม)
    for (let f = 0; f < 2; f++) {
      const fx = ((f * 190 - camX * 0.7) % (W + 80) + W + 80) % (W + 80) - 40;
      const bend = Math.floor(time / 40 + f) % 2;
      px(fx, H - 42, 10, 8 - bend * 2, '#7a5c3e'); // ตัว
      px(fx + 2, H - 50 + bend * 2, 6, 5 + bend, '#ffd9a8'); // หัว+งอบ
      px(fx - 2, H - 54 + bend * 2, 14, 3, '#d9a441'); // งอบ
      px(fx + 3, H - 34, 2, 8, '#5c4a2a'); px(fx + 7, H - 34, 2, 8, '#5c4a2a'); // ขาในน้ำ
    }
    // ควายในนา (เงาดำ)
    const qx = ((300 - camX * 0.7) % (W + 160) + W + 160) % (W + 160) - 80;
    px(qx, H - 52, 34, 14, '#3a3a44'); px(qx + 26, H - 58, 10, 10, '#3a3a44');
    px(qx + 24, H - 62, 4, 6, '#d8d0b8'); px(qx + 34, H - 62, 4, 6, '#d8d0b8'); // เขา
    // หญ้าหน้าฉาก
    ctx.fillStyle = '#3f8a42';
    for (let g = 0; g < 24; g++) {
      const gx = (g * 53 - camX) % (W + 20);
      const xx = gx < 0 ? gx + W + 20 : gx;
      ctx.fillRect(xx, H - 8 - (g % 3), 2, 8 + (g % 3));
    }
  }
  if (lvl === 1) {
    // ถนนตลาดเย็น: ห้องแถวไม้ + กันสาด + แผงลอย + ป้ายไทย + ธงชาติ
    const signs = ['ผลไม้', 'ข้าวแกง', 'ก๋วยเตี๋ยว', 'น้ำปั่น'];
    const awns = ['#e03131', '#1971c2', '#2f9e44', '#e8890c'];
    for (let wx = Math.floor(camX * 0.55 / 150) * 150; wx < camX * 0.55 + W + 150; wx += 150) {
      const x = wx - camX * 0.55;
      const ai = Math.abs(Math.round(wx / 150)) % 4;
      px(x, H - 108, 62, 54, '#8a6238'); // ตัวห้องแถว
      px(x, H - 108, 62, 5, '#5c3f22'); // ขอบบน
      ctx.fillStyle = '#4a3018';
      ctx.beginPath(); ctx.moveTo(x - 5, H - 108); ctx.lineTo(x + 31, H - 128); ctx.lineTo(x + 67, H - 108); ctx.fill(); // หลังคา
      px(x + 28, H - 134, 6, 8, '#8a5a20'); // ช่อฟ้าเล็ก
      for (let s = 0; s < 5; s++) px(x + 4 + s * 12, H - 76, 8, 4, awns[(ai + s) % 4]); // กันสาดลาย
      px(x + 4, H - 72, 54, 3, '#3a2612');
      px(x + 10, H - 62, 14, 16, '#2c1e10'); px(x + 38, H - 62, 14, 16, '#2c1e10'); // ประตูมืด
      uiSigns.push({ x: x + 31, y: H - 86, text: signs[ai], col: '#fff' }); // ป้ายชื่อร้าน (วาดบน DOM)
      px(x + 66, H - 52, 26, 12, '#6e5230'); // แผงลอย
      px(x + 64, H - 64, 30, 4, '#e03131'); // ร่มแผง
      px(x + 68, H - 58, 4, 4, '#ff922b'); px(x + 74, H - 58, 4, 4, '#7CFC00'); px(x + 80, H - 58, 4, 4, '#ff6b81'); // ของขาย
    }
    // ธงชาติ + ต้นไม้ + สายไฟโคม
    for (let x = -off2; x < W; x += 300) {
      px(x, H - 130, 3, 76, '#5c4a2a');
      px(x + 3, H - 130, 18, 4, '#e03131'); px(x + 3, H - 126, 18, 4, '#fff'); px(x + 3, H - 122, 18, 4, '#2f5496'); px(x + 3, H - 118, 18, 4, '#fff'); px(x + 3, H - 114, 18, 4, '#e03131');
      px(x + 40, H - 70, 8, 16, '#4a3826'); // ต้นไม้
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath(); ctx.arc(x + 44, H - 78, 16, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(40,20,20,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, HUDH + 46);
    ctx.quadraticCurveTo(W / 2, HUDH + 62 + Math.sin(time / 30) * 2, W, HUDH + 46); ctx.stroke();
    for (let i = 0; i < 9; i++) { // โคมแขวนสายไฟ
      const lx = (i * 60 - camX * 0.55 * 0.3) % (W + 60);
      const xx = lx < 0 ? lx + W + 60 : lx;
      const ly = HUDH + 52 + Math.sin((xx + 200) / 90) * 5;
      const fl = Math.floor(time / 10 + i) % 2;
      px(xx, ly, 5, 7, fl ? '#ffd34d' : '#ff9f43'); px(xx + 1, ly + 2, 3, 3, '#fff');
    }
  }
  if (lvl === 3) {
    // ตลาดกลางคืน: ห้องแถวมืด + หน้าต่างไฟ + ป้ายเรืองแสง + สายโคม
    const signs = ['ก๋วยเตี๋ยว', 'ชานม', 'ผลไม้', 'โรตี'];
    for (let wx = Math.floor(camX * 0.55 / 150) * 150; wx < camX * 0.55 + W + 150; wx += 150) {
      const x = wx - camX * 0.55;
      const ai = Math.abs(Math.round(wx / 150)) % 4;
      px(x, H - 108, 62, 54, '#232a52'); // ตัวตึกมืด
      ctx.fillStyle = '#141838';
      ctx.beginPath(); ctx.moveTo(x - 5, H - 108); ctx.lineTo(x + 31, H - 126); ctx.lineTo(x + 67, H - 108); ctx.fill();
      px(x + 10, H - 92, 12, 14, '#ffd34d'); px(x + 38, H - 92, 12, 14, '#ffb347'); // หน้าต่างสว่าง
      px(x + 24, H - 62, 14, 8, '#0f1330'); // ประตูมืด
      uiSigns.push({ x: x + 31, y: H - 68, text: signs[ai], col: ai % 2 ? '#7CFCff' : '#ffb3c1' }); // ป้ายไฟ (วาดบน DOM)
    }
    // สายโคมไฟระย้า 2 เส้น
    for (let r = 0; r < 2; r++) {
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1;
      const yy0 = HUDH + 40 + r * 22;
      ctx.beginPath(); ctx.moveTo(0, yy0);
      ctx.quadraticCurveTo(W / 2, yy0 + 12, W, yy0); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const lx = (i * 44 + r * 20 - camX * 0.2) % (W + 40);
        const xx = lx < 0 ? lx + W + 40 : lx;
        const ly = yy0 + 6 + Math.sin((xx + r * 99) / 70) * 4;
        const fl = Math.floor(time / 9 + i + r * 3) % 2;
        px(xx, ly, 4, 6, fl ? '#ffe066' : '#ff9f43'); px(xx + 1, ly + 1, 2, 2, '#fff');
      }
    }
    px(40, HUDH + 14, 16, 16, '#e8e4c9'); // จันทร์
    // หลังคาวัดมืดไกล + ยอดทอง
    ctx.fillStyle = '#232a5c';
    const wx = W - wrap(camX * 0.3, W + 200) + 40;
    ctx.beginPath(); ctx.moveTo(wx - 40, H - 60); ctx.lineTo(wx, H - 120); ctx.lineTo(wx + 40, H - 60); ctx.fill();
    px(wx - 3, H - 132, 6, 12, '#ffd34d');
  }
  if (lvl === 2) {
    // ปราสาทโบราณ: ปรางค์ + ซากหิน + เถาวัลย์
    for (let x = -off2; x < W; x += 260) {
      px(x, H - 110, 50, 62, '#6b5a7a'); // ตัวปรางค์
      px(x + 8, H - 130, 34, 22, '#6b5a7a');
      px(x + 16, H - 148, 18, 20, '#6b5a7a');
      px(x + 21, H - 160, 8, 14, '#7d6c8f'); // ยอด
      px(x + 20, H - 60, 10, 12, '#2c2138'); // ประตูมืด
      px(x + 4, H - 100, 3, 40, '#3f7d3a'); px(x + 40, H - 90, 3, 30, '#3f7d3a'); // เถาวัลย์
      px(x + 10, H - 80, 6, 4, '#57496b'); px(x + 30, H - 70, 8, 4, '#57496b'); // ลายหิน
      px(x + 60, H - 30, 16, 10, '#57496b'); px(x + 82, H - 22, 12, 8, '#57496b'); // ซากหิน
      px(x + 24, H - 166, 2, 10, '#5c4a2a'); px(x + 26, H - 166, 8, 5, '#e03131'); // ธงยอดปรางค์
    }
  }
  if (lvl === 4) {
    // สนามรบ: กำแพงพัง + ธงขาด + เสาหัก + กา + หิ่งห้อย
    for (let x = -off2; x < W; x += 200) {
      px(x, H - 70, 40, 22, '#4a3038');
      for (let b = 0; b < 4; b++) px(x + b * 10 + (b % 2) * 3, H - 78, 8, 8, '#4a3038');
      px(x + 70, H - 60, 6, 30, '#3a2530'); // เสาหัก
      px(x + 90, H - 90, 2, 40, '#2c1c26'); px(x + 92, H - 90, 10, 6, '#7a1f2b'); // ธงขาด
    }
    ctx.fillStyle = '#1a1a22'; // กาบิน
    for (let c = 0; c < 3; c++) {
      const cx = ((time * (0.3 + c * 0.1) + c * 170) % (W + 40)) - 20;
      const cy = 50 + c * 18, w = Math.floor(time / 12 + c) % 2;
      ctx.fillRect(cx, cy, 5, 2); ctx.fillRect(cx + (w ? 5 : -2), cy - 2, 4, 2);
    }
  }
}
function drawHUD() {
  // แถบบน: พื้นหลังอย่างเดียว ข้อความอยู่บน DOM (#hud)
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, HUDH);
  px(0, HUDH - 2, W, 2, '#ffd34d');
}
function render(t) {
  if (screen === 'mini' && mini) { drawMini(t); uiSync(); return; }
  drawBack();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < rows[0].length; x++) {
    const ch = rows[y][x];
    if (ch !== '.' && ch !== 'o') drawTile(ch, x, y, t);
  }
  coinEnts.forEach(c => {
    const X = c.x - camX, bob = Math.sin(c.t / 12) * 2;
    if (X < -10 || X > W + 10) return;
    const sw = 4 + Math.abs(Math.cos(c.t / 14)) * 6; // หมุน
    px(X + 5 - sw / 2, Y0(c.y) + bob, sw, 10, '#ffd34d');
    px(X + 5 - sw / 4, Y0(c.y) + bob + 2, sw / 2, 6, '#fff3bf');
    function Y0(v) { return v; }
  });
  items.forEach(drawItem);
  npcs.forEach(n => drawNpc(n, t));
  // (ป้ายชวนคุย/กล่องบทสนทนา/ป๊อปอัพ วาดบน DOM ผ่าน uiSync)
  enemies.forEach(drawWalker);
  if (boss && boss.alive) drawBoss(t);
  shots.forEach(s => { const X = s.x - camX; px(X, s.y, 8, 8, '#69db7c'); px(X + 2, s.y + 2, 4, 4, '#d3f9d8'); });
  parts.forEach(q => px(q.x - camX, q.y, 3, 3, q.col));
  if (player && !player.dead) drawPlayer(t);
  // (ป๊อปอัพคะแนนวาดบน DOM ผ่าน uiSync)
  drawHUD();
  uiSync();
}
function center() {} // ย้ายข้อความไป DOM แล้ว (เก็บฟังก์ชันไว้กันอ้างอิงค้าง)
function overlay() {} // ย้ายจอกลางไป DOM #center แล้ว

/* ---------------- แดชบอร์ด (DOM) + เต็มจอ ---------------- */
const $ = id => document.getElementById(id);
const $$ = sel => (document.querySelectorAll ? document.querySelectorAll(sel) : []);
const SHORTNAMES = ['ด่าน 1 นา', 'บ้านทุ่งทอง', 'ด่าน 2 ปราสาท', 'บ้านริมวัด', 'รังควายยักษ์'];
function refreshDash() {
  $$('.lvlbtn').forEach((b, i) => {
    const open = !!unlocked[i];
    b.disabled = !open;
    b.innerHTML = (open ? '' : '🔒 ') + SHORTNAMES[i];
  });
  const ps = $('padstat');
  if (ps) ps.textContent = getPad() ? '🎮 เจอจอยแล้ว พร้อมสั่น' : '⌨ ยังไม่เจอจอย (เสียบแล้วกดปุ่มใดๆ)';
}
function setDisp(id, v) {
  try {
    const el = $(id);
    if (el && el.style && typeof el.style === 'object') el.style.display = v;
  } catch (e) { /* headless test ก็ข้าม */ }
}
function showDash() {
  screen = 'dash';
  setDisp('dash', 'flex');
  refreshDash();
}
function startGame(i) {
  if (!unlocked[i]) return;
  lvl = i; score = 0; coins = 0; lives = 3; foodG = 100; donateTotal = 0;
  loadLevel(i); screen = 'intro'; introT = 110;
  setDisp('dash', 'none');
  sfx('kick');
}
function toggleFull() {
  try {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); }
    else { const w = $('wrap') || cv; if (w && w.requestFullscreen) w.requestFullscreen(); }
  } catch (e) { /* ไม่รองรับก็ข้าม */ }
}
function wireDash() {
  const st = $('btnStart');
  if (st) st.addEventListener('click', () => { audio(); startGame(0); });
  $$('.lvlbtn').forEach((b, i) => b.addEventListener('click', () => { audio(); startGame(i); }));
  const mu = $('btnMute');
  if (mu) mu.addEventListener('click', () => { muted = !muted; mu.textContent = muted ? '🔇 ปิดเสียงอยู่' : '🔊 เสียง'; });
  const fu = $('btnFull');
  if (fu) fu.addEventListener('click', toggleFull);
}

/* ---------------- ลูปหลัก ---------------- */
let last = 0, acc = 0;
const STEP = 1000 / 60;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  let dt = ts - last; last = ts;
  if (dt > 250) dt = 250;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) { step(); acc -= STEP; n++; }
  time++;
  if (time % 45 === 0 && screen === 'dash') refreshDash(); // อัปเดตสถานะจอยหน้าแดชบอร์ด
  // อนุภาคบรรยากาศลอยตามด่าน (กลีบไม้/หิ่งห้อย/ฝุ่น/สะเก็ดไฟ)
  if ((screen === 'play' || screen === 'dash') && time % 22 === 0 && parts.length < 60) {
    const amb = ['#ffffff', '#ffe8c2', '#b8a0e8', '#ffeca8', '#ff9f68'];
    parts.push({ x: camX + Math.random() * W, y: HUDH + 20 + Math.random() * (H - HUDH - 40),
                 vx: -0.3 - Math.random() * 0.3, vy: 0, life: 120 + Math.random() * 60,
                 col: amb[lvl] || '#fff', float: true });
  }
  render(time);
  if (screen !== 'play' && screen !== 'pause') overlay();
  else if (screen === 'pause') overlay();
}
function step() {
  const inp = readInput();
  if (inp.pauseHit && (screen === 'play' || screen === 'pause')) {
    screen = screen === 'play' ? 'pause' : 'play';
  }
  if (inp.muteHit) muted = !muted;
  if (inp.fullHit) toggleFull();
  if (screen === 'dash') return;
  if (screen === 'title') {
    if (inp.startHit || inp.jumpHit) { lvl = 0; score = 0; coins = 0; lives = 3; foodG = 100; donateTotal = 0; loadLevel(0); screen = 'intro'; introT = 110; sfx('kick'); }
    return;
  }
  if (screen === 'intro') { if (--introT <= 0 || inp.startHit) screen = 'play'; return; }
  if (screen === 'pause') return;
  if (screen === 'clear') {
    if (--introT <= 0 || inp.startHit) { lvl++; loadLevel(lvl); screen = 'intro'; introT = 110; }
    return;
  }
  if (screen === 'win' || screen === 'over') {
    if (inp.startHit || inp.jumpHit) showDash();
    return;
  }
  if (screen === 'mini') { // มินิเกมในท่อ
    updateMini(inp);
    updateFx();
    return;
  }
  // play
  if (player.dead) { // อนิเมชันตาย: ลอยขึ้นแล้วร่วง
    player.vy = Math.min((player.vy || -6) + GRAV, 8); player.y += player.vy;
    if (player.y > H + 60) killPlayer(false);
    updateFx();
    return;
  }
  updatePlayer(inp);
  updateEnemies();
  updateItems();
  updateShots();
  updateBoss();
  updateFx();
}
loadLevel(0);
wireDash();
showDash();
requestAnimationFrame(frame);
