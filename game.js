'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

window.addEventListener('keydown', (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

// Forma fija para asteroide grande (radio unitario, se escala por RADII[3])
const LARGE_SHAPE = [
  [-0.04, -1.00], [ 0.51, -0.82], [ 0.40, -0.20], [ 0.99, -0.03],
  [ 0.82,  0.62], [ 0.31,  0.59], [ 0.07,  1.00], [-0.65,  0.65],
  [-0.99,  0.06], [-0.82, -0.59],
];
const LARGE_SHAPE_CHANCE = 0.33;

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    if (size === 3 && Math.random() < LARGE_SHAPE_CHANCE) {
      // Forma fija (variante especial de asteroide grande)
      this.verts = LARGE_SHAPE.map(([x, y]) => [x * this.radius, y * this.radius]);
    } else {
      // Polígono irregular
      const n = randInt(8, 13);
      this.verts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = this.radius * rand(0.6, 1.0);
        this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw(slowed = false) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = slowed ? '#f88' : '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
const SHIELD_RADIUS = 24;
const SLOW_FACTOR   = 0.5;
const SLOW_DURATION = 6;
const NOVA_MIN_ASTEROIDS = 10;   // "muchos asteroides"
const HYPER_DURATION    = 8;
const HYPER_THRUST_MULT = 2.5;
const HYPER_DRAG        = 0.993;
const HYPER_ROT_MULT    = 1.4;

class Ship {
  constructor() {
    this.tripleShot  = 0;
    this.shield      = 0;
    this.slowMotion  = 0;
    this.novaBomb    = false;
    this.hyperThrust = 0;
    this.reset();
  }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting     = false;
    this.invincible    = 3;
    this.shootCooldown = 0;
    this.dead          = false;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible    > 0) this.invincible    -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.tripleShot    > 0) this.tripleShot    -= dt;
    if (this.shield        > 0) this.shield        -= dt;
    if (this.slowMotion    > 0) this.slowMotion    -= dt;
    if (this.hyperThrust   > 0) this.hyperThrust   -= dt;

    const hyper  = this.hyperThrust > 0;
    const ROT    = 3.5 * (hyper ? HYPER_ROT_MULT : 1);     // rad/s
    const THRUST = 260 * (hyper ? HYPER_THRUST_MULT : 1);  // px/s²
    const DRAG   = hyper ? HYPER_DRAG : 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      this.vx += Math.cos(this.angle) * THRUST * dt;
      this.vy += Math.sin(this.angle) * THRUST * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oy = this.y + Math.sin(this.angle) * NOSE;
    if (this.tripleShot > 0) {
      const SPREAD = 0.2;
      return [
        new Bullet(ox, oy, this.angle - SPREAD),
        new Bullet(ox, oy, this.angle),
        new Bullet(ox, oy, this.angle + SPREAD),
      ];
    }
    return [new Bullet(ox, oy, this.angle)];
  }

  draw() {
    if (this.dead) return;

    if (this.shield > 0 && !(this.shield < 1 && Math.floor(this.shield * 8) % 2 === 0)) {
      const alpha = 0.55 + 0.35 * Math.sin(this.shield * 10);
      ctx.save();
      ctx.strokeStyle = `rgba(80,170,255,${alpha.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, SHIELD_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta clásica: triángulo con muesca trasera
    ctx.beginPath();
    ctx.moveTo( 20,  0);   // nariz
    ctx.lineTo(-12, -9);   // ala izquierda
    ctx.lineTo( -7,  0);   // muesca trasera
    ctx.lineTo(-12,  9);   // ala derecha
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor
    if (this.thrusting && Math.random() > 0.35) {
      const hyper = this.hyperThrust > 0;
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - (hyper ? rand(16, 30) : rand(6, 14)), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = hyper ? 'rgba(255, 0, 255, 0.9)' : 'rgba(255, 130, 0, 0.85)';
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y) {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
  }
}

// ── PowerUp (disparo triple / escudo temporal) ───────────────────────────────
class PowerUp {
  constructor(x, y, type = 'triple') {
    this.x = x;
    this.y = y;
    this.type = type;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(15, 30);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 10;
    this.rot = 0;
    this.ttl = 8;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.rot += 1.5 * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;
    const STYLE = {
      triple: { color: '#0ff', label: '3',  font: 'bold 13px monospace' },
      shield: { color: '#4af', label: 'S',  font: 'bold 13px monospace' },
      slow:   { color: '#f44', label: 'SM', font: 'bold 10px monospace' },
      nova:   { color: '#fa0', label: 'N',  font: 'bold 13px monospace' },
      hyper:  { color: '#f0f', label: 'H',  font: 'bold 13px monospace' },
    };
    const { color, label, font } = STYLE[this.type];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, this.x, this.y + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

// ── Onda de la Bomba Nova ─────────────────────────────────────────────────────
class NovaWave {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 0.6;
    this.ttl  = this.life;
    this.dead = false;
    this.maxRadius = Math.hypot(W, H);
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const t = 1 - Math.max(this.ttl, 0) / this.life;
    const radius = t * this.maxRadius;
    const alpha  = 1 - t;
    ctx.save();
    ctx.strokeStyle = `rgba(255,170,0,${alpha.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;
let killCount, powerUpDropAt, shieldDropAt, slowDropAt, hyperDropAt, novaDropPending;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerUps  = [];
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  scheduleDrops();
  spawnAsteroids(4);
}

function scheduleDrops() {
  killCount = 0;
  const taken = [];
  const pick = () => {
    let n;
    do { n = randInt(3, 12); } while (taken.includes(n));
    taken.push(n);
    return n;
  };
  powerUpDropAt = pick();
  shieldDropAt  = pick();
  slowDropAt    = pick();
  hyperDropAt   = pick();
  novaDropPending = true;
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  ship.reset();
  scheduleDrops();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y));
}

function detonateNova() {
  ship.novaBomb = false;
  for (const a of asteroids) {
    score += POINTS[a.size];
    explode(a.x, a.y, a.size * 5);
    killCount++;
  }
  asteroids = [];
  particles.push(new NovaWave(ship.x, ship.y));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  ship.tripleShot = 0;
  ship.shield = 0;
  ship.slowMotion = 0;
  ship.hyperThrust = 0;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    const deadAsteroidDt = ship.slowMotion > 0 ? dt * SLOW_FACTOR : dt;
    asteroids.forEach(a => a.update(deadAsteroidDt));
    powerUps.forEach(p => p.update(dt));
    powerUps = powerUps.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Detonar Bomba Nova
  if (pressed('KeyB') && ship.novaBomb) detonateNova();

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  const asteroidDt = ship.slowMotion > 0 ? dt * SLOW_FACTOR : dt;
  asteroids.forEach(a => a.update(asteroidDt));
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));

  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);
  powerUps  = powerUps.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());

        killCount++;
        if (killCount === powerUpDropAt) powerUps.push(new PowerUp(a.x, a.y, 'triple'));
        if (killCount === shieldDropAt)  powerUps.push(new PowerUp(a.x, a.y, 'shield'));
        if (killCount === slowDropAt)    powerUps.push(new PowerUp(a.x, a.y, 'slow'));
        if (killCount === hyperDropAt)   powerUps.push(new PowerUp(a.x, a.y, 'hyper'));
        if (novaDropPending && asteroids.length >= NOVA_MIN_ASTEROIDS) {
          powerUps.push(new PowerUp(a.x, a.y, 'nova'));
          novaDropPending = false;
        }
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    const collisionRadius = ship.shield > 0 ? SHIELD_RADIUS : ship.radius;
    for (const a of asteroids) {
      if (dist(ship, a) < collisionRadius + a.radius * 0.82) {
        if (ship.shield > 0) {
          ship.shield = 0;
          ship.invincible = 1;
          explode(ship.x, ship.y, 10);
        } else {
          killShip();
        }
        break;
      }
    }
  }

  // Nave vs power-up
  if (!ship.dead) {
    for (const p of powerUps) {
      if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        if (p.type === 'shield') ship.shield = 5;
        else if (p.type === 'slow') ship.slowMotion = SLOW_DURATION;
        else if (p.type === 'nova') ship.novaBomb = true;
        else if (p.type === 'hyper') ship.hyperThrust = HYPER_DURATION;
        else ship.tripleShot = 5;
        explode(p.x, p.y, 10);
      }
    }
    powerUps = powerUps.filter(p => !p.dead);
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.2;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo( 9,  0);
  ctx.lineTo(-6, -5);
  ctx.lineTo(-3,  0);
  ctx.lineTo(-6,  5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  ctx.textAlign = 'left';
  let statusY = 46;
  if (ship.tripleShot > 0) {
    ctx.fillStyle = '#0ff';
    ctx.fillText(`TRIPLE  ${Math.ceil(ship.tripleShot)}s`, 14, statusY);
    statusY += 20;
  }
  if (ship.shield > 0) {
    ctx.fillStyle = '#4af';
    ctx.fillText(`ESCUDO  ${Math.ceil(ship.shield)}s`, 14, statusY);
    statusY += 20;
  }
  if (ship.slowMotion > 0) {
    ctx.fillStyle = '#f44';
    ctx.fillText(`SLOW  ${Math.ceil(ship.slowMotion)}s`, 14, statusY);
  }
}

function drawShipStatus() {
  if (ship.dead) return;
  const lines = [];
  if (ship.hyperThrust > 0) lines.push(['#f0f', `HIPER ${Math.ceil(ship.hyperThrust)}s`]);
  if (ship.novaBomb)        lines.push(['#fa0', 'NOVA [B]']);
  if (lines.length === 0) return;

  const y0 = ship.y + 34 + (lines.length - 1) * 13 > H ? ship.y - 30 - (lines.length - 1) * 13 : ship.y + 34;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  lines.forEach(([color, text], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, ship.x, y0 + i * 13);
  });
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw(ship.slowMotion > 0));
  powerUps.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();
  drawShipStatus();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
