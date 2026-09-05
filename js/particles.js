/* =====================================================================
   particles.js — نظام جزيئات قابل لإعادة الاستخدام
   يدعم: Stars, Hearts, Sparkles, Confetti, Rain, Petals, Fireflies
   يستخدم requestAnimationFrame ويراعي أداء الأجهزة الضعيفة
   ===================================================================== */

const ParticleSystem = (() => {

  let canvas, ctx;
  let particles = [];
  let rafId = null;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let lowPower = false;
  let ambientMode = 'petals'; // 'petals' | 'fireflies' | 'none'

  function detectLowPower() {
    const cores = navigator.hardwareConcurrency || 4;
    lowPower = cores <= 4;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    detectLowPower();
    resize();
    window.addEventListener('resize', resize);
    loop();
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function maxParticles() {
    return lowPower ? 60 : 160;
  }

  function setAmbientMode(mode) {
    ambientMode = mode;
    clear('petal');
    clear('firefly');
  }

  // ---- منشئات الأشكال ----
  function drawHeart(x, y, size, alpha, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#B98B8B';
    ctx.beginPath();
    const s = size;
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(-s, -s * 0.6, -s * 1.6, s * 0.4, 0, s * 1.3);
    ctx.bezierCurveTo(s * 1.6, s * 0.4, s, -s * 0.6, 0, s * 0.3);
    ctx.fill();
    ctx.restore();
  }

  function drawStar(x, y, size, alpha, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#F3E6D2';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      ctx.lineTo(Math.cos(a1) * size, Math.sin(a1) * size);
      ctx.lineTo(Math.cos(a2) * size * 0.45, Math.sin(a2) * size * 0.45);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSparkle(x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
    grad.addColorStop(0, 'rgba(255,253,249,0.9)');
    grad.addColorStop(1, 'rgba(255,253,249,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawConfetti(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }

  function drawRainDrop(p) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.strokeStyle = 'rgba(184,139,139,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color || 'rgba(184,139,139,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 0.55, p.size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFirefly(p) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.shadowColor = 'rgba(217,176,140,0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#D9B08C';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Emit helpers ----
  const CONFETTI_COLORS = ['#E8C8C8', '#B98B8B', '#F8EFEA', '#FFFDF9', '#D9B08C'];
  const PETAL_COLORS = ['rgba(184,139,139,0.5)', 'rgba(232,200,200,0.55)', 'rgba(184,139,139,0.35)'];

  function emit(type, x, y, count = 10, opts = {}) {
    if (particles.length > maxParticles()) return;
    const n = lowPower ? Math.ceil(count * 0.5) : count;
    for (let i = 0; i < n; i++) {
      if (particles.length >= maxParticles()) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * (opts.burst ? 4 : 2);
      particles.push({
        type,
        x, y,
        vx: Math.cos(angle) * speed * (opts.spread ?? 1),
        vy: Math.sin(angle) * speed * (opts.spread ?? 1) - (opts.rise ? 1.5 : 0),
        size: (opts.size ?? (6 + Math.random() * 8)),
        alpha: 1,
        life: 0,
        maxLife: opts.life ?? (60 + Math.random() * 40),
        rotation: Math.random() * Math.PI,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        color: opts.color || CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        gravity: opts.gravity ?? 0.03,
      });
    }
  }

  function emitRain(intensity = 1) {
    if (particles.filter(p => p.type === 'rain').length > maxParticles() * 0.8) return;
    const n = Math.ceil((lowPower ? 1 : 2) * intensity);
    for (let i = 0; i < n; i++) {
      particles.push({
        type: 'rain',
        x: Math.random() * (canvas ? canvas.clientWidth : window.innerWidth),
        y: -10,
        vx: -1.2,
        vy: 9 + Math.random() * 4,
        alpha: 0.6,
        life: 0,
        maxLife: 200,
      });
    }
  }

  /* -------- عناصر خلفية دائمة (بتلات ورد أو يراعات) -------- */
  function ambientTarget() {
    if (ambientMode === 'none') return 0;
    return lowPower ? 4 : 8;
  }

  function spawnPetal() {
    const w = canvas ? canvas.clientWidth : window.innerWidth;
    particles.push({
      type: 'petal',
      x: Math.random() * w,
      y: -16,
      vx: (Math.random() - 0.5) * 0.25,
      vy: 0.25 + Math.random() * 0.25,
      size: 7 + Math.random() * 6,
      alpha: 0.35 + Math.random() * 0.25,
      life: 0,
      maxLife: 4000,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.006,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.006 + Math.random() * 0.008,
      color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    });
  }

  function spawnFirefly() {
    const w = canvas ? canvas.clientWidth : window.innerWidth;
    const h = canvas ? canvas.clientHeight : window.innerHeight;
    particles.push({
      type: 'firefly',
      x: Math.random() * w,
      y: h * 0.35 + Math.random() * h * 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: 10 + Math.random() * 6,
      alpha: 0.2,
      alphaDir: 1,
      life: 0,
      maxLife: 6000,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.01 + Math.random() * 0.01,
    });
  }

  function maybeSpawnAmbient() {
    const type = ambientMode === 'fireflies' ? 'firefly' : (ambientMode === 'petals' ? 'petal' : null);
    if (!type) return;
    const count = particles.reduce((n, p) => n + (p.type === type ? 1 : 0), 0);
    if (count < ambientTarget() && Math.random() < 0.02) {
      if (type === 'petal') spawnPetal(); else spawnFirefly();
    }
  }

  function clear(type) {
    if (type) particles = particles.filter(p => p.type !== type);
    else particles = [];
  }

  function update() {
    const h = canvas ? canvas.clientHeight : window.innerHeight;
    particles = particles.filter(p => p.life < p.maxLife && p.y < h + 40);
    for (const p of particles) {
      p.life++;
      if (p.type === 'petal') {
        p.swayPhase += p.swaySpeed;
        p.x += p.vx + Math.sin(p.swayPhase) * 0.35;
        p.y += p.vy;
      } else if (p.type === 'firefly') {
        p.swayPhase += p.swaySpeed;
        p.x += p.vx + Math.sin(p.swayPhase) * 0.4;
        p.y += p.vy + Math.cos(p.swayPhase * 0.7) * 0.4;
        p.alpha += 0.01 * p.alphaDir;
        if (p.alpha > 0.9) p.alphaDir = -1;
        if (p.alpha < 0.15) p.alphaDir = 1;
      } else {
        p.x += p.vx;
        p.y += p.vy;
      }
      if (p.gravity) p.vy += p.gravity;
      if (p.rotSpeed) p.rotation += p.rotSpeed;
      if (p.type !== 'petal' && p.type !== 'firefly') {
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      }
    }
  }

  function render() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    for (const p of particles) {
      switch (p.type) {
        case 'heart': drawHeart(p.x, p.y, p.size, p.alpha, p.rotation); break;
        case 'star': drawStar(p.x, p.y, p.size, p.alpha, p.rotation); break;
        case 'sparkle': drawSparkle(p.x, p.y, p.size, p.alpha); break;
        case 'confetti': drawConfetti(p); break;
        case 'rain': drawRainDrop(p); break;
        case 'petal': drawPetal(p); break;
        case 'firefly': drawFirefly(p); break;
      }
    }
  }

  function loop() {
    maybeSpawnAmbient();
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
  }

  return {
    init, resize, emit, emitRain, clear, stop, setAmbientMode,
    get isLowPower() { return lowPower; },
  };
})();
