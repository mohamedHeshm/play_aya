/* =====================================================================
   game.js — منطق اللعبة لكل المراحل الخمس
   =====================================================================
   ✏️✏️✏️  هنا تقدر تعدّلي كل المحتوى بسهولة:
   - رسائل حديقة الذكريات (MEMORIES)
   - رسائل ليلة المطر (RAIN_MESSAGES)
   - رسائل الأمنية (WISH_MESSAGES)
   - عدد القلوب المطلوبة لإنهاء المرحلة الأولى
   ===================================================================== */

const Game = (() => {

  /* ================== المحتوى القابل للتعديل ================== */

  // ✏️ عدّلي عدد القلوب المطلوب جمعها لإنهاء المرحلة ١
  const HEARTS_TARGET = 15;

  // ✏️ عدّلي هنا محتوى حديقة الذكريات (أضيفي/احذفي/غيّري كما تحبين)
  // image: ضعي مسار صورة داخل assets/images/ أو اتركيه فارغًا ""
  const MEMORIES = [
    { id: 'm1', icon: '🌹', image: '', text: 'أول مرة كلمتك فيها حسيت إن في حاجة حلوة جاية.' },
    { id: 'm2', icon: '📸', image: '', text: 'أول صورة سوا... لسه فاكرها زي إمبارح.' },
    { id: 'm3', icon: '☕', image: '', text: 'أول قعدة سوا، وضحكنا لحد ما وجعنا.' },
    { id: 'm4', icon: '🎵', image: '', text: 'الأغنية اللي بقت "بتاعتنا" من غير ما نتفق.' },
    { id: 'm5', icon: '💌', image: '', text: 'أول رسالة حسيت فيها إنك فاهماني أكتر من نفسي.' },
    { id: 'm6', icon: '🌙', image: '', text: 'الليالي اللي قعدنا نتكلم فيها لحد الفجر.' },
    { id: 'm7', icon: '🎁', image: '', text: 'أول هدية بسيطة فرحتك أكتر من أي حاجة غالية.' },
    { id: 'm8', icon: '❤️', image: '', text: 'اللحظة اللي حسيت فيها إني بحبك بجد.' },
    { id: 'm9', icon: '🌟', image: '', text: 'وكل يوم بعدها... بقيت أنتِ أمنيتي.' },
  ];

  // ✏️ رسائل تظهر تدريجيًا أثناء تحرك اللاعب في مرحلة المطر
  const RAIN_MESSAGES = [
    'في نص الزحمة... بفكر فيكِ.',
    'مهما كانت الدنيا تقيلة، صوتك بيهدّيني.',
    'إنتِ المكان اللي بارتاح فيه.',
    'كل حاجة حواليا بتفضل تفتكرني بيكِ.',
    'وكل ما الدنيا تمطر، بتذكر إن معاكِ بتبقى أجمل.',
  ];

  // ✏️ الرسالة اللي تظهر بعد اختيار النجمة
  const WISH_RESULT_MESSAGE = 'أمنيتي الوحيدة إنك تفضلي مبسوطة، دايمًا، جنبي أو من بعيد ❤️';

  /* ================== حالة اللعبة ================== */

  let state = null; // يُحقن من main.js عبر setState
  let callbacks = {}; // onScoreChange, onStageComplete, onAchievement, ...

  function setState(s) { state = s; }
  function setCallbacks(cb) { callbacks = { ...callbacks, ...cb }; }

  function addScore(points) {
    state.score += points;
    if (callbacks.onScoreChange) callbacks.onScoreChange(state.score, state.heartsCollected);
  }

  /* =====================================================================
     المرحلة ١ : جمع القلوب
     ===================================================================== */
  const Stage1 = (() => {
    let canvas, ctx, raf;
    let hearts = [];
    let player = { x: 0, y: 0, r: 26, targetX: 0, targetY: 0 };
    let width = 0, height = 0;
    let spawnTimer = 0;
    let active = false;
    let dpr = 1;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (player.x === 0) {
        player.x = width / 2;
        player.y = height * 0.75;
        player.targetX = player.x;
        player.targetY = player.y;
      }
    }

    function spawnHeart() {
      const x = 30 + Math.random() * (width - 60);
      const special = Math.random() < 0.15;
      hearts.push(Physics.createFallingHeart(x, -30, width, { special }));
    }

    function pointerMove(x, y) {
      player.targetX = Math.max(player.r, Math.min(width - player.r, x));
      player.targetY = Math.max(player.r, Math.min(height - player.r, y));
    }

    function onPointerDown(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      pointerMove(p.clientX - rect.left, p.clientY - rect.top);
    }
    function onPointerMove(e) {
      if (e.touches && e.touches.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      pointerMove(p.clientX - rect.left, p.clientY - rect.top);
    }

    // Keyboard control (اختياري)
    const keys = {};
    function onKeyDown(e) { keys[e.key] = true; }
    function onKeyUp(e) { keys[e.key] = false; }

    function updatePlayer() {
      if (keys['ArrowLeft'])  player.targetX -= 6;
      if (keys['ArrowRight']) player.targetX += 6;
      if (keys['ArrowUp'])    player.targetY -= 6;
      if (keys['ArrowDown'])  player.targetY += 6;
      player.targetX = Math.max(player.r, Math.min(width - player.r, player.targetX));
      player.targetY = Math.max(player.r, Math.min(height - player.r, player.targetY));

      // حركة ناعمة نحو الهدف
      player.x += (player.targetX - player.x) * 0.2;
      player.y += (player.targetY - player.y) * 0.2;
    }

    function drawPlayer() {
      ctx.save();
      const grad = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, player.r);
      grad.addColorStop(0, '#ffe3f0');
      grad.addColorStop(1, '#ff6fa5');
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(255,111,165,0.7)';
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `${player.r}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💗', player.x, player.y + 2);
    }

    function drawHeartShape(h) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rotation);
      ctx.font = `${h.radius * 1.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(h.special ? '💖' : '❤️', 0, 0);
      ctx.restore();
    }

    function checkCollisions() {
      for (const h of hearts) {
        if (h.collected) continue;
        if (Physics.circleCollision(player.x, player.y, player.r, h.x, h.y, h.radius)) {
          h.collected = true;
          collectHeart(h);
        }
      }
      hearts = hearts.filter(h => !h.collected);
    }

    function collectHeart(h) {
      state.heartsCollected++;
      addScore(h.special ? 50 : 10);
      ParticleSystem.emit('sparkle', h.x, h.y, 8, { life: 30, size: 10, gravity: 0 });
      ParticleSystem.emit('heart', h.x, h.y, 3, { life: 40, size: 10, gravity: -0.02, rise: true });
      AudioManager.sfx('heart');
      if (navigator.vibrate) navigator.vibrate(15);

      if (state.heartsCollected === 1) unlockAchievement('first_heart');
      if (state.heartsCollected === 10) unlockAchievement('heart_collector');

      if (callbacks.onScoreChange) callbacks.onScoreChange(state.score, state.heartsCollected);

      if (state.heartsCollected >= HEARTS_TARGET && active) {
        finishStage();
      }
    }

    function unlockAchievement(id) {
      const first = Achievements.unlock(id);
      if (first && callbacks.onAchievement) callbacks.onAchievement(id);
    }

    function finishStage() {
      active = false;
      addScore(100);
      if (callbacks.onStageMessage) {
        callbacks.onStageMessage('stage1', 'جمعتِ كل القلوب… وقلبي كمان بقى كله ليكِ ❤️');
      }
      setTimeout(() => {
        if (callbacks.onStageComplete) callbacks.onStageComplete('stage1');
      }, 2200);
    }

    function loop() {
      if (!active) return;
      ctx.clearRect(0, 0, width, height);

      spawnTimer++;
      const spawnRate = ParticleSystem.isLowPower ? 55 : 38;
      if (spawnTimer > spawnRate && hearts.length < (ParticleSystem.isLowPower ? 8 : 14)) {
        spawnHeart();
        spawnTimer = 0;
      }

      const bounds = { width, height };
      for (const h of hearts) Physics.updateFallingHeart(h, bounds);
      hearts = hearts.filter(h => h.y < height + 60);

      updatePlayer();
      checkCollisions();

      for (const h of hearts) drawHeartShape(h);
      drawPlayer();

      raf = requestAnimationFrame(loop);
    }

    function start(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      hearts = [];
      spawnTimer = 0;
      active = true;
      resize();

      canvas.addEventListener('touchstart', onPointerDown, { passive: true });
      canvas.addEventListener('touchmove', onPointerMove, { passive: true });
      canvas.addEventListener('mousedown', onPointerDown);
      canvas.addEventListener('mousemove', onPointerMove);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', resize);

      raf = requestAnimationFrame(loop);
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchmove', onPointerMove);
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
    }

    return { start, stop };
  })();

  /* =====================================================================
     المرحلة ٢ : حديقة الذكريات
     ===================================================================== */
  const Stage2 = (() => {
    let container, continueBtn;

    function render() {
      container.innerHTML = '';
      MEMORIES.forEach(mem => {
        const el = document.createElement('div');
        el.className = 'memory-item';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'ذكرى');
        el.textContent = mem.icon;
        el.style.animationDelay = `${Math.random() * 2}s`;
        if (state.memoriesDiscovered.includes(mem.id)) el.classList.add('discovered');

        const open = () => openMemory(mem, el);
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });

        container.appendChild(el);
      });
      updateContinueVisibility();
    }

    function openMemory(mem, el) {
      AudioManager.sfx('click');
      if (!state.memoriesDiscovered.includes(mem.id)) {
        state.memoriesDiscovered.push(mem.id);
        el.classList.add('discovered');
        addScore(25);
        ParticleSystem.emit('sparkle', window.innerWidth / 2, window.innerHeight / 2, 6, { life: 30, gravity: 0 });
        if (state.memoriesDiscovered.length >= MEMORIES.length) {
          const first = Achievements.unlock('memory_keeper');
          if (first && callbacks.onAchievement) callbacks.onAchievement('memory_keeper');
        }
        updateContinueVisibility();
      }
      if (callbacks.onOpenMemory) callbacks.onOpenMemory(mem);
    }

    function updateContinueVisibility() {
      if (state.memoriesDiscovered.length >= MEMORIES.length) {
        continueBtn.classList.remove('hidden');
      }
    }

    function start(containerEl, continueBtnEl) {
      container = containerEl;
      continueBtn = continueBtnEl;
      continueBtn.classList.add('hidden');
      render();
    }

    function stop() { /* لا حاجة لتنظيف خاص */ }

    return { start, stop, get total() { return MEMORIES.length; } };
  })();

  /* =====================================================================
     المرحلة ٣ : ليلة المطر
     ===================================================================== */
  const Stage3 = (() => {
    let canvas, ctx, raf;
    let width, height, dpr = 1;
    let player = { x: 0, y: 0, r: 22 };
    let active = false;
    let messageIndex = 0;
    let stepDistance = 0;
    let lastX = 0;
    let converting = false;
    let convertProgress = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (player.x === 0) { player.x = width / 2; player.y = height * 0.7; lastX = player.x; }
    }

    function movePlayer(x) {
      const prev = player.x;
      player.x = Math.max(player.r, Math.min(width - player.r, x));
      stepDistance += Math.abs(player.x - prev);
      if (stepDistance > 90 && messageIndex < RAIN_MESSAGES.length) {
        showNextMessage();
        stepDistance = 0;
      }
    }

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      if (!p) return;
      movePlayer(p.clientX - rect.left);
    }
    function onPointerDown(e) { onPointerMove(e); }

    const keys = {};
    function onKeyDown(e) { keys[e.key] = true; }
    function onKeyUp(e) { keys[e.key] = false; }

    function showNextMessage() {
      const msg = RAIN_MESSAGES[messageIndex];
      messageIndex++;
      if (callbacks.onStageMessage) callbacks.onStageMessage('stage3', msg);
      if (messageIndex >= RAIN_MESSAGES.length) {
        setTimeout(startConversion, 1800);
      }
    }

    function startConversion() {
      converting = true;
      convertProgress = 0;
    }

    function drawPlayer() {
      ctx.save();
      ctx.font = `${player.r * 2}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(180,150,255,0.6)';
      ctx.shadowBlur = 18;
      ctx.fillText('🚶‍♀️', player.x, player.y);
      ctx.restore();
    }

    function finishStage() {
      active = false;
      addScore(100);
      setTimeout(() => {
        if (callbacks.onStageComplete) callbacks.onStageComplete('stage3');
      }, 1500);
    }

    function loop() {
      if (!active) return;
      ctx.clearRect(0, 0, width, height);

      if (keys['ArrowLeft'])  movePlayer(player.x - 6);
      if (keys['ArrowRight']) movePlayer(player.x + 6);

      if (!converting) {
        ParticleSystem.emitRain(1);
      } else {
        convertProgress++;
        if (convertProgress % 3 === 0) {
          ParticleSystem.emit('heart', Math.random() * width, height + 10, 1,
            { life: 90, vy: -(2 + Math.random() * 1.5), gravity: -0.01, size: 10 + Math.random() * 8 });
          ParticleSystem.emit('star', Math.random() * width, height + 10, 1,
            { life: 90, vy: -(1.5 + Math.random() * 1.5), gravity: -0.01, size: 6 + Math.random() * 6 });
        }
        if (convertProgress > 150) {
          finishStage();
          if (callbacks.onStageMessage) {
            callbacks.onStageMessage('stage3', 'والمطر بقى قلوب ونجوم... زي إحساسي معاكِ ✨');
          }
        }
      }

      drawPlayer();
      raf = requestAnimationFrame(loop);
    }

    function start(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      active = true;
      converting = false;
      convertProgress = 0;
      messageIndex = 0;
      stepDistance = 0;
      player.x = 0;
      ParticleSystem.clear('rain');
      resize();

      canvas.addEventListener('touchstart', onPointerDown, { passive: true });
      canvas.addEventListener('touchmove', onPointerMove, { passive: true });
      canvas.addEventListener('mousedown', onPointerDown);
      canvas.addEventListener('mousemove', onPointerMove);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', resize);

      // رسالة ترحيبية أولى
      setTimeout(() => showNextMessage(), 800);

      raf = requestAnimationFrame(loop);
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      ParticleSystem.clear('rain');
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchmove', onPointerMove);
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
    }

    return { start, stop };
  })();

  /* =====================================================================
     المرحلة ٤ : اصنعي أمنيتك (النجوم)
     ===================================================================== */
  const Stage4 = (() => {
    let canvas, ctx, raf;
    let width, height, dpr = 1;
    let stars = [];
    let active = false;
    let chosen = null;
    let forming = false;
    let formProgress = 0;

    // نقاط شكل قلب لتجميع النجوم عليها
    function heartPoints(count, cx, cy, scale) {
      const pts = [];
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push({ x: cx + x * scale, y: cy + y * scale });
      }
      return pts;
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function generateStars() {
      stars = [];
      const count = ParticleSystem.isLowPower ? 22 : 36;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: 20 + Math.random() * (width - 40),
          y: 20 + Math.random() * (height - 40),
          r: 3 + Math.random() * 3,
          twinkle: Math.random() * Math.PI * 2,
          homeX: 0, homeY: 0,
        });
      }
    }

    function drawStar(s, size, glow) {
      ctx.save();
      ctx.shadowColor = glow ? 'rgba(255,214,232,0.9)' : 'rgba(255,255,255,0.4)';
      ctx.shadowBlur = glow ? 18 : 6;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      const cx = s.x, cy = s.y;
      for (let i = 0; i < 5; i++) {
        const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const a2 = a1 + Math.PI / 5;
        ctx.lineTo(cx + Math.cos(a1) * size, cy + Math.sin(a1) * size);
        ctx.lineTo(cx + Math.cos(a2) * size * 0.45, cy + Math.sin(a2) * size * 0.45);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function onClick(e) {
      if (chosen || !active) return;
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      const x = p.clientX - rect.left;
      const y = p.clientY - rect.top;
      let closest = null, minDist = 40;
      for (const s of stars) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < minDist) { minDist = d; closest = s; }
      }
      if (closest) selectStar(closest);
    }

    function selectStar(star) {
      chosen = star;
      AudioManager.sfx('click');
      ParticleSystem.emit('sparkle', star.x, star.y, 16, { life: 40, gravity: 0 });
      if (navigator.vibrate) navigator.vibrate(20);

      const pts = heartPoints(stars.length, width / 2, height / 2, Math.min(width, height) / 26);
      stars.forEach((s, i) => { s.homeX = pts[i].x; s.homeY = pts[i].y; });

      setTimeout(() => { forming = true; }, 500);
    }

    function finishStage() {
      active = false;
      addScore(30 + 100);
      const first = Achievements.unlock('wish_maker');
      if (first && callbacks.onAchievement) callbacks.onAchievement('wish_maker');
      if (callbacks.onStageMessage) callbacks.onStageMessage('stage4', WISH_RESULT_MESSAGE);
      setTimeout(() => {
        if (callbacks.onStageComplete) callbacks.onStageComplete('stage4');
      }, 2400);
    }

    function loop() {
      if (!active) return;
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        s.twinkle += 0.05;
        const twinkleSize = s.r + Math.sin(s.twinkle) * 0.8;

        if (forming) {
          s.x += (s.homeX - s.x) * 0.08;
          s.y += (s.homeY - s.y) * 0.08;
        }

        drawStar(s, twinkleSize, s === chosen);
      }

      if (forming) {
        formProgress++;
        if (formProgress > 90 && active) {
          finishStage();
        }
      }

      raf = requestAnimationFrame(loop);
    }

    function start(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      active = true;
      chosen = null;
      forming = false;
      formProgress = 0;
      resize();
      generateStars();

      canvas.addEventListener('touchstart', onClick, { passive: true });
      canvas.addEventListener('mousedown', onClick);
      window.addEventListener('resize', resize);

      raf = requestAnimationFrame(loop);
    }

    function stop() {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('touchstart', onClick);
      canvas.removeEventListener('mousedown', onClick);
      window.removeEventListener('resize', resize);
    }

    return { start, stop };
  })();

  /* =====================================================================
     المرحلة ٥ : الهدية
     ===================================================================== */
  const Stage5 = (() => {
    function open(boxEl, onDone) {
      AudioManager.sfx('giftOpen');
      boxEl.classList.add('opening');
      setTimeout(() => {
        boxEl.classList.remove('opening');
        boxEl.classList.add('opened');
        const rect = boxEl.getBoundingClientRect();
        ParticleSystem.emit('confetti', rect.left + rect.width / 2, rect.top, 40, { burst: true, life: 90, gravity: 0.15 });
        ParticleSystem.emit('heart', rect.left + rect.width / 2, rect.top, 20, { burst: true, life: 80, gravity: 0.05 });
        ParticleSystem.emit('star', rect.left + rect.width / 2, rect.top, 15, { burst: true, life: 80, gravity: 0.05 });
        AudioManager.sfx('celebration');
        const first = Achievements.unlock('birthday_surprise');
        if (first && callbacks.onAchievement) callbacks.onAchievement('birthday_surprise');
        addScore(50);
        if (onDone) onDone();
      }, 500);
    }
    return { open };
  })();

  return {
    setState, setCallbacks, addScore,
    Stage1, Stage2, Stage3, Stage4, Stage5,
    HEARTS_TARGET,
    get memoriesTotal() { return MEMORIES.length; },
  };
})();
