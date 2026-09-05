/* =====================================================================
   particles.js — نظام جزيئات قابل لإعادة الاستخدام
   يدعم: Stars, Hearts, Sparkles, Confetti, Rain
   يستخدم requestAnimationFrame ويراعي أداء الأجهزة الضعيفة
   ===================================================================== */

const ParticleSystem = (() => {

  let canvas, ctx;
  let particles = [];
  let rafId = null;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let lowPower = false;

  // كشف تقريبي للأجهزة الضعيفة عبر عدد الأنوية
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

  // ---- منشئات الأشكال ----
  function drawHeart(x, y, size, alpha, rotation = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff6fa5';
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
    ctx.fillStyle = '#fff6d8';
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
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
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
    ctx.strokeStyle = 'rgba(180,200,255,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Emit helpers ----
  const CONFETTI_COLORS = ['#ff6fa5', '#b48af0', '#ffd6e8', '#fff6d8', '#7b4fd1'];

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

  function clear(type) {
    if (type) particles = particles.filter(p => p.type !== type);
    else particles = [];
  }

  function update() {
    const h = canvas ? canvas.clientHeight : window.innerHeight;
    particles = particles.filter(p => p.life < p.maxLife && p.y < h + 40);
    for (const p of particles) {
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      if (p.gravity) p.vy += p.gravity;
      if (p.rotSpeed) p.rotation += p.rotSpeed;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
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
      }
    }
  }

  function loop() {
    update();
    render();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
  }

  return {
    init, resize, emit, emitRain, clear, stop,
    get isLowPower() { return lowPower; },
  };
})();
