'use strict';
/* [ตำรวจโมส] QA harness — รันตรรกะเกมจริงใน node ด้วย stub DOM */
const fs = require('fs');
const vm = require('vm');
const path = process.argv[2] || 'game.js';
const src = fs.readFileSync(path, 'utf8');

// ---- stub DOM ----
const noop = () => {};
const ctxStub = new Proxy({}, {
  get(t, k) { if (k in t) return t[k]; return noop; },
  set(t, k, v) { t[k] = v; return true; }
});
const canvasStub = { getContext: () => ctxStub, addEventListener: noop, width: 480, height: 270 };
const sandbox = {
  console, Math, JSON, Object, Array, Number, String, Boolean, setTimeout, clearTimeout,
  document: { getElementById: () => canvasStub },
  window: { addEventListener: noop },
  navigator: {},
  requestAnimationFrame: noop, // ไม่ลูปเอง เดี๋ยวขับ step() เอง
};
sandbox.globalThis = sandbox;
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);

const driver = `
;globalThis.__T = {
  LEVELS, ROWS, T, W, H,
  reset(i){ lvl=i; score=0; coins=0; lives=3; foodG=100; donateTotal=0; loadLevel(i); screen='play'; },
  key(c,d){ keys[c]=d; if(d) pressed[c]=true; },
  run(n){ for(let i=0;i<n;i++) step(); },
  tileAt, SOLID,
  rowsOf(){ return rows; },
  snap(){ return { screen, lvl, score, coins, lives,
    px: Math.round(player.x), py: Math.round(player.y), ppow: player.pow, pdead: player.dead,
    onG: player.onG,
    boss: boss ? { hp: boss.hp, alive: boss.alive, bx: Math.round(boss.x), by: Math.round(boss.y) } : null,
    combo, unl: unlocked.slice(),
    foe: (() => { const e = enemies.find(e => !e.dead); return e ? Math.round(e.x) : null; })(),
    enemies: enemies.length, items: items.length, shots: shots.length,
    talk: talkNpc ? talkNpc.def.name : null }; },
  setP(x,y,vy){ player.x=x; player.y=y; if(vy!==undefined) player.vy=vy; },
  givePow(n){ player.pow=n; },
  setLives(n){ lives=n; },
  god(){ player.ifr = 999999; }, // อมตะสำหรับเทสทางเดิน (ตกเหวยังตายปกติ)
  hitBoss, hurtPlayer
};`;
vm.runInContext(src + driver, sandbox, { filename: 'game.js' });
const T = sandbox.__T;
const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

// ---------- 1. โครงสร้างด่าน ----------
T.LEVELS.forEach((d, i) => {
  T.reset(i); T.run(5);
  const rows = T.rowsOf();
  const wide = rows[0].length === d.w;
  let goals = 0, goalOK = true;
  rows.forEach((r, y) => r.forEach((ch, x) => {
    if (ch === 'G') { goals++; if (rows[13][x] !== '#') goalOK = false; }
  }));
  const pitsOK = (d.pits || []).every(([a, b]) => (b - a + 1) <= 4);
  check(`L${i} ${d.name}: กว้างตรง+มีธง 1 ต้น+ธงมีพื้น`, wide && goals === 1 && goalOK, `w=${rows[0].length}/${d.w} goals=${goals}`);
  check(`L${i}: หลุมกว้างไม่เกิน 4 ช่อง`, pitsOK, JSON.stringify(d.pits));
  if (d.town) check(`L${i}: ไม่มี NPC/ตึกแล้ว (แพลตฟอร์มเมอร์ล้วน)`, (d.npcs || []).length === 0 && !(d.doors || []).length, `npcs=${(d.npcs || []).length}`);
  if (d.boss) { const s = T.snap(); const want = (i === 4 ? 5 : 3); check(`L${i}: บอสเกิด HP=${want}`, s.boss && s.boss.hp === want && s.boss.alive); }
});

