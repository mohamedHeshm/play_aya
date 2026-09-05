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

  const RAIN_MESSAGES = [
    { id: 'r1', text: 'في نص الزحمة... بفكر فيكِ.' },
    { id: 'r2', text: 'مهما كانت الدنيا تقيلة، صوتك بيهدّيني.' },
    { id: 'r3', text: 'إنتِ المكان اللي بارتاح فيه.' },
    { id: 'r4', text: 'وكل ما الدنيا تمطر، بتذكر إن معاكِ بتبقى أجمل.' },
  ];

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

  /* =====================================================================
     خلفيات زخرفية بسيطة (2.5D) لكل مرحلة
     ===================================================================== */
  function skyBg(top, bottom) {
    return (ctx, view) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewH ? view.viewW : 0, view.viewH);
      ctx.restore();
    };
  }

  /* =====================================================================
     LEVEL 1 — جمع القلوب
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

      // زهور أرضية بسيطة (Parallax خفيف حسب موقع الكاميرا)
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 26; i++) {
        const wx = (i * 137) % view.worldW;
        const wy = (i * 91 + 40) % view.worldH;
        const sx = wx - view.camX * 0.9;
        const sy = wy - view.camY * 0.9;
        ctx.font = '22px sans-serif';
        ctx.fillText(i % 3 === 0 ? '🌸' : (i % 3 === 1 ? '🌿' : '🌷'), sx, sy);
      }
      ctx.restore();
    }

    function start(canvas) {
      collected = state.progress.level1.hearts || 0;
      const items = randScatter(HEARTS_TARGET).map((p, i) => ({
        id: `heart_${i}`,
        kind: 'collect',
        emoji: Math.random() < 0.15 ? '💖' : '❤️',
        fx: p.fx, fy: p.fy,
        radius: 26, glowRadius: 90,
        special: Math.random() < 0.15,
        found: i < collected, // استكمال التقدم المحفوظ
      }));

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1500, worldHeight: 1050,
        playerEmoji: '💗',
        drawBackground: bg,
        items,
        onCollect(it) {
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
     LEVEL 2 — المطر والذكريات
     ===================================================================== */
  const Level2 = (() => {
    let engine = null;
    let found = 0;

    function bg(ctx, view) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, view.viewH);
      g.addColorStop(0, '#0b1330');
      g.addColorStop(1, '#1c2b4a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.viewW, view.viewH);

      // شارع مبلل بانعكاسات بسيطة
      const roadY = view.viewH * 0.62;
      ctx.fillStyle = 'rgba(10,14,30,0.65)';
      ctx.fillRect(0, roadY, view.viewW, view.viewH - roadY);
      for (let i = 0; i < 10; i++) {
        const wx = (i * 210) % view.worldW;
        const sx = wx - view.camX;
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
      ctx.restore();
    }

    function start(canvas) {
      found = state.progress.level2.memories.length;
      const items = RAIN_MESSAGES.map((m, i) => {
        const pts = randScatter(RAIN_MESSAGES.length, 0.18)[i];
        return {
          id: m.id, kind: 'interact', emoji: '💌',
          fx: pts.fx, fy: pts.fy, radius: 26,
          data: m, found: state.progress.level2.memories.includes(m.id),
        };
      });

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1600, worldHeight: 950,
        playerEmoji: '🚶‍♀️',
        interactLabel: 'اضغطي للقراءة',
        drawBackground: bg,
        items,
        onTick() { ParticleSystem.emitRain(1); },
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          engine.setPaused(true);
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

      const items = randScatter(STARS_TARGET, 0.16).map((p, i) => ({
        id: `star_${i}`, kind: 'collect', emoji: '⭐',
        fx: p.fx, fy: p.fy, radius: 22, glowRadius: 90,
        found: i < collected,
      }));

      engine = WorldEngine.create({
        canvas,
        worldWidth: worldW, worldHeight: worldH,
        playerEmoji: '💗',
        interactLabel: 'اضغطي لتمني أمنية',
        drawBackground: bg,
        items,
        onCollect(it) {
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
        id: 'special_star', kind: 'interact', emoji: '🌟',
        fx: 0.5, fy: 0.42, radius: 30,
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
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 20; i++) {
        const wx = (i * 173) % view.worldW;
        const wy = (i * 121 + 60) % view.worldH;
        const sx = wx - view.camX * 0.85;
        const sy = wy - view.camY * 0.85;
        ctx.font = '20px sans-serif';
        ctx.fillText(i % 2 === 0 ? '🌿' : '🌸', sx, sy);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function start(canvas) {
      found = state.progress.level4.memories.length;
      const items = MEMORIES.map((m, i) => {
        const p = randScatter(MEMORIES.length, 0.16)[i];
        return {
          id: m.id, kind: 'interact', emoji: m.icon,
          fx: p.fx, fy: p.fy, radius: 26,
          data: m, found: state.progress.level4.memories.includes(m.id),
        };
      });

      engine = WorldEngine.create({
        canvas,
        worldWidth: 1500, worldHeight: 1000,
        playerEmoji: '💗',
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
      engine = WorldEngine.create({
        canvas,
        worldWidth: 1100, worldHeight: 850,
        playerEmoji: '💗',
        interactLabel: 'اضغطي لفتح الهدية',
        drawBackground: bg,
        items: [{
          id: 'gift_box', kind: 'interact', emoji: '🎁',
          fx: 0.5, fy: 0.5, radius: 34, found: already,
        }],
        onNearChange(item) { if (callbacks.onNearChange) callbacks.onNearChange(item); },
        onInteract(item) {
          engine.setPaused(true);
          if (callbacks.onGiftInteract) callbacks.onGiftInteract(() => engine.setPaused(false));
        },
      });

      if (already) {
        if (callbacks.onObjective) callbacks.onObjective('فتحتِ الهدية بالفعل 🎁');
        if (callbacks.onGiftAlreadyOpen) callbacks.onGiftAlreadyOpen();
      } else {
        if (callbacks.onObjective) callbacks.onObjective('لاقي صندوق الهدية وافتحيه 🎁');
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
