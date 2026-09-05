/* =====================================================================
   engine.js — محرك عالم قابل لإعادة الاستخدام لكل المراحل الخمس
   =====================================================================
   يوفر:
   - عالم أكبر من الشاشة + كاميرا تتبع اللاعب (Camera Follow)
   - حركة اللاعب: لوحة المفاتيح (WASD/Arrows) + Joystick للموبايل
   - عناصر قابلة للجمع (Collectibles) وعناصر تفاعلية (Interactables)
   - رسالة/زر "INTERACT" يظهر عند الاقتراب من عنصر تفاعلي
   - طبقة زخرفة خلفية (Parallax) بسيطة قابلة للتخصيص لكل مرحلة
   ===================================================================== */

const WorldEngine = (() => {

  function create(config) {
    const canvas = config.canvas;
    const ctx = canvas.getContext('2d');

    const SPEED = config.speed ?? 3.4;
    const PLAYER_R = config.playerRadius ?? 24;
    const INTERACT_RADIUS = config.interactRadius ?? 76;

    let dpr = 1;
    let viewW = 0, viewH = 0;
    let worldW = config.worldWidth ?? 1400;
    let worldH = config.worldHeight ?? 1000;
    let camX = 0, camY = 0;

    let player = {
      x: worldW / 2,
      y: worldH / 2,
      facing: 1,
      moving: false,
      walkPhase: 0,
      idlePhase: Math.random() * Math.PI * 2,
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
    let inputVec = { x: 0, y: 0 }; // من الـ joystick
    const keys = {};

    /* ---------------- إعداد الأبعاد ---------------- */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = canvas.clientWidth;
      viewH = canvas.clientHeight;
      canvas.width = viewW * dpr;
      canvas.height = viewH * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      worldW = Math.max(worldW, viewW + 200);
      worldH = Math.max(worldH, viewH + 200);
      updateCamera(true);
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

    /* ---------------- Joystick (يُستدعى من main.js) ---------------- */
    function setInputVector(x, y) {
      inputVec.x = Math.max(-1, Math.min(1, x));
      inputVec.y = Math.max(-1, Math.min(1, y));
    }

    /* ---------------- الحركة ---------------- */
    function updatePlayer() {
      if (paused) { player.moving = false; return; }
      const kv = keyboardVector();
      let dx = kv.x || inputVec.x;
      let dy = kv.y || inputVec.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.05) {
        dx /= (len < 1 ? 1 : len);
        dy /= (len < 1 ? 1 : len);
        player.x += dx * SPEED;
        player.y += dy * SPEED;
        player.moving = true;
        player.walkPhase += 0.22;
        if (dx !== 0) player.facing = dx > 0 ? 1 : -1;
      } else {
        player.moving = false;
        player.idlePhase += 0.05;
      }
      player.x = Math.max(PLAYER_R, Math.min(worldW - PLAYER_R, player.x));
      player.y = Math.max(PLAYER_R, Math.min(worldH - PLAYER_R, player.y));
    }

    function updateCamera(instant) {
      const targetX = Math.max(0, Math.min(worldW - viewW, player.x - viewW / 2));
      const targetY = Math.max(0, Math.min(worldH - viewH, player.y - viewH / 2));
      if (instant) { camX = targetX; camY = targetY; }
      else { camX += (targetX - camX) * 0.14; camY += (targetY - camY) * 0.14; }
    }

    /* ---------------- التفاعل والتجميع ---------------- */
    function distTo(it) { return Math.hypot(player.x - it.x, player.y - it.y); }

    function updateItems() {
      let closestInteract = null, closestDist = Infinity;
      for (const it of items) {
        if (it.collected || it.found) continue;
        const d = distTo(it);

        if (it.kind === 'collect') {
          if (d < it.glowRadius) {
            // اهتزاز/توهج بسيط عند الاقتراب
            it.glow = true;
            it.x += Math.sin(it.bobPhase * 3) * 0.15;
          } else {
            it.glow = false;
          }
          if (d < PLAYER_R + it.radius * 0.7) {
            it.collected = true;
            if (config.onCollect) config.onCollect(it);
          }
        } else if (it.kind === 'interact') {
          if (d < INTERACT_RADIUS && d < closestDist) {
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
      const sx = it.x - camX;
      const sy = it.y - camY + Math.sin(it.bobPhase) * 5;
      if (sx < -60 || sx > viewW + 60 || sy < -60 || sy > viewH + 60) return;

      ctx.save();
      if (it.glow || (it.kind === 'interact' && it === nearItem)) {
        ctx.shadowColor = it.glowColor || 'rgba(248, 220, 220, 0.85)';
        ctx.shadowBlur = 22;
      }
      const scale = it.glow ? 1.18 : 1;
      ctx.font = `${(it.size ?? it.radius * 1.6) * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, sx, sy);
      ctx.restore();

      if (it.kind === 'interact' && it === nearItem) {
        ctx.save();
        ctx.font = "600 15px Cairo, 'Segoe UI', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFDF9';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 6;
        ctx.fillText(config.interactLabel || 'اضغطي للتفاعل', sx, sy - (it.radius ?? 30) - 22);
        ctx.restore();
      }
    }

    function drawPlayer() {
      const sx = player.x - camX;
      const sy = player.y - camY;
      const bob = player.moving ? Math.sin(player.walkPhase) * 4 : Math.sin(player.idlePhase) * 1.5;

      ctx.save();
      // ظل تحت الشخصية
      ctx.beginPath();
      ctx.ellipse(sx, sy + PLAYER_R * 0.85, PLAYER_R * 0.8, PLAYER_R * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(6, 10, 28, 0.35)';
      ctx.fill();

      ctx.translate(sx, sy + bob);
      ctx.scale(player.facing, 1);
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, PLAYER_R);
      grad.addColorStop(0, '#FFFDF9');
      grad.addColorStop(1, '#E9B9C4');
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(233,185,196,0.55)';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = `${PLAYER_R * 1.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.playerEmoji || '💗', 0, 2);
      ctx.restore();
    }

    function render() {
      drawBackground();
      const sorted = items.slice().sort((a, b) => a.y - b.y);
      for (const it of sorted) if (!it.collected && !it.found) drawItem(it);
      drawPlayer();
      if (config.drawForeground) config.drawForeground(ctx, { camX, camY, viewW, viewH, worldW, worldH });
    }

    function loop() {
      if (!active) return;
      updatePlayer();
      updateCamera(false);
      updateItems();
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
      window.addEventListener('resize', resize);
      raf = requestAnimationFrame(loop);
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
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

  return { create };
})();
