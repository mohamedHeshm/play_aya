/* =====================================================================
   engine.js — محرك عالم قابل لإعادة الاستخدام لكل المراحل
   =====================================================================
   الإصدار المُعدّل بالكامل: يعمل بشكل صحيح على الموبايل
   مع نظام كاميرا متكامل (zoom + world → screen transform)
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

  /* ---------------- الشخصية الافتراضية ---------------- */
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

  /* ============================================================
     المُنشئ الرئيسي
  ============================================================ */
  function create(config) {
    const canvas = config.canvas;
    const ctx = canvas.getContext('2d');

    // إعدادات العالم
    const WORLD_W = config.worldWidth ?? 1400;
    const WORLD_H = config.worldHeight ?? 1000;

    // سرعة الحركة
    const MAX_SPEED = config.speed ?? 3.4;
    const ACCEL = config.accel ?? 0.55;
    const FRICTION = config.friction ?? 0.82;
    const PLAYER_R = config.playerRadius ?? 24;
    const INTERACT_RADIUS = config.interactRadius ?? 76;
    const REVEAL_RADIUS = config.revealRadius ?? 120;

    // حالة العرض
    let dpr = 1;
    let viewW = 0, viewH = 0;
    let zoom = 1;  // عامل التكبير/التصغير

    // الكاميرا (في إحداثيات العالم)
    const camera = { x: 0, y: 0 };

    // اللاعب
    let player = {
      x: WORLD_W / 2,
      y: WORLD_H / 2,
      vx: 0, vy: 0,
      facing: 1,
      moving: false,
      walkPhase: 0,
      idlePhase: Math.random() * Math.PI * 2,
      slowUntil: 0,
    };

    if (config.playerStart) {
      player.x = config.playerStart.fx * WORLD_W;
      player.y = config.playerStart.fy * WORLD_H;
    }

    let items = (config.items || []).map((it, i) => ({
      collected: false,
      found: false,
      radius: it.radius ?? 30,
      glowRadius: it.glowRadius ?? INTERACT_RADIUS,
      bobPhase: Math.random() * Math.PI * 2,
      id: it.id ?? `item_${i}`,
      ...it,
      x: (it.fx != null ? it.fx * WORLD_W : it.x),
      y: (it.fy != null ? it.fy * WORLD_H : it.y),
    }));

    let active = false;
    let paused = false;
    let raf = null;
    let nearItem = null;
    let inputVec = { x: 0, y: 0 };
    const keys = {};
    let resizeObserver = null;
    let resizeDebounce = null;

    /* ============================================================
       حساب التكبير التلقائي حسب حجم الشاشة
    ============================================================ */
    function computeZoom() {
      const isMobile = viewW < 768 || viewH < 768;
      const isPortrait = viewH > viewW;

      // على الموبايل نستخدم تكبير لجعل المحتوى مرئياً
      if (isMobile && isPortrait) {
        // نريد أن يكون عرض اللاعب حوالي 40-55 بكسل على الشاشة
        const targetPlayerScreenSize = 44;
        const zoomFromPlayer = targetPlayerScreenSize / PLAYER_R;

        // نريد أيضاً أن يكون مستوى اللعب مرئياً بشكل جيد
        // بحيث يظهر حوالي 600-800 وحدة عالمية عرضاً
        const targetVisibleWorldWidth = Math.min(800, WORLD_W * 0.7);
        const zoomFromWidth = viewW / targetVisibleWorldWidth;

        // نأخذ التكبير الأنسب (الأصغر عادةً)
        let z = Math.min(zoomFromPlayer, zoomFromWidth);
        z = Math.max(z, 0.5);  // لا نترك التكبير صغيراً جداً
        z = Math.min(z, 2.0);  // ولا كبيراً جداً
        return z;
      } else {
        // سطح المكتب: تكبير يعتمد على العرض
        const targetVisibleWidth = Math.min(1200, WORLD_W * 0.85);
        let z = viewW / targetVisibleWidth;
        z = Math.max(z, 0.6);
        z = Math.min(z, 1.8);
        return z;
      }
    }

    /* ============================================================
       إعداد الأبعاد وحجم الشاشة
    ============================================================ */
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = rect.height;

      if (cssW === 0 || cssH === 0) return;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = cssW;
      viewH = cssH;

      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);

      // إعادة حساب التكبير
      zoom = computeZoom();

      // تحديث الكاميرا فوراً
      updateCamera(true);
    }

    function scheduleResize() {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(resize, 80);
    }

    /* ============================================================
       تحويل الإحداثيات: العالم → الشاشة
    ============================================================ */
    function worldToScreen(wx, wy) {
      const sx = (wx - camera.x) * zoom;
      const sy = (wy - camera.y) * zoom;
      return { x: sx, y: sy };
    }

    /* ============================================================
       تحديث الكاميرا (تتبع اللاعب)
    ============================================================ */
    function updateCamera(instant) {
      // حدود الكاميرا: لا نسمح برؤية خارج العالم
      const halfW = viewW / zoom / 2;
      const halfH = viewH / zoom / 2;

      // الهدف: اللاعب في منتصف الشاشة
      let targetX = player.x;
      let targetY = player.y;

      // نحدد الكاميرا بحيث لا تخرج عن حدود العالم
      const minX = halfW;
      const maxX = WORLD_W - halfW;
      const minY = halfH;
      const maxY = WORLD_H - halfH;

      if (maxX < minX) {
        // العالم أصغر من الشاشة في العرض: نمركز
        targetX = WORLD_W / 2;
      } else {
        targetX = Math.max(minX, Math.min(maxX, targetX));
      }

      if (maxY < minY) {
        targetY = WORLD_H / 2;
      } else {
        targetY = Math.max(minY, Math.min(maxY, targetY));
      }

      if (instant) {
        camera.x = targetX;
        camera.y = targetY;
      } else {
        camera.x += (targetX - camera.x) * 0.12;
        camera.y += (targetY - camera.y) * 0.12;
      }
    }

    /* ============================================================
       الحركة
    ============================================================ */
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
      player.x = Math.max(PLAYER_R, Math.min(WORLD_W - PLAYER_R, player.x));
      player.y = Math.max(PLAYER_R, Math.min(WORLD_H - PLAYER_R, player.y));
    }

    /* ============================================================
       لوحة المفاتيح
    ============================================================ */
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

    /* ============================================================
       Joystick
    ============================================================ */
    function setInputVector(x, y) {
      inputVec.x = Math.max(-1, Math.min(1, x));
      inputVec.y = Math.max(-1, Math.min(1, y));
    }

    /* ============================================================
       التفاعل والتجميع
    ============================================================ */
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
        x: (it.fx != null ? it.fx * WORLD_W : it.x),
        y: (it.fy != null ? it.fy * WORLD_H : it.y),
      });
    }

    /* ============================================================
       الرسم
    ============================================================ */
    function render() {
      // 1. إعادة ضبط التحويلات
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 2. مسح الخلفية
      ctx.clearRect(0, 0, viewW, viewH);

      // 3. رسم الخلفية (في إحداثيات الشاشة)
      if (config.drawBackground) {
        ctx.save();
        config.drawBackground(ctx, { viewW, viewH, worldW: WORLD_W, worldH: WORLD_H, camera, zoom });
        ctx.restore();
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, viewW, viewH);
      }

      // 4. رسم العناصر (يتم تحويل إحداثياتها)
      // نفرز العناصر حسب العمق (y)
      const sorted = items.slice().sort((a, b) => a.y - b.y);
      for (const it of sorted) {
        if (it.collected || it.found) continue;
        // تحويل الإحداثيات
        const screen = worldToScreen(it.x, it.y);
        // نتحقق من أنها ضمن الشاشة مع هامش
        const margin = (it.radius ?? 30) * zoom + 30;
        if (screen.x < -margin || screen.x > viewW + margin ||
            screen.y < -margin || screen.y > viewH + margin) continue;

        drawItem(it, screen);
      }

      // 5. رسم اللاعب
      drawPlayer();

      // 6. رسم عناصر الواجهة الأمامية (إذا وجدت)
      if (config.drawForeground) {
        ctx.save();
        config.drawForeground(ctx, { viewW, viewH, worldW: WORLD_W, worldH: WORLD_H, camera, zoom });
        ctx.restore();
      }

      // 7. استدعاء onTick
      if (config.onTick) config.onTick({ player, camera, zoom });
    }

    function drawItem(it, screen) {
      if (it.hidden && !it.revealed) return;
      const sx = screen.x;
      const sy = screen.y + Math.sin(it.bobPhase) * 5 * zoom;

      ctx.save();
      ctx.translate(sx, sy);

      if (it.hidden) {
        const d = distTo(it);
        const revealAlpha = Math.min(1, ((it.revealRadius ?? REVEAL_RADIUS) - d) / 60 + 0.4);
        ctx.globalAlpha = Math.max(0.35, Math.min(1, revealAlpha));
      }

      if (it.glow || (it.kind === 'interact' && it === nearItem)) {
        ctx.shadowColor = it.glowColor || 'rgba(233,185,196,0.6)';
        ctx.shadowBlur = 16 * zoom;
      }

      const scale = (it.glow ? 1.12 : 1) * zoom;
      const renderer = SHAPES[it.shape] || config.drawItemShape || null;
      if (renderer) {
        renderer(ctx, it, scale);
      } else if (it.emoji) {
        const fontSize = (it.size ?? it.radius * 1.6) * scale;
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.emoji, 0, 0);
      }
      ctx.restore();

      // تسمية التفاعل
      if (it.kind === 'interact' && it === nearItem) {
        ctx.save();
        const fontSize = Math.max(12, 14 * zoom);
        ctx.font = `600 ${fontSize}px Cairo, 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFDF9';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 6;
        const labelY = sy - (it.radius ?? 30) * zoom - 20 * zoom;
        ctx.fillText(config.interactLabel || 'اضغطي للتفاعل', sx, labelY);
        ctx.restore();
      }
    }

    function drawPlayer() {
      const screen = worldToScreen(player.x, player.y);
      const sx = screen.x;
      const sy = screen.y;
      const speed = Math.hypot(player.vx, player.vy);
      const bob = player.moving ? Math.sin(player.walkPhase) * Math.min(4, 2 + speed) * zoom : Math.sin(player.idlePhase) * 1.4 * zoom;
      const R = PLAYER_R * zoom;

      // الظل
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(sx, sy + R * 0.85, R * 0.78, R * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 10, 28, 0.32)';
      ctx.fill();
      ctx.restore();

      // اللاعب
      const painter = config.drawPlayer || defaultDrawPlayer;
      painter(ctx, {
        sx, sy, bob,
        facing: player.facing,
        moving: player.moving,
        radius: R
      });
    }

    /* ============================================================
       الحلقة الرئيسية
    ============================================================ */
    function loop(now) {
      if (!active) return;
      updatePlayer(now);
      updateCamera(false);
      updateItems(now);
      render();
      raf = requestAnimationFrame(loop);
    }

    /* ============================================================
       التحكم العام
    ============================================================ */
    function start() {
      active = true;
      paused = false;
      resize();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('orientationchange', scheduleResize);
      window.visualViewport?.addEventListener('resize', scheduleResize);
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
      window.visualViewport?.removeEventListener('resize', scheduleResize);
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