// ---------- 2. บอทเดินขวา+โดด เคลียร์ด่าน ----------
function botClear(idx, maxSteps) {
  T.reset(idx);
  T.givePow(2); T.god(); // อมตะ: ตัดโดนตีออก เหลือแค่ตกเหว (เทส traversability ล้วนๆ)
  const doJump = () => { T.key('Space', true); T.run(18); T.key('Space', false); }; // กดค้าง = โดดเต็มแรง
  const jumps = [];
  const doJumpLog = x => { jumps.push(x); doJump(); };
  let stuck = 0, lastX = -1, fireT = 0, fought = false;
  const goalX = T.LEVELS[idx].place.find(q => q[2] === 'G')[0] * 16;
  const fightBoss = () => { // สู้บอส/มินิบอสตรงหน้าจนตาย (ดาบ+ปืน)
    for (let k = 0; k < 14; k++) {
      const b = T.snap().boss;
      if (!b || !b.alive) return true;
      T.givePow(2);
      const me = T.snap();
      if (me.pdead) { T.run(200); continue; }
      T.setP(b.bx + (me.px < b.bx ? -24 : 36), 13 * 16 - 15);
      T.run(2);
      if (me.px < b.bx) { T.key('ArrowRight', true); T.run(1); T.key('ArrowRight', false); }
      else { T.key('ArrowLeft', true); T.run(1); T.key('ArrowLeft', false); }
      T.key('KeyX', true); T.run(2); T.key('KeyX', false);
      T.key('KeyC', true); T.run(2); T.key('KeyC', false);
      T.run(55);
    }
    const b = T.snap().boss;
    return !b || !b.alive;
  };
  for (let s = 0; s < maxSteps; s++) {
    const t0 = T.snap();
    if (t0.screen !== 'play') break;
    T.key('ArrowRight', true);
    // ฟัน+ยิงเคลียร์ทางถี่ๆ
    if (++fireT % 12 === 0) { T.key('KeyX', true); }
    if (fireT % 20 === 0) { T.key('KeyC', true); }
    T.run(1);
    T.key('KeyX', false); T.key('KeyC', false);
    const t1 = T.snap();
    // เห็นหลุมข้างหน้า + ยืนพื้นอยู่ = โดดทันที
    const gapAhead = T.tileAt(t1.px + 18, t1.py + 19) === '.' && T.tileAt(t1.px + 10, t1.py + 19) === '.';
    const aheadSolid = T.tileAt(t1.px + 14, t1.py + 7) !== '.' || T.tileAt(t1.px + 14, t1.py + 12) !== '.';
    if (t1.px <= lastX + 0.5) stuck++; else stuck = 0;
    lastX = t1.px;
    if ((gapAhead && t1.onG) || aheadSolid || stuck > 25) { doJumpLog(t1.px); stuck = 0; }
    if (t1.pdead) break;
    if (t1.screen !== 'play') break; // หยุดที่การเปลี่ยนจอครั้งแรก (clear แล้ว = ผ่าน)
    // ถึงประตูแล้วแต่ไม่เคลียร์ = โดนมินิบอสกั้น → กลับไปสู้ก่อน
    if (!fought && t1.px > goalX - 40) { fought = fightBoss(); stuck = 0; }
  }
  T.key('ArrowRight', false); T.key('Space', false);
  const _s = T.snap();
  _s.jumps = jumps;
  return _s;
}
[0, 2].forEach(idx => {
  const s = botClear(idx, 4000);
  check(`บอทเคลียร์ด่าน ${idx} (${T.LEVELS[idx].name})`, s.screen === 'clear', `screen=${s.screen} x=${s.px} score=${s.score} jumps=[${(s.jumps || []).slice(0, 12).join(',')}]`);
});
[1, 3].forEach(idx => {
  const s = botClear(idx, 3000);
  check(`บอทผ่านหมู่บ้าน ${idx}`, s.screen === 'clear', `screen=${s.screen} x=${s.px}`);
});

// ---------- 3. ด่านหมู่บ้านไม่มี NPC/ของขวัญแล้ว (กด X ตรงไหนก็ต้องไม่มีบทสนทนา) ----------
T.reset(1); T.run(5);
T.setP(20 * 16 - 6, 13 * 16 - 15); T.run(3);
T.key('KeyX', true); T.run(2); T.key('KeyX', false); T.run(2);
let s = T.snap();
check('หมู่บ้าน 1 ไม่มีบทสนทนา', s.talk === null, `talk=${s.talk}`);
T.setLives(2);
T.key('KeyX', true); T.run(2); T.key('KeyX', false); T.run(2);
s = T.snap();
check('กดซ้ำก็ไม่มีของ (ชีวิตยัง 2)', s.lives === 2, `lives=${s.lives}`);
T.reset(3); T.run(5);
T.setP(44 * 16 - 6, 13 * 16 - 15); T.run(3);
T.key('KeyX', true); T.run(2); T.key('KeyX', false); T.run(2);
s = T.snap();
check('หมู่บ้าน 3 ไม่มีแจกปืน (pow เริ่ม 2 จากด่าน)', s.ppow === 2, `pow=${s.ppow}`);

