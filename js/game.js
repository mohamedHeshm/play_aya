/* =====================================================================
   game.js — منطق المراحل الخمس (Levels) كعالم قابل للاستكشاف
   =====================================================================
   ✏️✏️✏️ هنا تقدر تعدّلي كل المحتوى:
   - HEARTS_TARGET, STARS_TARGET
   - RAIN_MESSAGES, MEMORIES, WISH_RESULT_MESSAGE
   ===================================================================== */

const Game = (() => {

  const HEARTS_TARGET = 10;
  const STARS_TARGET = 5;

  const MEMORIES = [
    { id: 'm1', icon: '🌹', text: 'أول مرة كلمتك فيها حسيت إن في حاجة حلوة جاية.' },
    { id: 'm2', icon: '📷', text: 'أول صورة سوا... لسه فاكرها زي إمبارح.' },
    { id: 'm3', icon: '☕', text: 'أول قعدة سوا، وضحكنا لحد ما وجعنا.' },
    { id: 'm4', icon: '🎵', text: 'الأغنية اللي بقت "بتاعتنا" من غير ما نتفق.' },
    { id: 'm5', icon: '💌', text: 'أول رسالة حسيت فيها إنك فاهماني أكتر من نفسي.' },
    { id: 'm6', icon: '🌙', text: 'الليالي اللي قعدنا نتكلم فيها لحد الفجر.' },
    { id: 'm7', icon: '🎀', text: 'أول هدية بسيطة فرحتك أكتر من أي حاجة غالية.' },
    { id: 'm8', icon: '🌟', text: 'اللحظة اللي حسيت فيها إني بحبك بجد.' },
  ];

  const SECRET_MEMORY = { id: 'ms', icon: '🕊️', text: 'وسر صغير مش هقوله لحد… إنتِ أحلى حاجة حصلتلي في الدنيا دي.' };

  const RAIN_MESSAGES = [
    { id: 'r1', text: 'في نص الزحمة... بفكر فيكِ.' },
    { id: 'r2', text: 'مهما كانت الدنيا تقيلة، صوتك بيهدّيني.' },
    { id: 'r3', text: 'إنتِ المكان اللي بارتاح فيه.' },
    { id: 'r4', text: 'وكل ما الدنيا تمطر، بتذكر إن معاكِ بتبقى أجمل.' },
  ];

  const SHELTER_MESSAGE = 'تحت المطر برضه، جنبك بيبقى أدفى مكان في الدنيا ❤️';
  const WISH_RESULT_MESSAGE = 'أمنيتي الوحيدة إنك تفضلي مبسوطة، دايمًا، جنبي أو من بعيد ❤️';

  let state = null;
  let callbacks = {};

  function setState(s) { state = s; }
  function setCallbacks(cb) { callbacks = { ...callbacks, ...cb }; }
  function addScore(points) {
    state.score += points;
    if (callbacks.onScoreChange) callbacks.onScoreChange(state.score);
  }
  function unlockAchievement(id) {
    const first = Achievements.unlock(id);
    if (first && callbacks.onAchievement) callbacks.onAchievement(id);
  }
  function markSecret(levelKey, id) {
    const arr = state.progress[levelKey].secrets || (state.progress[levelKey].secrets = []);
    if (!arr.includes(id)) {
      arr.push(id);
      addScore(40);
      unlockAchievement('secret_finder');
      if (callbacks.onSecretFound) callbacks.onSecretFound();
      if (callbacks.onPersist) callbacks.onPersist();
    }
  }

  function randScatter(n, margin = 0.14) {
    const pts = [];
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    let k = 0;
    for (let r = 0; r < rows && k < n; r++) {
      for (let c = 0; c < cols && k < n; c++) {
        const fx = margin + (c + 0.5 + (Math.random() - 0.5) * 0.5) / cols * (1 - margin * 2);
        const fy = margin + (r + 0.5 + (Math.random() - 0.5) * 0.5) / rows * (1 - margin * 2);
        pts.push({ fx: Math.min(0.92, Math.max(0.08, fx)), fy: Math.min(0.92, Math.max(0.08, fy)) });
        k++;
      }
    }
    return pts;
  }

  /* ---------------- زخارف متجهية بسيطة لكل خلفية (بدون إيموجي) ---------------- */
  function decoDot(ctx, sx, sy, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawCloudBand(ctx, view, factor, y, color, alpha, seed) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const wx = (i * 420 + seed * 90) % (view.worldW + 400) - 200;
      const sx = wx - view.camX * factor;
      const sy = y + Math.sin(i * 1.7) * 10;
      if (sx < -160 || sx > view.viewW + 160) continue;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 90, 26, 0, 0, Math.PI * 2);
      ctx.ellipse(sx + 55, sy + 6, 60, 20, 0, 0, Math.PI * 2);
      ctx.ellipse(sx - 55, sy + 8, 55, 18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* =====================================================================
     LEVEL 1 — أول لقاء: جمع القلوب
     ===================================================================== */
  const Level1 = (() => {
    let engine = null;
    let collected = 0;

    function bg(ctx, view) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, '#3a2b3f');
      g.addColorStop(1, '#7a4a5a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewW, view.viewH);
      ctx.restore();

      drawCloudBand(ctx, view, 0.35, view.viewH * 0.18, 'rgba(255,253,249,0.06)', 1, 1);

      ctx.save();
      for (let i = 0; i < 22; i++) {
        const wx = (i * 137) % view.worldW;
        const wy = (i * 91 + 40) % view.worldH;
        const sx = wx - view.camX * 0.9;
        const sy = wy - view.camY * 0.9;
        decoDot(ctx, sx, sy, 5, i % 3 === 0 ? '#E8C8C8' : '#B98B8B', 0.35);
      }
      ctx.restore();
    }

    function start(canvas) {
      collected = state.progress.level1.hearts || 0;
      const secretFound = (state.progress.level1.secrets || []).includes('h_secret');
      const items = randScatter(HEARTS_TARGET).map((p, i) => ({
        id: `heart_${i}`,
        kind: 'collect', shape: 'heart',
        fx: p.fx, fy: p.fy,
        radius: 24, glowRadius: 90,
        special: Math.random() < 0.15,
        found: i < collected,
      }));

      items.push({
        id: 'h_secret', kind: 'collect', shape: 'heart',
        fx: 0.06, fy: 0.9, radius: 20, glowRadius: 90,
        special: true, hidden: true, revealRadius: 110,
        found: secretFound,
      });

      ParticleSystem.setAmbientMode('petals');

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1500, worldHeight: 1050,
        drawBackground: bg,
        items,
        onCollect(it) {
          if (it.id === 'h_secret') {
            markSecret('level1', 'h_secret');
            return;
          }
          collected++;
          state.progress.level1.hearts = collected;
          addScore(it.special ? 50 : 10);
          if (callbacks.onHud) callbacks.onHud(`❤️ ${collected}/${HEARTS_TARGET}`);
          ParticleSystem.emit('sparkle', canvas.clientWidth / 2, canvas.clientHeight / 2, 4, { life: 24, gravity: 0 });
          ParticleSystem.emit('heart', canvas.clientWidth / 2, canvas.clientHeight * 0.4, 2, { life: 40, gravity: -0.02, rise: true, size: 12 });
          AudioManager.sfx('heart');
          if (navigator.vibrate) navigator.vibrate(15);
          if (collected === 1) unlockAchievement('first_heart');
          if (collected >= HEARTS_TARGET) unlockAchievement('heart_collector');
          if (callbacks.onPersist) callbacks.onPersist();
          if (collected >= HEARTS_TARGET) finish();
        },
      });

      if (callbacks.onObjective) callbacks.onObjective('اجمعي كل القلوب المتساقطة ❤️');
      if (callbacks.onHud) callbacks.onHud(`❤️ ${collected}/${HEARTS_TARGET}`);
      if (callbacks.onEngineReady) callbacks.onEngineReady(engine);
      engine.start();
    }

    function finish() {
      addScore(100);
      if (callbacks.onStageMessage) callbacks.onStageMessage('جمعتِ كل القلوب… وقلبي كمان بقى كله ليكِ ❤️');
      setTimeout(() => { if (callbacks.onLevelComplete) callbacks.onLevelComplete('level1'); }, 1800);
    }

    function stop() { if (engine) engine.stop(); engine = null; }
    return { start, stop };
  })();

  /* =====================================================================
     LEVEL 2 — تحت المطر
     ===================================================================== */
  /* =====================================================================
     LEVEL 2 — تحت المطر (خلفية مُعدّلة للشاشات الصغيرة)
     ===================================================================== */
  const Level2 = (() => {
    let engine = null;
    let found = 0;

    function bg(ctx, view) {
      // view يحتوي على: viewW, viewH, worldW, worldH, camera, zoom
      const { viewW, viewH } = view;

      ctx.save();
      // تأكد من أننا نرسم من 0,0 (إحداثيات الشاشة)

      // السماء
      const g = ctx.createLinearGradient(0, 0, 0, viewH);
      g.addColorStop(0, '#0b1330');
      g.addColorStop(0.5, '#1a2a4a');
      g.addColorStop(1, '#0d1a30');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);

      // الطريق (الجزء السفلي)
      const roadY = viewH * 0.62;
      ctx.fillStyle = 'rgba(10,14,30,0.65)';
      ctx.fillRect(0, roadY, viewW, viewH - roadY);

      // برك الماء (موزعة في إحداثيات الشاشة)
      for (let i = 0; i < 10; i++) {
        const sx = (i * 210 + 50) % viewW;
        const puddleY = roadY + 30 + (i % 3) * 18;
        ctx.save();
        ctx.globalAlpha = 0.25;
        const pg = ctx.createLinearGradient(sx - 40, puddleY, sx + 40, puddleY);
        pg.addColorStop(0, 'rgba(233,185,196,0)');
        pg.addColorStop(0.5, 'rgba(233,185,196,0.5)');
        pg.addColorStop(1, 'rgba(233,185,196,0)');
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(sx, puddleY, 42, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // خطوط أفقية خفيفة للإيحاء بالعمق
      for (let i = 0; i < 5; i++) {
        const y = roadY - 40 - i * 30;
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = '#FFFDF9';
        ctx.fillRect(0, y, viewW, 1);
        ctx.restore();
      }

      ctx.restore();
    }

    // ... باقي الكود كما هو

    function drawUmbrella(ctx, it) {
      const s = it.radius * 1.2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s, Math.PI, 0);
      const grad = ctx.createLinearGradient(-s, -s, s, 0);
      grad.addColorStop(0, '#E9B9C4');
      grad.addColorStop(1, '#B98B8B');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.1);
      ctx.lineTo(0, s * 0.7);
      ctx.strokeStyle = '#FFFDF9';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    }

    function start(canvas) {
      found = state.progress.level2.memories.length;
      const shelterFound = (state.progress.level2.secrets || []).includes('shelter');

      const items = RAIN_MESSAGES.map((m, i) => {
        const pts = randScatter(RAIN_MESSAGES.length, 0.18)[i];
        return {
          id: m.id, kind: 'interact', shape: 'letter',
          fx: pts.fx, fy: pts.fy, radius: 24,
          data: m, found: state.progress.level2.memories.includes(m.id),
        };
      });

      items.push({
        id: 'shelter', kind: 'interact',
        fx: 0.5, fy: 0.28, radius: 30,
        found: shelterFound,
        drawCustom: drawUmbrella,
      });

      items.push({
        id: 'gust', kind: 'hazard', fx: 0.75, fy: 0.55, radius: 46, slowMs: 700, hidden: false,
      });

      ParticleSystem.setAmbientMode('petals');

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1600, worldHeight: 950,
        interactLabel: 'اضغطي للقراءة',
        drawBackground: bg,
        drawItemShape(ctx, it, scale) {
          if (it.drawCustom) { it.drawCustom(ctx, it, scale); return; }
          WorldEngine.SHAPES.letter(ctx, it, scale);
        },
        items,
        onTick() { ParticleSystem.emitRain(1); },
        onHazard() {
          if (callbacks.onStageMessage) callbacks.onStageMessage('الريح قوية شوية هنا… استني لحظة 🌬️');
        },
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          engine.setPaused(true);
          if (item.id === 'shelter') {
            if (callbacks.onDialogue) {
              callbacks.onDialogue({
                icon: '☂️',
                text: SHELTER_MESSAGE,
                onNext: () => {
                  engine.markFound('shelter');
                  markSecret('level2', 'shelter');
                  engine.setPaused(false);
                },
              });
            }
            return;
          }
          if (callbacks.onDialogue) {
            callbacks.onDialogue({
              icon: '💌',
              text: item.data.text,
              onNext: () => {
                engine.markFound(item.id);
                if (!state.progress.level2.memories.includes(item.id)) {
                  state.progress.level2.memories.push(item.id);
                  found++;
                  addScore(25);
                  if (callbacks.onPersist) callbacks.onPersist();
                }
                if (callbacks.onHud) callbacks.onHud(`💌 ${found}/${RAIN_MESSAGES.length}`);
                engine.setPaused(false);
                if (found >= RAIN_MESSAGES.length) finish();
              },
            });
          }
        },
      });

      if (callbacks.onObjective) callbacks.onObjective('امشي وسط المطر واكتشفي كل رسالة 💌');
      if (callbacks.onHud) callbacks.onHud(`💌 ${found}/${RAIN_MESSAGES.length}`);
      if (callbacks.onEngineReady) callbacks.onEngineReady(engine);
      engine.start();
    }

    function finish() {
      addScore(100);
      if (callbacks.onStageMessage) callbacks.onStageMessage('والمطر بقى قلوب ونجوم... زي إحساسي معاكِ ✨');
      ParticleSystem.emit('heart', window.innerWidth / 2, window.innerHeight / 2, 10, { burst: true, life: 70, gravity: -0.01 });
      setTimeout(() => { if (callbacks.onLevelComplete) callbacks.onLevelComplete('level2'); }, 1800);
    }

    function stop() {
      if (engine) engine.stop();
      engine = null;
      ParticleSystem.clear('rain');
    }
    return { start, stop };
  })();

  /* =====================================================================
     LEVEL 3 — النجوم والأمنية
     ===================================================================== */
  const Level3 = (() => {
    let engine = null;
    let collected = 0;
    let ambientStars = [];
    let wishing = false;

    function makeAmbient(worldW, worldH) {
      ambientStars = [];
      const n = ParticleSystem.isLowPower ? 40 : 80;
      for (let i = 0; i < n; i++) {
        ambientStars.push({
          x: Math.random() * worldW, y: Math.random() * worldH * 0.75,
          r: 1 + Math.random() * 1.6, phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function bg(ctx, view) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, '#060a1c');
      g.addColorStop(1, '#20264a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewW, view.viewH);
      for (const s of ambientStars) {
        s.phase += 0.03;
        const sx = s.x - view.camX * 0.8;
        const sy = s.y - view.camY * 0.8;
        if (sx < -5 || sx > view.viewW + 5) continue;
        ctx.globalAlpha = 0.5 + Math.sin(s.phase) * 0.4;
        ctx.fillStyle = '#F3E6D2';
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function start(canvas) {
      collected = state.progress.level3.stars || 0;
      const worldW = 1300, worldH = 950;
      makeAmbient(worldW, worldH);
      const secretFound = (state.progress.level3.secrets || []).includes('s_secret');

      const items = randScatter(STARS_TARGET, 0.16).map((p, i) => ({
        id: `star_${i}`, kind: 'collect', shape: 'star',
        fx: p.fx, fy: p.fy, radius: 20, glowRadius: 90,
        found: i < collected,
      }));

      items.push({
        id: 's_secret', kind: 'collect', shape: 'star', rare: true,
        fx: 0.5, fy: 0.15, radius: 18, glowRadius: 90,
        hidden: true, revealRadius: 130,
        found: secretFound,
      });

      ParticleSystem.setAmbientMode('none');

      engine = WorldEngine.create({
        canvas,
        worldWidth: worldW, worldHeight: worldH,
        interactLabel: 'اضغطي لتمني أمنية',
        drawBackground: bg,
        items,
        onCollect(it) {
          if (it.id === 's_secret') {
            markSecret('level3', 's_secret');
            return;
          }
          collected++;
          state.progress.level3.stars = collected;
          addScore(20);
          if (callbacks.onHud) callbacks.onHud(`⭐ ${collected}/${STARS_TARGET}`);
          ParticleSystem.emit('sparkle', canvas.clientWidth / 2, canvas.clientHeight / 2, 6, { life: 26, gravity: 0 });
          AudioManager.sfx('heart');
          if (callbacks.onPersist) callbacks.onPersist();
          if (collected >= STARS_TARGET && !wishing) spawnSpecialStar();
        },
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          if (item.id !== 'special_star' || wishing) return;
          wishing = true;
          engine.setPaused(true);
          AudioManager.sfx('click');
          ParticleSystem.emit('sparkle', canvas.clientWidth / 2, canvas.clientHeight / 2, 20, { life: 46, gravity: 0 });
          if (callbacks.onDialogue) {
            callbacks.onDialogue({
              icon: '⭐', text: WISH_RESULT_MESSAGE, onNext: finish,
            });
          }
        },
      });

      if (callbacks.onObjective) callbacks.onObjective(`اجمعي النجوم الخمس ⭐ (${collected}/${STARS_TARGET})`);
      if (callbacks.onHud) callbacks.onHud(`⭐ ${collected}/${STARS_TARGET}`);
      if (callbacks.onEngineReady) callbacks.onEngineReady(engine);
      engine.start();

      if (collected >= STARS_TARGET) spawnSpecialStar();
    }

    function spawnSpecialStar() {
      if (!engine) return;
      if (engine.items.some(i => i.id === 'special_star')) return;
      engine.addItem({
        id: 'special_star', kind: 'interact', shape: 'star', rare: true,
        fx: 0.5, fy: 0.42, radius: 26,
      });
      if (callbacks.onObjective) callbacks.onObjective('لاقي النجمة الخاصة وتمني أمنية 🌟');
      unlockAchievement('wish_maker');
    }

    function finish() {
      addScore(130);
      setTimeout(() => { if (callbacks.onLevelComplete) callbacks.onLevelComplete('level3'); }, 400);
    }

    function stop() { if (engine) engine.stop(); engine = null; wishing = false; }
    return { start, stop };
  })();

  /* =====================================================================
     LEVEL 4 — حديقة الذكريات
     ===================================================================== */
  const Level4 = (() => {
    let engine = null;
    let found = 0;

    function bg(ctx, view) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, '#2c1f33');
      g.addColorStop(1, '#513a4a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewW, view.viewH);
      for (let i = 0; i < 18; i++) {
        const wx = (i * 173) % view.worldW;
        const wy = (i * 121 + 60) % view.worldH;
        const sx = wx - view.camX * 0.85;
        const sy = wy - view.camY * 0.85;
        decoDot(ctx, sx, sy, 4.5, i % 2 === 0 ? '#8fbf8f' : '#E8C8C8', 0.3);
      }
      ctx.restore();
    }

    function start(canvas) {
      found = state.progress.level4.memories.length;
      const secretFound = (state.progress.level4.secrets || []).includes('ms');

      const items = MEMORIES.map((m, i) => {
        const p = randScatter(MEMORIES.length, 0.16)[i];
        return {
          id: m.id, kind: 'interact', shape: 'letter',
          fx: p.fx, fy: p.fy, radius: 24,
          data: m, found: state.progress.level4.memories.includes(m.id),
        };
      });

      items.push({
        id: SECRET_MEMORY.id, kind: 'interact', shape: 'letter',
        fx: 0.5, fy: 0.5, radius: 24,
        data: SECRET_MEMORY, hidden: true, revealRadius: 130,
        found: secretFound,
      });

      ParticleSystem.setAmbientMode('fireflies');

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1500, worldHeight: 1000,
        interactLabel: 'اضغطي لتكتشفي الذكرى',
        drawBackground: bg,
        items,
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          engine.setPaused(true);
          if (callbacks.onDialogue) {
            callbacks.onDialogue({
              icon: item.data.icon,
              text: item.data.text,
              onNext: () => {
                engine.markFound(item.id);
                if (item.id === SECRET_MEMORY.id) {
                  markSecret('level4', 'ms');
                  engine.setPaused(false);
                  return;
                }
                if (!state.progress.level4.memories.includes(item.id)) {
                  state.progress.level4.memories.push(item.id);
                  found++;
                  addScore(25);
                  if (callbacks.onPersist) callbacks.onPersist();
                }
                if (callbacks.onHud) callbacks.onHud(`💌 ${found}/${MEMORIES.length}`);
                engine.setPaused(false);
                if (found >= MEMORIES.length) {
                  unlockAchievement('memory_keeper');
                  finish();
                }
              },
            });
          }
        },
      });

      if (callbacks.onObjective) callbacks.onObjective('اكتشفي كل الذكريات المخبأة في الحديقة 💌');
      if (callbacks.onHud) callbacks.onHud(`💌 ${found}/${MEMORIES.length}`);
      if (callbacks.onEngineReady) callbacks.onEngineReady(engine);
      engine.start();
    }

    function finish() {
      addScore(120);
      if (callbacks.onStageMessage) callbacks.onStageMessage('كل ذكرياتنا... حتة من قلبي ❤️');
      setTimeout(() => { if (callbacks.onLevelComplete) callbacks.onLevelComplete('level4'); }, 1800);
    }

    function stop() { if (engine) engine.stop(); engine = null; }
    return { start, stop };
  })();

  /* =====================================================================
     LEVEL 5 — صندوق الهدية
     ===================================================================== */
  const Level5 = (() => {
    let engine = null;
    const FIREFLIES_NEEDED = 2;
    let fireflies = 0;
    let giftRevealed = false;

    function bg(ctx, view) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, '#060a1c');
      g.addColorStop(1, '#33355e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewW, view.viewH);
      ctx.restore();
    }

    function start(canvas) {
      const already = state.progress.level5.unlocked;
      fireflies = already ? FIREFLIES_NEEDED : (state.progress.level5.fireflies || 0);
      giftRevealed = already || fireflies >= FIREFLIES_NEEDED;

      const items = [
        { id: 'firefly_1', kind: 'collect', shape: 'firefly', fx: 0.28, fy: 0.35, radius: 14, glowRadius: 90, found: already || fireflies > 0 },
        { id: 'firefly_2', kind: 'collect', shape: 'firefly', fx: 0.72, fy: 0.62, radius: 14, glowRadius: 90, found: already || fireflies > 1 },
        {
          id: 'gift_box', kind: 'interact', shape: 'gift',
          fx: 0.5, fy: 0.5, radius: 32,
          found: already,
          hidden: !giftRevealed, revealRadius: 200,
        },
      ];

      ParticleSystem.setAmbientMode('fireflies');

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1100, worldHeight: 850,
        interactLabel: 'اضغطي لفتح الهدية',
        drawBackground: bg,
        items,
        onCollect(it) {
          fireflies++;
          state.progress.level5.fireflies = fireflies;
          addScore(15);
          AudioManager.sfx('heart');
          ParticleSystem.emit('sparkle', canvas.clientWidth / 2, canvas.clientHeight / 2, 8, { life: 30, gravity: 0 });
          if (callbacks.onPersist) callbacks.onPersist();
          if (fireflies >= FIREFLIES_NEEDED && !giftRevealed) {
            giftRevealed = true;
            const gift = engine.items.find(i => i.id === 'gift_box');
            if (gift) gift.hidden = false;
            if (callbacks.onObjective) callbacks.onObjective('لاقي صندوق الهدية وافتحيه 🎁');
          }
        },
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          engine.setPaused(true);
          if (callbacks.onGiftInteract) callbacks.onGiftInteract(() => engine.setPaused(false));
        },
      });

      if (already) {
        if (callbacks.onObjective) callbacks.onObjective('فتحتِ الهدية بالفعل 🎁');
        if (callbacks.onGiftAlreadyOpen) callbacks.onGiftAlreadyOpen();
      } else if (giftRevealed) {
        if (callbacks.onObjective) callbacks.onObjective('لاقي صندوق الهدية وافتحيه 🎁');
      } else {
        if (callbacks.onObjective) callbacks.onObjective('اجمعي ضوء اليراعات الدافئ ✨');
      }
      if (callbacks.onEngineReady) callbacks.onEngineReady(engine);
      engine.start();
    }

    function onPuzzleSuccess() {
      if (engine) engine.markFound('gift_box');
      state.progress.level5.unlocked = true;
      if (callbacks.onPersist) callbacks.onPersist();
      unlockAchievement('birthday_surprise');
      addScore(150);
    }

    function stop() { if (engine) engine.stop(); engine = null; }
    return { start, stop, onPuzzleSuccess };
  })();

  return {
    setState, setCallbacks, addScore,
    Level1, Level2, Level3, Level4, Level5,
    HEARTS_TARGET, STARS_TARGET,
    memoriesTotal: MEMORIES.length,
    rainMessagesTotal: RAIN_MESSAGES.length,
  };
})();
