/* =====================================================================
   engine.js — محرك عالم قابل لإعادة الاستخدام لكل المراحل
   =====================================================================
   تحديثات هذه النسخة:
   - حركة بعجلة تسارع/تباطؤ حقيقية (مش سرعة ثابتة فجأة)
   - كاميرا تتبع ناعمة مع حدود صارمة لكل مرحلة (لا مساحات فارغة)
   - resize يعتمد على ResizeObserver + orientationchange (مش فقط window resize)
   - عناصر مخفية (hidden) تظهر فقط عند الاقتراب — للعناصر السرية
   - عناصر عائقة خفيفة (hazard) تبطّئ اللاعب لحظيًا بدل "الخسارة"
   - رسم متجهي (Vector / Canvas paths) بدل الاعتماد الكامل على الإيموجي
   ===================================================================== */

const WorldEngine = (() => {

  const COLORS = {
    warm: '#FFFDF9',
    pink: '#E9B9C4',
    rose: '#B98B8B',
    gold: '#D9B08C',
    ink: '#1c1626',
  };

  /* ---------------- رسوم متجهية افتراضية للعناصر ---------------- */
  function pathHeart(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.32);
    ctx.bezierCurveTo(-s, -s * 0.55, -s * 1.55, s * 0.42, 0, s * 1.25);
    ctx.bezierCurveTo(s * 1.55, s * 0.42, s, -s * 0.55, 0, s * 0.32);
  }

  function drawHeartItem(ctx, it, scale) {
    const s = (it.radius ?? 26) * 0.9 * scale;
    const grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, it.special ? '#FFFDF9' : COLORS.pink);
    grad.addColorStop(1, it.special ? COLORS.gold : COLORS.rose);
    pathHeart(ctx, s);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(-s * 0.28, -s * 0.05, s * 0.22, s * 0.13, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.warm;
    ctx.fill();
    ctx.restore();
  }

  function drawStarItem(ctx, it, scale) {
    const s = (it.radius ?? 22) * scale;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      ctx.lineTo(Math.cos(a1) * s, Math.sin(a1) * s);
      ctx.lineTo(Math.cos(a2) * s * 0.42, Math.sin(a2) * s * 0.42);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, it.rare ? '#FFFDF9' : COLORS.gold);
    grad.addColorStop(1, it.rare ? COLORS.gold : '#C99A63');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawLetterItem(ctx, it, scale) {
    const w = (it.radius ?? 26) * 1.7 * scale, h = w * 0.66;
    ctx.save();
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = COLORS.warm;
    ctx.strokeStyle = COLORS.rose;
    ctx.lineWidth = 1.4;
    roundRect(ctx, 0, 0, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w / 2, h * 0.58);
    ctx.lineTo(w, 0);
    ctx.strokeStyle = COLORS.rose;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, w * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.rose;
    ctx.fill();
    ctx.restore();
  }

  function drawGiftItem(ctx, it, scale) {
    const s = (it.radius ?? 34) * scale;
    const w = s * 1.7, h = s * 1.5;
    ctx.save();
    ctx.translate(-w / 2, -h / 2);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, COLORS.pink);
    grad.addColorStop(1, COLORS.rose);
    roundRect(ctx, 0, h * 0.28, w, h * 0.72, 5);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = COLORS.warm;
    ctx.fillRect(w / 2 - w * 0.07, h * 0.28, w * 0.14, h * 0.72);
    roundRect(ctx, 0, 0, w, h * 0.3, 4);
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.fillStyle = COLORS.warm;
    ctx.fillRect(w / 2 - w * 0.07, 0, w * 0.14, h * 0.3);
    ctx.restore();
  }

  function drawFireflyItem(ctx, it, scale) {
    const s = (it.radius ?? 14) * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(217,176,140,0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fill();
    ctx.restore();
  }

  const SHAPES = {
    heart: drawHeartItem,
    star: drawStarItem,
    letter: drawLetterItem,
    gift: drawGiftItem,
    firefly: drawFireflyItem,
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- الشخصية الافتراضية (متجهية، بدون إيموجي) ---------------- */
  function defaultDrawPlayer(ctx, p) {
    const R = p.radius;
    ctx.save();
    ctx.translate(p.sx, p.sy + p.bob);
    ctx.scale(p.facing, 1);

    const grad = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.15, 0, 0, R);
    grad.addColorStop(0, COLORS.warm);
    grad.addColorStop(1, COLORS.pink);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(233,185,196,0.5)';
    ctx.shadowBlur = p.moving ? 10 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(R * 0.32, -R * 0.08, R * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(R * 0.1, R * 0.22, R * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(185,139,139,0.35)';
    ctx.fill();

    ctx.save();
    ctx.translate(0, -R * 1.05);
    ctx.scale(0.32, 0.32);
    pathHeart(ctx, R * 0.7);
    ctx.fillStyle = COLORS.rose;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function create(config) {
    const canvas = config.canvas;
    const ctx = canvas.getContext('2d');

    const MAX_SPEED = config.speed ?? 3.4;
    const ACCEL = config.accel ?? 0.55;
    const FRICTION = config.friction ?? 0.82;
    const PLAYER_R = config.playerRadius ?? 24;
    const INTERACT_RADIUS = config.interactRadius ?? 76;
    const REVEAL_RADIUS = config.revealRadius ?? 120;

    let dpr = 1;
    let viewW = 0, viewH = 0;
    let worldW = config.worldWidth ?? 1400;
    let worldH = config.worldHeight ?? 1000;
    let camX = 0, camY = 0;

    let player = {
      x: worldW / 2,
      y: worldH / 2,
      vx: 0, vy: 0,
      facing: 1,
      moving: false,
      walkPhase: 0,
      idlePhase: Math.random() * Math.PI * 2,
      slowUntil: 0,
    };

    if (config.playerStart) {
      player.x = config.playerStart.fx * worldW;
      player.y = config.playerStart.fy * worldH;
    }

    let items = (config.items || []).map((it, i) => ({
      collected: false,
      found: false,
      radius: it.radius ?? 30,
      glowRadius: it.glowRadius ?? INTERACT_RADIUS,
      bobPhase: Math.random() * Math.PI * 2,
      id: it.id ?? `item_${i}`,
      ...it,
      x: (it.fx != null ? it.fx * worldW : it.x),
      y: (it.fy != null ? it.fy * worldH : it.y),
    }));

    let active = false;
    let paused = false;
    let raf = null;
    let nearItem = null;
    let inputVec = { x: 0, y: 0 };
    const keys = {};
    let resizeObserver = null;
    let resizeDebounce = null;

    /* ---------------- إعداد الأبعاد ---------------- */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = canvas.clientWidth;
      viewH = canvas.clientHeight;
      if (viewW === 0 || viewH === 0) return;
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      worldW = Math.max(config.worldWidth ?? 1400, viewW + 160);
      worldH = Math.max(config.worldHeight ?? 1000, viewH + 160);
      updateCamera(true);
    }

    function scheduleResize() {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(resize, 80);
    }

    /* ---------------- لوحة المفاتيح ---------------- */
    function onKeyDown(e) {
      keys[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e') {
        triggerInteract();
      }
    }
    function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }

    function keyboardVector() {
      let dx = 0, dy = 0;
      if (keys['arrowleft'] || keys['a']) dx -= 1;
      if (keys['arrowright'] || keys['d']) dx += 1;
      if (keys['arrowup'] || keys['w']) dy -= 1;
      if (keys['arrowdown'] || keys['s']) dy += 1;
      return { x: dx, y: dy };
    }

    /* ---------------- Joystick ---------------- */
    function setInputVector(x, y) {
      inputVec.x = Math.max(-1, Math.min(1, x));
      inputVec.y = Math.max(-1, Math.min(1, y));
    }

    /* ---------------- الحركة (تسارع/تباطؤ) ---------------- */
    function updatePlayer(now) {
      if (paused) { player.moving = false; return; }
      const kv = keyboardVector();
      let dx = kv.x || inputVec.x;
      let dy = kv.y || inputVec.y;
      const len = Math.hypot(dx, dy);
      const speedMul = now < player.slowUntil ? 0.45 : 1;
      const maxSpeed = MAX_SPEED * speedMul;

      if (len > 0.05) {
        dx /= (len < 1 ? 1 : len);
        dy /= (len < 1 ? 1 : len);
        player.vx += dx * ACCEL;
        player.vy += dy * ACCEL;
        const speed = Math.hypot(player.vx, player.vy);
        if (speed > maxSpeed) {
          player.vx = (player.vx / speed) * maxSpeed;
          player.vy = (player.vy / speed) * maxSpeed;
        }
        player.moving = true;
        player.walkPhase += 0.2 + Math.min(0.08, speed * 0.02);
        if (dx !== 0) player.facing = dx > 0 ? 1 : -1;
      } else {
        player.vx *= FRICTION;
        player.vy *= FRICTION;
        if (Math.hypot(player.vx, player.vy) < 0.05) {
          player.vx = 0; player.vy = 0;
          player.moving = false;
          player.idlePhase += 0.05;
        } else {
          player.moving = true;
        }
      }

      player.x += player.vx;
      player.y += player.vy;
      player.x = Math.max(PLAYER_R, Math.min(worldW - PLAYER_R, player.x));
      player.y = Math.max(PLAYER_R, Math.min(worldH - PLAYER_R, player.y));
    }

    function updateCamera(instant) {
      const targetX = Math.max(0, Math.min(worldW - viewW, player.x - viewW / 2));
      const targetY = Math.max(0, Math.min(worldH - viewH, player.y - viewH / 2));
      if (instant) { camX = targetX; camY = targetY; }
      else { camX += (targetX - camX) * 0.12; camY += (targetY - camY) * 0.12; }
    }

    /* ---------------- التفاعل والتجميع ---------------- */
    function distTo(it) { return Math.hypot(player.x - it.x, player.y - it.y); }

    function updateItems(now) {
      let closestInteract = null, closestDist = Infinity;
      for (const it of items) {
        if (it.collected || it.found) continue;
        const d = distTo(it);

        if (it.hidden) {
          it.revealed = d < (it.revealRadius ?? REVEAL_RADIUS);
        } else {
          it.revealed = true;
        }

        if (it.kind === 'hazard') {
          if (d < (it.radius ?? 40) + PLAYER_R * 0.6) {
            player.slowUntil = now + (it.slowMs ?? 900);
            if (!it.triggered && config.onHazard) { it.triggered = true; config.onHazard(it); }
          } else if (d > (it.radius ?? 40) + PLAYER_R * 1.6) {
            it.triggered = false;
          }
        } else if (it.kind === 'collect') {
          if (d < it.glowRadius && it.revealed) {
            it.glow = true;
          } else {
            it.glow = false;
          }
          if (d < PLAYER_R + it.radius * 0.7 && it.revealed) {
            it.collected = true;
            if (config.onCollect) config.onCollect(it);
          }
        } else if (it.kind === 'interact') {
          if (d < INTERACT_RADIUS && d < closestDist && it.revealed) {
            closestDist = d;
            closestInteract = it;
          }
        }
        it.bobPhase += 0.05;
      }

      if (closestInteract !== nearItem) {
        nearItem = closestInteract;
        if (config.onNearChange) config.onNearChange(nearItem);
      }
    }

    function triggerInteract() {
      if (paused || !nearItem || nearItem.found) return;
      if (config.onInteract) config.onInteract(nearItem);
    }

    function markFound(id) {
      const it = items.find(i => i.id === id);
      if (it) it.found = true;
      if (nearItem && nearItem.id === id) {
        nearItem = null;
        if (config.onNearChange) config.onNearChange(null);
      }
    }

    function addItem(it) {
      items.push({
        collected: false, found: false,
        radius: it.radius ?? 30,
        glowRadius: it.glowRadius ?? INTERACT_RADIUS,
        bobPhase: Math.random() * Math.PI * 2,
        ...it,
        x: (it.fx != null ? it.fx * worldW : it.x),
        y: (it.fy != null ? it.fy * worldH : it.y),
      });
    }

    /* ---------------- الرسم ---------------- */
    function drawBackground() {
      if (config.drawBackground) {
        config.drawBackground(ctx, { camX, camY, viewW, viewH, worldW, worldH });
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, viewW, viewH);
      }
    }

    function drawItem(it) {
      if (it.hidden && !it.revealed) return;
      const sx = it.x - camX;
      const sy = it.y - camY + Math.sin(it.bobPhase) * 5;
      if (sx < -60 || sx > viewW + 60 || sy < -60 || sy > viewH + 60) return;

      ctx.save();
      ctx.translate(sx, sy);
      if (it.hidden) {
        const revealAlpha = Math.min(1, ((it.revealRadius ?? REVEAL_RADIUS) - distTo(it)) / 60 + 0.4);
        ctx.globalAlpha = Math.max(0.35, Math.min(1, revealAlpha));
      }
      if (it.glow || (it.kind === 'interact' && it === nearItem)) {
        ctx.shadowColor = it.glowColor || 'rgba(233,185,196,0.6)';
        ctx.shadowBlur = 16;
      }
      const scale = it.glow ? 1.12 : 1;
      const renderer = SHAPES[it.shape] || config.drawItemShape || null;
      if (renderer) {
        renderer(ctx, it, scale);
      } else if (it.emoji) {
        ctx.font = `${(it.size ?? it.radius * 1.6) * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.emoji, 0, 0);
      }
      ctx.restore();

      if (it.kind === 'interact' && it === nearItem) {
        ctx.save();
        ctx.font = "600 14px Cairo, 'Segoe UI', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFDF9';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 6;
        ctx.fillText(config.interactLabel || 'اضغطي للتفاعل', sx, sy - (it.radius ?? 30) - 20);
        ctx.restore();
      }
    }

    function drawPlayer() {
      const sx = player.x - camX;
      const sy = player.y - camY;
      const speed = Math.hypot(player.vx, player.vy);
      const bob = player.moving ? Math.sin(player.walkPhase) * Math.min(4, 2 + speed) : Math.sin(player.idlePhase) * 1.4;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + PLAYER_R * 0.85, PLAYER_R * 0.78, PLAYER_R * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 10, 28, 0.32)';
      ctx.fill();
      ctx.restore();

      const painter = config.drawPlayer || defaultDrawPlayer;
      painter(ctx, { sx, sy, bob, facing: player.facing, moving: player.moving, radius: PLAYER_R });
    }

    function render() {
      drawBackground();
      const sorted = items.slice().sort((a, b) => a.y - b.y);
      for (const it of sorted) if (!it.collected && !it.found) drawItem(it);
      drawPlayer();
      if (config.drawForeground) config.drawForeground(ctx, { camX, camY, viewW, viewH, worldW, worldH });
    }

    function loop(now) {
      if (!active) return;
      updatePlayer(now);
      updateCamera(false);
      updateItems(now);
      render();
      if (config.onTick) config.onTick({ player, camX, camY });
      raf = requestAnimationFrame(loop);
    }

    /* ---------------- التحكم العام ---------------- */
    function start() {
      active = true;
      paused = false;
      resize();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('orientationchange', scheduleResize);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(scheduleResize);
        resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', scheduleResize);
      }
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(resizeDebounce);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('orientationchange', scheduleResize);
      window.removeEventListener('resize', scheduleResize);
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      for (const k in keys) keys[k] = false;
      inputVec = { x: 0, y: 0 };
    }

    function setPaused(v) { paused = v; if (v) inputVec = { x: 0, y: 0 }; }

    return {
      start, stop, setPaused,
      setInputVector, triggerInteract, markFound, addItem,
      get items() { return items; },
      get player() { return player; },
      get nearItem() { return nearItem; },
    };
  }

  return { create, SHAPES };
})();