// ---------- 4. บอส: เหยียบ/ฟัน/ยิง + ธงล็อก ----------
// helper: วาร์ปไปข้างบอสแล้วหันหน้าใส่ (อ่านตำแหน่งบอสสดทุกครั้ง)
function faceBoss() {
  const s = T.snap();
  if (!s.boss || !s.boss.alive) return false;
  const px = s.px;
  T.setP(s.boss.bx + (px < s.boss.bx ? -22 : 34), 13 * 16 - 15);
  T.run(2);
  // หันหน้า: กดเดินเข้าหาบอส 2 เฟรม
  if (px < s.boss.bx) { T.key('ArrowRight', true); T.run(2); T.key('ArrowRight', false); }
  else { T.key('ArrowLeft', true); T.run(2); T.key('ArrowLeft', false); }
  T.run(2);
  return true;
}
T.reset(4); T.run(10);
T.setLives(9); // กันตายระหว่างเทสบอส (เทสระบบต่อสู้ ไม่ใช่เทสชีวิต)
T.givePow(0);
// เหยียบ: วางเหนือหัวบอสกำลังร่วง
T.setP(25 * 16, 100, 5); T.run(12);
s = T.snap();
check('เหยียบบอส HP 5→4', s.boss && s.boss.hp === 4, `hp=${s.boss && s.boss.hp}`);
T.run(70); // รอ iframes หมด
// ฟัน: ติดปืนออกก่อน (กันยิงแทนฟัน) แล้ววาร์ปฟันซ้ำจนลด
T.givePow(0);
let swordOK = false;
for (let k = 0; k < 8 && !swordOK; k++) {
  T.givePow(0);
  if (!faceBoss()) break;
  const before = T.snap().boss.hp;
  T.key('KeyX', true); T.run(2); T.key('KeyX', false); T.run(60);
  const after = T.snap();
  if (after.boss && after.boss.hp < before) swordOK = true;
  if (after.pdead) { T.run(200); } // ถ้าพลาดโดนชน รอเกิดใหม่แล้วลองใหม่
}
s = T.snap();
check('ฟันดาบบอสลด HP ได้', swordOK, `hp=${s.boss && s.boss.hp}`);
// ยิง: วาร์ปไกลๆ ยิงจนตาย
T.givePow(2);
let shotOK = false;
for (let k = 0; k < 12 && !shotOK; k++) {
  const b = T.snap().boss;
  if (!b || !b.alive) { shotOK = true; break; }
  T.givePow(2); // รีเฟรชปืนทุกครั้ง (กันตายแล้ว pow หาย)
  const me = T.snap();
  if (me.pdead) { T.run(200); continue; }
  T.setP(b.bx + (me.px < b.bx ? -70 : 70), 13 * 16 - 15);
  T.run(3);
  const b2 = T.snap().boss;
  if (me.px < b2.bx) { T.key('ArrowRight', true); T.run(1); T.key('ArrowRight', false); }
  else { T.key('ArrowLeft', true); T.run(1); T.key('ArrowLeft', false); }
  T.key('KeyC', true); T.run(2); T.key('KeyC', false); T.run(55);
  if (T.snap().pdead) T.run(200);
}
s = T.snap();
check('ยิงบอสตาย', s.boss && !s.boss.alive, `alive=${s.boss && s.boss.alive}`);
// ธงเปิดหลังบอสตาย → เดินไปธง
T.setP(30 * 16, 13 * 16 - 15); T.key('ArrowRight', true); T.run(250); T.key('ArrowRight', false);
s = T.snap();
check('แตะธงหลังบอสตาย = win', s.screen === 'win', `screen=${s.screen} score=${s.score}`);

// ---------- 5. ตาย → เกมโอเวอร์ → เริ่มใหม่ ----------
T.reset(0); T.setLives(1); T.run(3);
T.setP(31 * 16, 300); T.run(10); // โยนลงหลุม
s = T.snap();
check('ตกเหว lives 1 → over', s.screen === 'over', `screen=${s.screen} lives=${s.lives}`);
T.key('Enter', true); T.run(2); T.key('Enter', false); T.run(5);
s = T.snap();
check('Enter กลับหน้าแดชบอร์ด', s.screen === 'dash', `screen=${s.screen}`);

// ---------- 6. คอมโบ + ประตูล็อก + แดชบอร์ด ----------
// ยิงวอล์กเกอร์ 2 ตัวติดกัน → combo ต้องขึ้น (เล็งจากตำแหน่งจริงทุกนัด)
T.reset(0); T.run(5); T.givePow(2); T.god();
for (let k = 0; k < 4; k++) {
  const f = T.snap().foe;
  if (f === null) break;
  // เลือกฝั่งที่มีพื้น (กันวาร์ปตกหลุม)
  let tx = f - 60, faceR = true;
  if (T.tileAt(tx + 6, 13 * 16 + 4) === '.') { tx = f + 60; faceR = false; }
  T.setP(tx, 13 * 16 - 15); T.run(2);
  if (faceR) { T.key('ArrowRight', true); T.run(1); T.key('ArrowRight', false); }
  else { T.key('ArrowLeft', true); T.run(1); T.key('ArrowLeft', false); }
  T.key('KeyC', true); T.run(2); T.key('KeyC', false); T.run(40);
}
s = T.snap();
check('ยิง 2 ตัวติด combo ขึ้น', s.combo >= 2, `combo=${s.combo} score=${s.score}`);
// ยืนหน้าประตูตอนมินิบอสยังไม่ตาย → ต้องบล็อก
T.reset(0); T.run(5); T.god();
T.setP(95 * 16 - 4, 13 * 16 - 15); T.run(3);
s = T.snap();
check('ประตูบล็อกตอนมินิบอสยังไม่ตาย', s.screen === 'play', `screen=${s.screen}`);
// หน้าแดชบอร์ดมีครบ (ตรวจไฟล์)
const html = fs.readFileSync('index.html', 'utf8');
['id="dash"', 'btnStart', 'btnMute', 'btnFull', 'padstat', 'lvlbtn'].forEach(id => {
  check(`แดชบอร์ดมี ${id}`, html.includes(id));
});

// ---------- สรุป ----------
const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} ผ่าน =====`);
process.exit(pass === results.length ? 0 : 1);
