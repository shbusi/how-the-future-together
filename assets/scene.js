// 풍경 그리기: engine.js가 계산한 0~1 사이 값들(sea, heat, green ...)을
// 하나의 도시 풍경으로 그린다. 도시의 배치는 seed로 고정되고, 값이 바뀌면 부드럽게 변한다.
import { SCENE_KEYS } from './engine.js';

const W = 1200;
const H = 640;
const G = 470; // 지면 높이
const KEYS = [...SCENE_KEYS, 'modern']; // modern: 건물 양식 (0 = 1900년의 낮은 집, 1 = 오늘의 도시)

// ---------- 작은 도구들 ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function mix(a, b, t) {
  const A = Array.isArray(a) ? a : hex(a);
  const B = Array.isArray(b) ? b : hex(b);
  t = Math.min(1, Math.max(0, t));
  return A.map((v, i) => Math.round(v + (B[i] - v) * t));
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const smooth = (lo, hi, v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));

// ---------- 도시 배치 (seed마다 다른 도시) ----------
function makeLayout(seed) {
  const r = rng(seed);
  const ph = Array.from({ length: 6 }, () => r() * Math.PI * 2);
  const farHill = x => 330 + 26 * Math.sin(x * 0.0042 + ph[0]) + 14 * Math.sin(x * 0.011 + ph[1]);
  const nearHill = x => 398 + 18 * Math.sin(x * 0.0065 + ph[2]) + 9 * Math.sin(x * 0.019 + ph[3]);

  const buildings = [];
  for (let x = 24; x < W - 40;) {
    const w = 30 + r() * 46;
    if (Math.abs(x + w / 2 - W / 2) < 18) { x += 22; continue; } // 가운데는 벽 자리
    buildings.push({
      x, w,
      h0: 0.3 + r() * 0.7,
      kind: r() < 0.3 ? 'tower' : r() < 0.7 ? 'block' : 'slab',
      rank: r(),
      tone: Math.floor(r() * 5),
      greenP: r(), solarP: r(), techP: r(), decayP: r(), litSeed: Math.floor(r() * 1e6), oldP: r(),
    });
    x += w + r() * 12;
  }
  buildings.sort((a, b) => b.h0 - a.h0); // 높은 건물을 먼저(뒤에) 그린다

  return {
    seed, farHill, nearHill, buildings,
    turbines: Array.from({ length: 8 }, () => ({ x: 50 + r() * 1100, s: 0.7 + r() * 0.45, rank: r(), spin: r() * 6 })).sort((a, b) => a.rank - b.rank),
    clouds: Array.from({ length: 6 }, () => ({ x: r() * W, y: 50 + r() * 150, s: 0.6 + r() * 0.9, v: 4 + r() * 8 })),
    vehicles: Array.from({ length: 14 }, () => ({ x: r() * W, y: 110 + r() * 220, v: (18 + r() * 40) * (r() < 0.5 ? -1 : 1), rank: r() })).sort((a, b) => a.rank - b.rank),
    trees: Array.from({ length: 20 }, () => ({ x: 20 + r() * 1160, y: 498 + r() * 110, s: 0.7 + r() * 0.7, rank: r() })).sort((a, b) => a.rank - b.rank),
    people: Array.from({ length: 18 }, () => ({ x: 40 + r() * 1120, y: 512 + r() * 96, c: Math.floor(r() * 5), rank: r(), ph: r() * 6 })).sort((a, b) => a.rank - b.rank),
    plots: Array.from({ length: 4 }, () => ({ x: 60 + r() * 1000, y: 520 + r() * 70 })),
    boats: Array.from({ length: 3 }, () => ({ x: 100 + r() * 1000, ph: r() * 6 })),
    lights: { x: 140 + r() * 760 },
    stacks: Array.from({ length: 4 }, () => ({ x: 60 + r() * 1080, h: 90 + r() * 70, w: 70 + r() * 50, ph: r() * 6 })),
  };
}

// ---------- 그리기 ----------
const CONCRETE = ['#C7CDD0', '#B5BEC3', '#D3CEC5', '#A8B2B7', '#C2B8AA'];
const PEOPLE = ['#D2603F', '#2F6F8F', '#E0A93A', '#5B8F4E', '#8A5A9E'];

