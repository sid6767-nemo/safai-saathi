// Small drawings of everyday street litter, packed side by side into one canvas that the home
// backdrop uses as a texture: each drifting scrap shows one of these, slowly tumbling.
// Everything is drawn in a -1..1 box and kept inside the unit circle, so a spinning sprite is
// never clipped.

const CELL = 128;

// Seeded randomness, so the same bag crumples the same way on every visit.
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A crumpled outline: many points at slightly random distances, joined with straight edges.
function crumple(ctx, rand, { points = 20, wobble = 0.24, rx = 0.78, ry = 0.62 } = {}) {
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 1 - wobble / 2 + rand() * wobble;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function creases(ctx, rand, count, colour, spread = 0.5) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 0.035;
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * spread * 2;
    const y = (rand() - 0.5) * spread * 1.4;
    const a = rand() * Math.PI;
    const l = 0.12 + rand() * 0.22;
    line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
}

function bottle(ctx) {
  ctx.rotate(-0.5);
  const body = ctx.createLinearGradient(0, -0.3, 0, 0.3);
  body.addColorStop(0, 'rgba(200, 234, 242, 0.95)');
  body.addColorStop(0.5, 'rgba(142, 198, 216, 0.9)');
  body.addColorStop(1, 'rgba(92, 156, 182, 0.95)');
  ctx.fillStyle = body;
  ctx.strokeStyle = 'rgba(52, 104, 126, 0.95)';
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(-0.76, -0.24);
  ctx.quadraticCurveTo(-0.84, 0, -0.76, 0.24);
  ctx.lineTo(0.2, 0.26);
  ctx.quadraticCurveTo(0.48, 0.26, 0.58, 0.11);
  ctx.lineTo(0.7, 0.1);
  ctx.lineTo(0.7, -0.1);
  ctx.lineTo(0.58, -0.11);
  ctx.quadraticCurveTo(0.48, -0.26, 0.2, -0.26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e0453b';
  ctx.fillRect(-0.42, -0.25, 0.38, 0.5);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillRect(-0.42, -0.04, 0.38, 0.07);
  ctx.fillStyle = '#2f6fd6';
  roundRect(ctx, 0.7, -0.15, 0.17, 0.3, 0.04);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 0.05;
  line(ctx, -0.68, -0.15, 0.2, -0.17);
  ctx.strokeStyle = 'rgba(40, 90, 110, 0.55)';
  ctx.lineWidth = 0.03;
  line(ctx, 0.02, -0.24, 0.12, 0.2);
  line(ctx, -0.6, -0.22, -0.52, 0.18);
}

function bag(ctx, rand, fill, edge, crease) {
  ctx.rotate(rand() * Math.PI);
  // Handles first, so the bag body covers where they join.
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.ellipse(-0.28, -0.52, 0.16, 0.2, -0.3, Math.PI * 0.9, Math.PI * 2.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0.26, -0.5, 0.15, 0.19, 0.3, Math.PI * 0.9, Math.PI * 2.1);
  ctx.stroke();
  crumple(ctx, rand, { points: 22, wobble: 0.3, rx: 0.74, ry: 0.56 });
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.04;
  ctx.stroke();
  creases(ctx, rand, 7, crease);
}

function can(ctx) {
  ctx.rotate(0.4);
  const g = ctx.createLinearGradient(0, -0.32, 0, 0.32);
  g.addColorStop(0, '#f2675c');
  g.addColorStop(0.45, '#c8261f');
  g.addColorStop(1, '#7e1410');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-0.55, -0.3);
  ctx.lineTo(-0.1, -0.3);
  ctx.lineTo(0.02, -0.14);
  ctx.lineTo(0.12, -0.3);
  ctx.lineTo(0.55, -0.28);
  ctx.lineTo(0.55, 0.28);
  ctx.lineTo(0.12, 0.3);
  ctx.lineTo(0.0, 0.1);
  ctx.lineTo(-0.12, 0.3);
  ctx.lineTo(-0.55, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#cfd3d8';
  ctx.beginPath();
  ctx.ellipse(-0.55, 0, 0.08, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.55, 0, 0.08, 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(-0.4, 0.12);
  ctx.bezierCurveTo(-0.2, -0.12, 0.2, 0.16, 0.42, -0.08);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 10, 8, 0.6)';
  ctx.lineWidth = 0.035;
  line(ctx, 0.02, -0.14, 0.0, 0.1);
}

function cup(ctx) {
  ctx.rotate(-0.25);
  ctx.fillStyle = '#f3ede2';
  ctx.strokeStyle = '#b3a489';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-0.52, -0.2);
  ctx.lineTo(0.42, -0.36);
  ctx.lineTo(0.42, 0.36);
  ctx.lineTo(-0.52, 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath();
  ctx.moveTo(0.22, -0.33);
  ctx.lineTo(0.32, -0.345);
  ctx.lineTo(0.32, 0.345);
  ctx.lineTo(0.22, 0.33);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e6dccb';
  ctx.beginPath();
  ctx.ellipse(0.42, 0, 0.1, 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(150, 96, 44, 0.85)';
  ctx.beginPath();
  ctx.ellipse(0.43, 0.02, 0.06, 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

function chips(ctx) {
  ctx.rotate(0.6);
  const g = ctx.createLinearGradient(-0.6, -0.4, 0.6, 0.4);
  g.addColorStop(0, '#ffd23a');
  g.addColorStop(1, '#ff8a00');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#c86a00';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.6, -0.36);
  ctx.quadraticCurveTo(0, -0.46, 0.6, -0.36);
  for (let i = 0; i <= 6; i++) ctx.lineTo(i % 2 ? 0.7 : 0.62, -0.36 + (i * 0.72) / 6);
  ctx.quadraticCurveTo(0, 0.46, -0.6, 0.36);
  for (let i = 0; i <= 6; i++) ctx.lineTo(i % 2 ? -0.7 : -0.62, 0.36 - (i * 0.72) / 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d6241f';
  ctx.beginPath();
  ctx.arc(-0.05, 0, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.18, 0.02);
  ctx.quadraticCurveTo(-0.05, -0.1, 0.08, 0.02);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 0.04;
  line(ctx, -0.45, -0.25, 0.4, -0.3);
}

function banana(ctx, rand) {
  ctx.rotate(rand() * Math.PI * 2);
  const petal = (angle, length) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#f2c94c';
    ctx.strokeStyle = '#a97d22';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(0, -0.08);
    ctx.bezierCurveTo(length * 0.45, -0.22, length * 0.85, -0.12, length, 0);
    ctx.bezierCurveTo(length * 0.85, 0.12, length * 0.45, 0.2, 0, 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6b4a1e';
    ctx.beginPath();
    ctx.arc(length * 0.93, 0, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 82, 30, 0.6)';
    ctx.beginPath();
    ctx.arc(length * 0.5, 0.03, 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  petal(-0.3, 0.78);
  petal(1.9, 0.66);
  petal(3.9, 0.72);
  ctx.fillStyle = '#5b3d17';
  roundRect(ctx, -0.1, -0.08, 0.2, 0.16, 0.05);
  ctx.fill();
}

function cardboard(ctx, rand) {
  ctx.rotate(rand() * Math.PI);
  crumple(ctx, rand, { points: 9, wobble: 0.45, rx: 0.72, ry: 0.58 });
  ctx.fillStyle = '#c9a46c';
  ctx.fill();
  ctx.strokeStyle = '#8f6a36';
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(120, 85, 40, 0.45)';
  ctx.lineWidth = 0.03;
  for (let x = -0.8; x < 0.8; x += 0.12) line(ctx, x, -0.7, x + 0.25, 0.7);
  ctx.fillStyle = 'rgba(230, 210, 170, 0.75)';
  ctx.fillRect(-0.8, -0.1, 1.6, 0.16);
  ctx.restore();
}

function milkPacket(ctx) {
  ctx.rotate(-0.7);
  ctx.fillStyle = '#f7f8fa';
  ctx.strokeStyle = '#b9c0ca';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.34);
  ctx.lineTo(0.36, -0.34);
  ctx.lineTo(0.5, -0.2);
  ctx.lineTo(0.5, 0.34);
  ctx.lineTo(-0.5, 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2a62c9';
  ctx.beginPath();
  ctx.moveTo(-0.6, 0.05);
  ctx.lineTo(0.6, -0.12);
  ctx.lineTo(0.6, 0.12);
  ctx.lineTo(-0.6, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(80, 90, 110, 0.55)';
  ctx.fillRect(-0.36, -0.22, 0.5, 0.05);
  ctx.fillRect(-0.36, -0.12, 0.34, 0.04);
}

const SPRITES = [
  (ctx) => bottle(ctx),
  (ctx, rand) => bag(ctx, rand, 'rgba(246, 246, 240, 0.88)', 'rgba(160, 160, 152, 0.95)', 'rgba(150, 150, 140, 0.6)'),
  (ctx, rand) => bag(ctx, rand, 'rgba(74, 132, 212, 0.88)', 'rgba(36, 80, 150, 0.95)', 'rgba(25, 60, 120, 0.55)'),
  (ctx) => can(ctx),
  (ctx) => cup(ctx),
  (ctx) => chips(ctx),
  (ctx, rand) => banana(ctx, rand),
  (ctx, rand) => cardboard(ctx, rand),
  (ctx) => milkPacket(ctx),
];

let atlas = null;

// One canvas, one cell per sprite; `spriteCount` tells the shader how to index it.
export function litterAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * SPRITES.length;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  SPRITES.forEach((draw, i) => {
    ctx.save();
    ctx.translate(CELL * i + CELL / 2, CELL / 2);
    ctx.scale(CELL * 0.46, CELL * 0.46);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx, seeded(1000 + i * 97));
    ctx.restore();
  });
  canvas.spriteCount = SPRITES.length;
  atlas = canvas;
  return atlas;
}
