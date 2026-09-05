/* =====================================================================
   main.js — نقطة الدخول: يربط كل الأنظمة ببعض ويدير تدفق اللعبة
   =====================================================================
   ✏️✏️✏️ أهم الأماكن اللي هتعدّلي فيها:
   - CONFIG.videoFile          -> اسم فيديو عيد الميلاد
   - CONFIG.introLine          -> الجملة الافتتاحية
   ===================================================================== */

const CONFIG = {
  videoFile: 'assets/video/birthday-video.mp4',
  introLine: 'في مكان بعيد… كان فيه ولد عنده أمنية واحدة…',
};

(function () {
  'use strict';

  const LEVEL_LABELS = {
    level1: 'LEVEL 01', level2: 'LEVEL 02', level3: 'LEVEL 03',
    level4: 'LEVEL 04', level5: 'LEVEL 05',
  };

  const $ = (id) => document.getElementById(id);

  let state = Storage.load();
  let currentLevelId = null;
  let activeEngine = null;

  const LEVEL_MODULES = {
    level1: Game.Level1, level2: Game.Level2, level3: Game.Level3,
    level4: Game.Level4, level5: Game.Level5,
  };

  const screens = {
    intro: $('screen-intro'),
    worldmap: $('screen-worldmap'),
    level: $('screen-level'),
    giftfinal: $('screen-giftfinal'),
    final: $('screen-final'),
  };

  const hud = $('hud');
  const joystick = $('joystick');
  const interactBtn = $('interact-btn');
  const restartBtn = $('restart-btn');
  const musicToggle = $('music-toggle');
  const restartConfirm = $('restart-confirm');

  /* ---------------- تهيئة الأنظمة ---------------- */
  ParticleSystem.init($('particle-canvas'));
  AudioManager.init();
  AudioManager.setMusicOn(state.musicOn);
  Achievements.init(state.achievements);
  Achievements.onUnlock(() => persist());

  Game.setState(state);
  Game.setCallbacks({
    onScoreChange() { persist(); },
    onHud(text) { $('hud-counter').textContent = text; },
    onObjective(text) { showObjective(text); },
    onStageMessage(text) { showObjective(text, 3200); },
    onLevelComplete(levelId) { handleLevelComplete(levelId); },
    onAchievement(id) { showAchievementToast(id); },
    onSecretFound() { showSecretToast(); },
    onPersist() { persist(); },
    onNearChange(item) { updateInteractButton(item); },
    onDialogue(opts) { showDialogue(opts); },
    onEngineReady(engine) { activeEngine = engine; },
    onGiftInteract(resumeFn) { openGiftPuzzle(resumeFn); },
    onGiftAlreadyOpen() {
      setTimeout(() => {
        if (currentLevelId) { LEVEL_MODULES[currentLevelId].stop(); currentLevelId = null; activeEngine = null; }
        showScreen('giftfinal');
        revealGiftMessage(true);
      }, 300);
    },
  });

  /* ---------------- أول تفاعل من المستخدم لفتح الصوت ---------------- */
  function unlockAudioOnce() {
    AudioManager.unlockOnFirstInteraction();
    document.removeEventListener('touchstart', unlockAudioOnce);
    document.removeEventListener('mousedown', unlockAudioOnce);
    document.removeEventListener('keydown', unlockAudioOnce);
  }
  document.addEventListener('touchstart', unlockAudioOnce, { passive: true });
  document.addEventListener('mousedown', unlockAudioOnce);
  document.addEventListener('keydown', unlockAudioOnce);

  /* منع الزوم بالضغط المزدوج + منع التمرير */
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  /* ---------------- حفظ الحالة ---------------- */
  function persist() {
    state.achievements = Achievements.getUnlocked();
    Storage.save(state);
  }

  function hasProgress() {
    return state.levelsCompleted.length > 0 || (state.currentLevel && state.currentLevel > 0);
  }

  /* ---------------- التنقل بين الشاشات ---------------- */
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    hud.classList.toggle('hidden', name !== 'level');
    joystick.classList.toggle('hidden', name !== 'level');
    interactBtn.classList.toggle('hidden', name !== 'level');
    restartBtn.classList.toggle('hidden', name === 'intro');
    if (name !== 'level') ParticleSystem.setAmbientMode('petals');
  }

  function goToWorldMap() {
    if (currentLevelId) {
      LEVEL_MODULES[currentLevelId].stop();
      currentLevelId = null;
      activeEngine = null;
    }
    showScreen('worldmap');
    WorldMap.render($('worldmap-nodes'), state, (id) => enterLevel(id));
  }

  function enterLevel(id) {
    currentLevelId = id;
    $('hud-counter').textContent = '';
    $('hud-objective').textContent = '';
    $('hud-objective').classList.remove('show');
    $('hud-level-name').textContent = LEVEL_LABELS[id];
    updateInteractButton(null);

    const levelScreen = screens.level;
    levelScreen.classList.add('screen-fading');
    showScreen('level');
    state.currentLevel = parseInt(id.replace('level', ''), 10);
    persist();
    // ننتظر إطارين لضمان أن أبعاد الـ canvas صحيحة بعد ظهور الشاشة
    requestAnimationFrame(() => requestAnimationFrame(() => {
      LEVEL_MODULES[id].start($('level-canvas'));
      requestAnimationFrame(() => levelScreen.classList.remove('screen-fading'));
    }));
  }

  function handleLevelComplete(levelId) {
    if (!state.levelsCompleted.includes(levelId)) state.levelsCompleted.push(levelId);
    persist();
    AudioManager.sfx('stageComplete');
    showLevelCompleteBanner();

    const explorationDone = ['level1', 'level2', 'level3', 'level4'].every(l => state.levelsCompleted.includes(l));
    if (explorationDone) {
      const first = Achievements.unlock('love_explorer');
      if (first) showAchievementToast('love_explorer');
    }

    setTimeout(() => goToWorldMap(), 1700);
  }

  function showLevelCompleteBanner() {
    const el = $('level-complete-banner');
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('show'));
    ParticleSystem.emit('confetti', window.innerWidth / 2, window.innerHeight / 2, 24, { burst: true, life: 70, gravity: 0.12 });
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 400);
    }, 1300);
  }

  /* ---------------- الشارة/الهدف العائم ---------------- */
  let objTimer = null;
  function showObjective(text, duration = 2600) {
    const el = $('hud-objective');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(objTimer);
    objTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  /* ---------------- زر التفاعل + Joystick ---------------- */
  function updateInteractButton(item) {
    interactBtn.classList.toggle('is-active', !!item);
  }
  interactBtn.addEventListener('click', () => {
    if (activeEngine) activeEngine.triggerInteract();
  });

  (function setupJoystick() {
    const base = joystick.querySelector('.joystick__base');
    const stick = $('joystick-stick');
    let dragging = false;
    let baseRect = null;
    let radius = 1;

    function start(e) {
      dragging = true;
      baseRect = base.getBoundingClientRect();
      radius = baseRect.width / 2;
      base.setPointerCapture?.(e.pointerId);
      move(e);
    }
    function move(e) {
      if (!dragging || !baseRect) return;
      const cx = baseRect.left + baseRect.width / 2;
      const cy = baseRect.top + baseRect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) { dx = (dx / dist) * radius; dy = (dy / dist) * radius; }
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
      if (activeEngine) activeEngine.setInputVector(dx / radius, dy / radius);
    }
    function end() {
      dragging = false;
      stick.style.transform = 'translate(0, 0)';
      if (activeEngine) activeEngine.setInputVector(0, 0);
    }

    base.addEventListener('pointerdown', start);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  })();

  /* ---------------- صندوق الحوار داخل اللعبة ---------------- */
  function showDialogue({ icon, text, onNext }) {
    $('dialogue-icon').textContent = icon || '💌';
    $('dialogue-text').textContent = text;
    const box = $('dialogue-box');
    box.classList.remove('hidden');
    requestAnimationFrame(() => box.classList.add('show'));
    $('dialogue-next').onclick = () => {
      AudioManager.sfx('click');
      box.classList.remove('show');
      setTimeout(() => box.classList.add('hidden'), 250);
      if (onNext) onNext();
    };
  }

  /* ---------------- لغز صندوق الهدية ---------------- */
  function openGiftPuzzle() {
    const container = $('puzzle-buttons');
    container.innerHTML = '';
    container.classList.remove('shake');
    const order = [1, 2, 3].sort(() => Math.random() - 0.5);
    let expected = 1;

    order.forEach((step) => {
      const btn = document.createElement('button');
      btn.className = 'puzzle-heart';
      btn.textContent = '❤️';
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (step === expected) {
          btn.disabled = true;
          btn.classList.add('is-correct');
          AudioManager.sfx('click');
          expected++;
          if (expected > 3) setTimeout(succeed, 450);
        } else {
          AudioManager.sfx('click');
          container.classList.add('shake');
          if (navigator.vibrate) navigator.vibrate(30);
          setTimeout(() => {
            container.classList.remove('shake');
            expected = 1;
            container.querySelectorAll('.puzzle-heart').forEach(b => {
              b.disabled = false;
              b.classList.remove('is-correct');
            });
          }, 420);
        }
      });
      container.appendChild(btn);
    });

    $('puzzle-overlay').classList.remove('hidden');
  }

  function succeed() {
    $('puzzle-overlay').classList.add('hidden');
    Game.Level5.onPuzzleSuccess();
    AudioManager.sfx('giftOpen');
    const cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
    ParticleSystem.emit('confetti', cx, cy, 34, { burst: true, life: 85, gravity: 0.15 });
    ParticleSystem.emit('heart', cx, cy, 18, { burst: true, life: 75, gravity: 0.05 });
    ParticleSystem.emit('star', cx, cy, 12, { burst: true, life: 75, gravity: 0.05 });
    AudioManager.sfx('celebration');
    setTimeout(() => {
      if (currentLevelId) { LEVEL_MODULES[currentLevelId].stop(); currentLevelId = null; activeEngine = null; }
      showScreen('giftfinal');
      revealGiftMessage(false);
    }, 900);
  }

  /* ---------------- بطاقة الرسالة النهائية: typewriter RTL ---------------- */
  let typeTimer = null;
  function revealGiftMessage(instant) {
    const p = $('gift-message-text');
    if (!p) return;
    const full = (p.dataset.text || '').replace(/\r/g, '');
    clearInterval(typeTimer);
    p.textContent = instant ? full : '';
    p.classList.add('is-typing');
    if (instant) { p.classList.remove('is-typing'); return; }
    let i = 0;
    typeTimer = setInterval(() => {
      i++;
      p.textContent = full.slice(0, i);
      if (i >= full.length) {
        clearInterval(typeTimer);
        p.classList.remove('is-typing');
      }
    }, 38);
  }

  $('btn-open-video').addEventListener('click', openVideo);

  /* ---------------- الفيديو ---------------- */
  const videoModal = $('video-modal');
  const videoEl = $('birthday-video');

  function openVideo() {
    AudioManager.sfx('click');
    AudioManager.pauseMusic();
    videoEl.src = CONFIG.videoFile;
    videoModal.classList.remove('hidden');
    $('video-outro').classList.add('hidden');
    $('btn-video-continue').classList.add('hidden');
    const p = videoEl.play();
    if (p && p.catch) p.catch(() => { /* المتصفح منع التشغيل التلقائي */ });
  }

  videoEl.addEventListener('ended', () => {
    $('video-outro').classList.remove('hidden');
    $('btn-video-continue').classList.remove('hidden');
    ParticleSystem.emit('heart', window.innerWidth / 2, window.innerHeight / 2, 20, { burst: true, life: 90, gravity: -0.01 });
  });

  $('video-close').addEventListener('click', () => {
    videoEl.pause();
    videoModal.classList.add('hidden');
    if (state.musicOn) AudioManager.playMusic();
  });

  $('btn-video-continue').addEventListener('click', () => {
    videoEl.pause();
    videoModal.classList.add('hidden');
    goToFinalScreen();
  });

  function goToFinalScreen() {
    if (!state.levelsCompleted.includes('level5')) state.levelsCompleted.push('level5');
    persist();
    showScreen('final');
    ParticleSystem.emit('confetti', window.innerWidth / 2, window.innerHeight * 0.35, 40, { burst: true, life: 90, gravity: 0.15 });
    if (state.musicOn) AudioManager.playMusic();
  }

  /* ---------------- Achievement Toast ---------------- */
  let toastTimer = null;
  function showAchievementToast(id) {
    const ach = Achievements.getAll()[id];
    if (!ach) return;
    AudioManager.sfx('achievement');
    $('ach-icon').textContent = ach.icon;
    $('ach-title').textContent = ach.title;
    $('ach-desc').textContent = ach.desc;
    const toast = $('achievement-toast');
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    ParticleSystem.emit('sparkle', window.innerWidth / 2, 100, 10, { life: 40, gravity: 0 });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 500);
    }, 2800);
  }

  function showSecretToast() {
    AudioManager.sfx('achievement');
    $('ach-icon').textContent = '🔎';
    $('ach-title').textContent = 'سر مخبأ';
    $('ach-desc').textContent = 'لقيتي حاجة محدش يعرفها غيرك';
    const toast = $('achievement-toast');
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    ParticleSystem.emit('sparkle', window.innerWidth / 2, 100, 10, { life: 40, gravity: 0 });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 500);
    }, 2400);
  }

  /* ---------------- شاشة PLAY ---------------- */
  $('intro-text').textContent = CONFIG.introLine;

  function refreshPlayButton() {
    if (hasProgress()) {
      $('btn-play').textContent = 'Continue ❤️';
      $('btn-newgame').classList.remove('hidden');
    } else {
      $('btn-play').textContent = 'PLAY ❤️';
      $('btn-newgame').classList.add('hidden');
    }
  }

  $('btn-play').addEventListener('click', () => {
    AudioManager.sfx('click');
    if (hasProgress()) {
      if (state.levelsCompleted.includes('level5')) { showScreen('final'); return; }
      const next = WorldMap.nextLevel(state);
      if (next === 'level1' && state.levelsCompleted.length === 0) enterLevel('level1');
      else goToWorldMap();
    } else {
      enterLevel('level1');
    }
  });

  $('btn-newgame').addEventListener('click', () => {
    AudioManager.sfx('click');
    resetGame();
    enterLevel('level1');
  });

  $('btn-play-again').addEventListener('click', () => {
    AudioManager.sfx('click');
    resetGame();
    showScreen('intro');
    refreshPlayButton();
  });

  function resetGame() {
    state = Storage.reset();
    Achievements.init([]);
    Game.setState(state);
  }

  /* ---------------- زر الموسيقى ---------------- */
  function refreshMusicIcon() {
    musicToggle.textContent = AudioManager.isMusicOn ? '🔊' : '🔇';
  }
  musicToggle.addEventListener('click', () => {
    const on = AudioManager.toggleMusic();
    state.musicOn = on;
    persist();
    refreshMusicIcon();
  });
  refreshMusicIcon();

  /* ---------------- زر إعادة البدء ---------------- */
  restartBtn.addEventListener('click', () => restartConfirm.classList.remove('hidden'));
  $('restart-no').addEventListener('click', () => restartConfirm.classList.add('hidden'));
  $('restart-yes').addEventListener('click', () => {
    resetGame();
    restartConfirm.classList.add('hidden');
    showScreen('intro');
    refreshPlayButton();
  });

  /* ---------------- البداية ---------------- */
  refreshPlayButton();
  showScreen('intro');

})();