function drawScene(ctx, L, p, time, year) {
  // 하늘
  const skyTop = mix(mix('#4F9DE0', '#E07D45', p.heat * 0.85), '#76705F', p.smog * 0.8);
  const skyBot = mix(mix('#CBE8F7', '#F6D59C', p.heat * 0.9), '#BBAE93', p.smog * 0.8);
  const sky = ctx.createLinearGradient(0, 0, 0, G);
  sky.addColorStop(0, rgb(skyTop));
  sky.addColorStop(1, rgb(skyBot));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 해
  const sunR = 32 + p.heat * 20;
  const sunC = mix(mix('#FFF4CC', '#FFFFFF', p.heat), '#E8A35A', p.smog * 0.9);
  const glow = ctx.createRadialGradient(930, 140, sunR * 0.5, 930, 140, sunR * 4);
  glow.addColorStop(0, rgb(sunC, 0.55 - p.smog * 0.3));
  glow.addColorStop(1, rgb(sunC, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, G);
  ctx.fillStyle = rgb(sunC, 1 - p.smog * 0.35);
  ctx.beginPath();
  ctx.arc(930, 140, sunR, 0, Math.PI * 2);
  ctx.fill();

  // 구름 (오염이 심하면 흐려진다)
  for (const c of L.clouds) {
    const x = ((c.x + time * c.v) % (W + 240)) - 120;
    ctx.fillStyle = rgb(mix('#FFFFFF', '#CFC4AE', p.smog), 0.75 - p.smog * 0.35);
    for (const [dx, dy, rr] of [[0, 0, 26], [24, -10, 22], [48, 0, 24], [22, 6, 24]]) {
      ctx.beginPath();
      ctx.arc(x + dx * c.s, c.y + dy * c.s, rr * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 먼 언덕
  const greenHill = mix('#5E9A6B', '#A39069', 1 - p.green + p.heat * 0.3);
  ctx.fillStyle = rgb(mix(greenHill, skyBot, 0.5));
  ctx.beginPath();
  ctx.moveTo(0, G);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, L.farHill(x));
  ctx.lineTo(W, G);
  ctx.fill();

  // 풍력 발전기
  const turbines = Math.round(p.solar * L.turbines.length);
  for (let i = 0; i < turbines; i++) {
    const t = L.turbines[i];
    const baseY = L.farHill(t.x) + 4;
    const hgt = 70 * t.s;
    ctx.strokeStyle = rgb(mix('#F4F6F7', skyBot, 0.3));
    ctx.lineWidth = 2.4 * t.s;
    ctx.beginPath();
    ctx.moveTo(t.x, baseY);
    ctx.lineTo(t.x, baseY - hgt);
    ctx.stroke();
    ctx.lineWidth = 2 * t.s;
    for (let b = 0; b < 3; b++) {
      const a = time * 1.6 + t.spin + (b * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(t.x, baseY - hgt);
      ctx.lineTo(t.x + Math.cos(a) * 28 * t.s, baseY - hgt + Math.sin(a) * 28 * t.s);
      ctx.stroke();
    }
  }

  // 가까운 언덕
  ctx.fillStyle = rgb(mix(greenHill, skyBot, 0.25));
  ctx.beginPath();
  ctx.moveTo(0, G);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, L.nearHill(x));
  ctx.lineTo(W, G);
  ctx.fill();

  drawFactories(ctx, L, p, time);
  drawCity(ctx, L, p, time);

  // 땅
  const land = mix(mix('#7FA36B', '#B59D6C', 1 - p.green + p.heat * 0.4), '#8D8A80', p.decay * 0.5);
  ctx.fillStyle = rgb(land);
  ctx.fillRect(0, G, W, H - G);
  ctx.fillStyle = rgb(mix(mix('#5B6267', '#6E6A62', p.decay), '#8C7656', 1 - smooth(0.2, 0.6, p.modern)));
  ctx.fillRect(0, G, W, 12);

  // 격차의 벽: 땅을 가로질러 앞까지 이어진다
  if (p.divide > 0.45) {
    const a = smooth(0.45, 0.7, p.divide);
    const top = G - (30 + smooth(0.45, 1, p.divide) * 130);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgb(mix('#6B7176', '#55585A', p.decay));
    ctx.beginPath();
    ctx.moveTo(W / 2 - 10, top); ctx.lineTo(W / 2 + 10, top); ctx.lineTo(W / 2 + 22, H); ctx.lineTo(W / 2 - 22, H);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.moveTo(W / 2 + 3, top); ctx.lineTo(W / 2 + 10, top); ctx.lineTo(W / 2 + 22, H); ctx.lineTo(W / 2 + 8, H);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    for (let y = top + 14; y < H; y += 18) {
      const k = (y - top) / (H - top);
      ctx.beginPath(); ctx.moveTo(W / 2 - 10 - 12 * k, y); ctx.lineTo(W / 2 + 10 + 12 * k, y); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#2B2B2B' : '#E8C547';
      ctx.fillRect(W / 2 - 10 + i * 5, top - 4, 5, 5);
    }
    ctx.strokeStyle = 'rgba(40,40,40,0.8)';
    ctx.beginPath();
    for (let x = W / 2 - 12; x <= W / 2 + 12; x += 3) ctx.lineTo(x, top - 7 - (x % 2 ? 3 : 0));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 공동 텃밭
  const plots = Math.round(smooth(0.4, 0.95, p.community) * L.plots.length);
  for (let i = 0; i < plots; i++) {
    const { x, y } = L.plots[i];
    ctx.fillStyle = rgb([128, 92, 60]);
    ctx.fillRect(x, y, 96, 30);
    ctx.fillStyle = rgb([92, 160, 80]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
      ctx.beginPath();
      ctx.arc(x + 7 + c * 11.5, y + 6 + r * 9, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 나무
  const trees = Math.round(p.green * L.trees.length);
  const crown = mix(mix('#3F8A4F', '#9A9A50', p.heat * 0.7), '#6F7660', p.smog * 0.4);
  for (let i = 0; i < trees; i++) {
    const t = L.trees[i];
    ctx.fillStyle = rgb([96, 72, 52]);
    ctx.fillRect(t.x - 2 * t.s, t.y - 14 * t.s, 4 * t.s, 14 * t.s);
    ctx.fillStyle = rgb(crown);
    ctx.beginPath();
    ctx.arc(t.x, t.y - 22 * t.s, 13 * t.s, 0, Math.PI * 2);
    ctx.arc(t.x - 8 * t.s, t.y - 15 * t.s, 9 * t.s, 0, Math.PI * 2);
    ctx.arc(t.x + 8 * t.s, t.y - 15 * t.s, 9 * t.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 마을 식탁과 줄전구
  if (p.community > 0.6) {
    const a = smooth(0.6, 0.8, p.community);
    const x0 = L.lights.x;
    const x1 = x0 + 190;
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgb([70, 60, 50]);
    ctx.lineWidth = 3;
    for (const x of [x0, x1]) { ctx.beginPath(); ctx.moveTo(x, 560); ctx.lineTo(x, 506); ctx.stroke(); }
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) ctx.lineTo(x0 + (i / 20) * 190, 508 + Math.sin((i / 20) * Math.PI) * 18);
    ctx.stroke();
    for (let i = 1; i < 20; i += 2) {
      ctx.fillStyle = rgb([255, 214, 120], 0.6 + 0.4 * Math.sin(time * 3 + i));
      ctx.beginPath();
      ctx.arc(x0 + (i / 20) * 190, 511 + Math.sin((i / 20) * Math.PI) * 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgb([150, 104, 66]);
    ctx.fillRect(x0 + 40, 546, 110, 7);
    ctx.fillRect(x0 + 48, 553, 5, 10);
    ctx.fillRect(x0 + 137, 553, 5, 10);
    ctx.globalAlpha = 1;
  }

  // 사람들
  const people = Math.round(1 + p.community * 11 + p.density * 4 - p.heat * 4 - p.decay * 3);
  for (let i = 0; i < Math.min(L.people.length, Math.max(0, people)); i++) {
    const q = L.people[i];
    const bob = Math.sin(time * 4 + q.ph) * 0.8;
    ctx.fillStyle = PEOPLE[q.c];
    ctx.beginPath();
    ctx.roundRect(q.x - 3, q.y - 10 + bob, 6, 10, 2.5);
    ctx.fill();
    ctx.fillStyle = '#3B2E28';
    ctx.beginPath();
    ctx.arc(q.x, q.y - 13.5 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 물 (해수면)
  const waterY = H - 26 - p.sea * (H - 26 - (G - 72));
  const water = mix('#3B83B4', '#5E7A68', Math.max(p.smog, p.decay) * 0.7);
  const wg = ctx.createLinearGradient(0, waterY, 0, H);
  wg.addColorStop(0, rgb(mix(water, '#FFFFFF', 0.12), 0.93));
  wg.addColorStop(1, rgb(mix(water, '#0D2A3F', 0.35), 0.97));
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) ctx.lineTo(x, waterY + Math.sin(x * 0.03 + time * 1.4) * 2.2);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    const y = waterY + 10 + ((i * 37) % Math.max(10, H - waterY - 12));
    const x = ((i * 173 + time * (10 + (i % 4) * 6)) % (W + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26 + (i % 3) * 10, y);
    ctx.stroke();
  }
  // 배
  if (p.sea > 0.4) {
    const boats = Math.round(smooth(0.4, 0.8, p.sea) * L.boats.length);
    for (let i = 0; i < boats; i++) {
      const b = L.boats[i];
      const y = waterY + 4 + Math.sin(time * 2 + b.ph) * 1.5;
      ctx.fillStyle = '#7A4E36';
      ctx.beginPath();
      ctx.moveTo(b.x - 18, y - 6); ctx.lineTo(b.x + 18, y - 6); ctx.lineTo(b.x + 12, y); ctx.lineTo(b.x - 12, y);
      ctx.fill();
      ctx.fillStyle = '#F2EEE6';
      ctx.beginPath();
      ctx.moveTo(b.x, y - 30); ctx.lineTo(b.x, y - 8); ctx.lineTo(b.x + 14, y - 8);
      ctx.fill();
    }
  }

  // 돔
  if (p.dome > 0.04) {
    const a = smooth(0.04, 0.5, p.dome);
    const dg = ctx.createRadialGradient(600, 160, 40, 600, 300, 620);
    dg.addColorStop(0, `rgba(225,245,255,${0.20 * a})`);
    dg.addColorStop(1, `rgba(170,215,240,${0.08 * a})`);
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(600, G + 10, 560, 420, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = `rgba(235,248,255,${0.75 * a})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 0.8;
    for (const k of [0.3, 0.6, 0.85]) {
      ctx.beginPath();
      ctx.ellipse(600, G + 10, 560 * k, 420, 0, Math.PI, 0);
      ctx.stroke();
    }
    for (const k of [0.4, 0.75]) {
      ctx.beginPath();
      ctx.ellipse(600, G + 10, 560, 420 * k, 0, Math.PI, 0);
      ctx.stroke();
    }
  }

  // 공기
  if (p.smog > 0.05) {
    const sg = ctx.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0, `rgba(120,104,78,${p.smog * 0.12})`);
    sg.addColorStop(0.65, `rgba(150,128,92,${p.smog * 0.38})`);
    sg.addColorStop(1, `rgba(120,104,78,${p.smog * 0.15})`);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }
  if (p.heat > 0.3) {
    ctx.fillStyle = `rgba(255,120,40,${(p.heat - 0.3) * 0.1})`;
    ctx.fillRect(0, 0, W, H);
  }

  // 연도 도장
  ctx.fillStyle = 'rgba(12,22,28,0.55)';
  ctx.beginPath();
  ctx.roundRect(22, H - 66, 132, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 30px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(year), 40, H - 43);
}

// 옛 도시: 낮은 벽돌집, 나무집, 기와·초가 지붕
const OLD_WALL = ['#9E5B44', '#8A6A4C', '#CDBFA6', '#A7714F', '#B9A487'];
const OLD_ROOF = ['#4E4440', '#5B4636', '#A08550', '#3F3A3A', '#6B4B3A'];
function drawOldHouse(ctx, b, p, broken, time) {
  const h = (26 + b.h0 * 46) * (0.85 + p.density * 0.5);
  const top = G - h;
  const ruin = broken * (b.decayP < 0.7 ? 1 : 0.3);
  ctx.fillStyle = rgb(mix(OLD_WALL[b.tone], '#6F6A62', ruin * 0.6));
  ctx.fillRect(b.x, top, b.w, h);
  // 창 두세 개
  const n = Math.max(1, Math.floor(b.w / 18));
  for (let i = 0; i < n; i++) {
    const lit = ((b.litSeed >> i) & 3) === 0;
    ctx.fillStyle = ruin > 0.5 && i % 2 ? 'rgba(30,30,30,0.85)' : lit ? 'rgba(255,214,130,0.9)' : 'rgba(55,60,62,0.6)';
    ctx.fillRect(b.x + 6 + i * ((b.w - 12) / n), top + h * 0.35, 6, 8);
  }
  if (ruin > 0.45 && b.decayP < 0.55) {
    // 무너진 지붕
    ctx.fillStyle = rgb(OLD_ROOF[b.tone]);
    ctx.beginPath();
    ctx.moveTo(b.x - 3, top + 2); ctx.lineTo(b.x + b.w * 0.3, top - 8); ctx.lineTo(b.x + b.w * 0.45, top + 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = rgb(OLD_ROOF[b.tone]);
  ctx.beginPath();
  ctx.moveTo(b.x - 5, top + 3);
  ctx.quadraticCurveTo(b.x + b.w / 2, top - 4 - b.w * 0.18, b.x + b.w + 5, top + 3);
  ctx.lineTo(b.x + b.w / 2, top - 6 - b.w * 0.28);
  ctx.fill();
  // 굴뚝 연기 (집 몇 채만)
  if (b.greenP < 0.3) {
    ctx.fillStyle = '#5A4A42';
    ctx.fillRect(b.x + b.w * 0.7, top - 14, 5, 12);
    ctx.fillStyle = 'rgba(200,200,200,0.35)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(b.x + b.w * 0.7 + 3 + k * 4 + Math.sin(time + k) * 2, top - 20 - k * 8, 3 + k * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 공장 굴뚝 (산업화 시대, 또는 기후 대응을 놓친 미래)
function drawFactories(ctx, L, p, time) {
  const n = Math.round(smooth(0.15, 0.85, p.industry) * L.stacks.length);
  for (let i = 0; i < n; i++) {
    const f = L.stacks[i];
    const shed = mix('#7D7570', '#8A6A55', 1 - p.modern);
    ctx.fillStyle = rgb(shed);
    ctx.beginPath();
    ctx.moveTo(f.x, G);
    ctx.lineTo(f.x, G - 34);
    for (let k = 0; k < 4; k++) {
      ctx.lineTo(f.x + (f.w / 4) * k + f.w / 8, G - 48);
      ctx.lineTo(f.x + (f.w / 4) * (k + 1), G - 34);
    }
    ctx.lineTo(f.x + f.w, G);
    ctx.fill();
    const sx = f.x + f.w * 0.75;
    ctx.fillStyle = rgb(mix('#6C625C', '#8E4F3A', 1 - p.modern));
    ctx.fillRect(sx, G - f.h, 10, f.h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(sx, G - f.h + 12, 10, 3);
    // 연기
    for (let k = 0; k < 7; k++) {
      const age = ((time * 0.35 + k / 7 + f.ph) % 1);
      const r = 6 + age * 26;
      ctx.fillStyle = `rgba(${Math.round(110 + age * 60)},${Math.round(104 + age * 50)},${Math.round(96 + age * 40)},${(1 - age) * 0.45})`;
      ctx.beginPath();
      ctx.arc(sx + 5 + age * 90, G - f.h - 8 - age * 70, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCity(ctx, L, p, time) {
  const visible = Math.round(L.buildings.length * (0.35 + 0.65 * p.density));
  const split = smooth(0.3, 1, p.divide);
  const broken = smooth(0.25, 0.9, p.decay);
  const towers = [];

  // 순위(rank)가 낮은 건물부터 보이도록, 그리는 순서는 높이순 유지
  const cutoff = [...L.buildings].sort((a, b) => a.rank - b.rank)[Math.max(0, visible - 1)]?.rank ?? 1;

  for (const b of L.buildings) {
    if (b.rank > cutoff) continue;
    if (b.oldP >= p.modern) { drawOldHouse(ctx, b, p, broken, time); continue; }
    const rich = b.x + b.w / 2 > W / 2;
    let h = (60 + b.h0 * 240) * (0.55 + 0.75 * p.density);
    let shack = false;
    if (rich) h *= 1 + 0.65 * split;
    else {
      h *= 1 - 0.5 * split;
      if (split > 0.45 && b.h0 < 0.65) { h = 34 + b.h0 * 40; shack = true; }
    }
    h = Math.min(h, G - 50);
    const top = G - h;
    const glass = rich && (p.tech > 0.45 || split > 0.4) ? smooth(0.35, 0.8, Math.max(p.tech, split)) : 0;
    const ruin = !rich || split < 0.4 ? broken * (b.decayP < 0.7 ? 1 : 0.3) : broken * 0.2;
    let body = mix(mix(CONCRETE[b.tone], '#5F98B2', glass * 0.85), '#7E7B74', ruin * 0.7);
    body = mix(body, '#D9B48A', p.heat * 0.15);
    ctx.fillStyle = rgb(body);

    // 건물 몸통
    ctx.beginPath();
    if (ruin > 0.45 && b.decayP < 0.55) {
      // 무너진 지붕
      ctx.moveTo(b.x, G);
      ctx.lineTo(b.x, top + h * 0.08);
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        const jag = ((b.litSeed >> i) & 7) / 7;
        ctx.lineTo(b.x + (b.w * i) / steps, top + h * (0.04 + jag * 0.22));
      }
      ctx.lineTo(b.x + b.w, G);
    } else if (b.kind === 'tower' && !shack) {
      ctx.rect(b.x, top + 18, b.w, h - 18);
      ctx.rect(b.x + b.w * 0.18, top, b.w * 0.64, 19);
    } else {
      ctx.rect(b.x, top, b.w, h);
    }
    ctx.fill();

    if (shack) {
      ctx.fillStyle = rgb(mix('#8C5B3E', '#6F6A62', ruin));
      ctx.beginPath();
      ctx.moveTo(b.x - 4, top + 2); ctx.lineTo(b.x + b.w / 2, top - 12); ctx.lineTo(b.x + b.w + 4, top + 2);
      ctx.fill();
    }

    // 창문
    const lit = 0.12 + p.community * 0.35 - ruin * 0.25;
    const rr = rng(b.litSeed);
    if (glass > 0.5 && !shack) {
      ctx.fillStyle = `rgba(220,245,255,${0.35 + 0.2 * glass})`;
      for (let y = top + 24; y < G - 8; y += 10) ctx.fillRect(b.x + 3, y, b.w - 6, 2);
    } else {
      const cols = Math.max(1, Math.floor((b.w - 8) / 10));
      const rows = Math.max(1, Math.floor((h - (shack ? 12 : 26)) / 13));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const on = rr() < lit;
        const dead = rr() < ruin * 0.6;
        ctx.fillStyle = dead ? 'rgba(30,30,30,0.85)' : on ? 'rgba(255,214,130,0.95)' : 'rgba(55,70,80,0.55)';
        ctx.fillRect(b.x + 5 + c * 10, top + (shack ? 8 : 24) + r * 13, 5, 7);
      }
    }

    if (ruin > 0.3) {
      // 덩굴
      ctx.strokeStyle = `rgba(80,110,60,${ruin * 0.8})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + 4, G);
      for (let y = G; y > G - h * 0.6 * ruin; y -= 8) ctx.lineTo(b.x + 4 + Math.sin(y * 0.2) * 3, y);
      ctx.stroke();
    }

    if (ruin < 0.45 && !shack) {
      const roof = b.kind === 'tower' ? top : top;
      const rx = b.kind === 'tower' ? b.x + b.w * 0.18 : b.x;
      const rw = b.kind === 'tower' ? b.w * 0.64 : b.w;
      // 태양광
      if (b.solarP < p.solar) {
        ctx.fillStyle = '#26466A';
        for (let x = rx + 2; x < rx + rw - 8; x += 9) {
          ctx.beginPath();
          ctx.moveTo(x, roof); ctx.lineTo(x + 7, roof); ctx.lineTo(x + 5, roof - 5); ctx.lineTo(x - 1, roof - 5);
          ctx.fill();
        }
      } else if (b.greenP < p.green * 0.9) {
        // 옥상 정원
        ctx.fillStyle = rgb(mix('#4E9A55', '#8E9A4E', p.heat * 0.6));
        for (let x = rx + 5; x < rx + rw - 2; x += 9) {
          ctx.beginPath();
          ctx.arc(x, roof - 3, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 벽면 숲
      if (p.green > 0.6 && b.greenP < (p.green - 0.6) * 2.2 && !glass) {
        ctx.fillStyle = 'rgba(70,140,80,0.85)';
        for (let y = top + 30; y < G - 10; y += 26) {
          ctx.beginPath();
          ctx.arc(b.x + (y % 2 ? 4 : b.w - 4), y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 안테나와 빛 띠
      if (p.tech > 0.5 && b.techP < p.tech) {
        ctx.strokeStyle = 'rgba(40,50,58,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx + rw / 2, roof);
        ctx.lineTo(rx + rw / 2, roof - 18);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,80,80,${0.5 + 0.5 * Math.sin(time * 3 + b.techP * 9)})`;
        ctx.beginPath();
        ctx.arc(rx + rw / 2, roof - 19, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(90,230,230,0.7)';
        ctx.fillRect(b.x + b.w - 3, top + 20, 2, h - 30);
      }
    }
    if (rich && h > 220) towers.push({ x: b.x, w: b.w, top });
  }

  // 구름다리
  if (p.tech > 0.5 && split > 0.3 && towers.length > 1) {
    towers.sort((a, b) => a.x - b.x);
    ctx.strokeStyle = 'rgba(210,235,245,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < towers.length - 1; i++) {
      const a = towers[i];
      const b = towers[i + 1];
      const y = Math.max(a.top, b.top) + 40;
      if (b.x - (a.x + a.w) > 160) continue;
      ctx.beginPath();
      ctx.moveTo(a.x + a.w, y);
      ctx.lineTo(b.x, y);
      ctx.stroke();
    }
  }

  // 자기부상열차
  if (p.tech > 0.42) {
    const a = smooth(0.42, 0.6, p.tech);
    const y = G - 74;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#DDE3E6';
    ctx.fillRect(0, y, W, 6);
    for (let x = 40; x < W; x += 110) ctx.fillRect(x, y + 6, 6, G - y - 6);
    const tx = ((time * 140) % (W + 600)) - 300;
    ctx.fillStyle = '#F7FAFB';
    ctx.beginPath();
    ctx.roundRect(tx, y - 16, 240, 15, [9, 3, 3, 9]);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,140,160,0.9)';
    ctx.fillRect(tx + 14, y - 12, 210, 4);
    ctx.globalAlpha = 1;
  }

  // 비행체
  const vehicles = Math.round(smooth(0.35, 1, p.tech) * L.vehicles.length);
  for (let i = 0; i < vehicles; i++) {
    const v = L.vehicles[i];
    const x = (((v.x + time * v.v) % (W + 80)) + W + 80) % (W + 80) - 40;
    ctx.fillStyle = '#2F3A42';
    ctx.beginPath();
    ctx.ellipse(x, v.y, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,230,240,0.95)';
    ctx.beginPath();
    ctx.ellipse(x + (v.v > 0 ? 5 : -5), v.y - 2, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - Math.sign(v.v) * 14, v.y);
    ctx.lineTo(x - Math.sign(v.v) * 40, v.y);
    ctx.stroke();
  }
}

// ---------- 공개 API ----------
export function createScene(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let layout = makeLayout(20261117);
  let current = null;
  let target = null;
  let year = 2060;
  let time = 0;
  let last = 0;
  let raf = 0;
  let visible = true;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round((canvas.clientWidth || W) * dpr);
    if (canvas.width !== w) {
      canvas.width = w;
      canvas.height = Math.round((w * H) / W);
    }
  }

  function paint() {
    resize();
    const s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    drawScene(ctx, layout, current, time, year);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    time += dt;
    let moving = false;
    for (const k of KEYS) {
      const d = target[k] - current[k];
      if (Math.abs(d) > 0.002) { current[k] += d * Math.min(1, dt * 5); moving = true; } else current[k] = target[k];
    }
    paint();
    if (visible && (!reducedMotion || moving)) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!current) return;
    if (reducedMotion) {
      current = { ...target };
      paint();
      return;
    }
    if (!raf && visible) { last = 0; raf = requestAnimationFrame(frame); }
  }

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && !document.hidden;
    if (visible) kick();
  }) : null;
  io?.observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) kick();
  });
  window.addEventListener('resize', () => current && paint());

  return {
    update(params, y) {
      target = { ...params };
      year = y;
      if (!current) { current = { ...params }; paint(); }
      kick();
    },
    reroll() {
      layout = makeLayout(Math.floor(Math.random() * 1e9));
      if (current) paint();
      kick();
    },
    toDataURL() {
      current = { ...target };
      paint();
      return canvas.toDataURL('image/png');
    },
  };
}
