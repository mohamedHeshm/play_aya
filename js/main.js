/* =====================================================================
   main.js — نقطة الدخول: يربط كل الأنظمة ببعض ويدير الانتقال بين الشاشات
   =====================================================================
   ✏️✏️✏️  أهم الأماكن اللي هتعدّلي فيها:
   - CONFIG.videoFile          -> اسم فيديو عيد الميلاد
   - CONFIG.introLine          -> الجملة الافتتاحية
   - CONFIG.girlName           -> اسمها (اختياري لو حبيتي تستخدميه بالنص)
   ===================================================================== */

const CONFIG = {
  // ✏️ ضعي اسم ملف الفيديو الموجود داخل assets/video/
  videoFile: 'assets/video/Video.mp4',
  introLine: 'في مكان بعيد… كان فيه ولد عنده أمنية واحدة…',
  girlName: '', // اختياري
};

(function () {
  'use strict';

  const STAGE_ORDER = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'];
  const STAGE_LABELS = {
    stage1: 'المرحلة ١',
    stage2: 'المرحلة ٢',
    stage3: 'المرحلة ٣',
    stage4: 'المرحلة ٤',
    stage5: 'المرحلة ٥',
  };

  let state = Storage.load();
  let currentScreen = 'intro';

  /* ---------------- عناصر DOM ---------------- */
  const $ = (id) => document.getElementById(id);

  const screens = {
    intro: $('screen-intro'),
    stage1: $('screen-stage1'),
    stage2: $('screen-stage2'),
    stage3: $('screen-stage3'),
    stage4: $('screen-stage4'),
    stage5: $('screen-stage5'),
  };

  const hud = $('hud');
  const hudScore = $('hud-score');
  const hudHearts = $('hud-hearts');
  const hudStageName = $('hud-stage-name');

  const musicToggle = $('music-toggle');
  const restartBtn = $('restart-btn');
  const restartConfirm = $('restart-confirm');

  /* ---------------- تهيئة الأنظمة ---------------- */
  ParticleSystem.init($('particle-canvas'));
  World.init($('scene3d-canvas'));
  AudioManager.init();
  AudioManager.setMusicOn(state.musicOn);
  Achievements.init(state.achievements);

  Game.setState(state);
  Game.setCallbacks({
    onScoreChange: updateHUD,
    onStageMessage: showFloatingMessage,
    onStageComplete: handleStageComplete,
    onAchievement: showAchievementToast,
    onOpenMemory: openMemoryModal,
  });

  Achievements.onUnlock(() => persist());

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

  /* ---------------- الـ HUD ---------------- */
  function updateHUD(score, hearts) {
    hudScore.textContent = score;
    hudHearts.textContent = hearts;
    persist();
  }

  function setStageLabel(stageId) {
    hudStageName.textContent = STAGE_LABELS[stageId] || '';
  }

  /* ---------------- رسائل عائمة أثناء المراحل ---------------- */
  function showFloatingMessage(stageId, text) {
    const map = {
      stage1: 'stage1-message',
      stage3: 'rain-message',
      stage4: 'wish-message',
    };
    const el = $(map[stageId]);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    // إعادة تشغيل الأنيميشن
    void el.offsetWidth;
    el.style.animation = '';
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

  /* ---------------- التنقل بين الشاشات ---------------- */
  function goToScreen(name) {
    // أوقفي منطق الشاشة الحالية
    stopScreenLogic(currentScreen);

    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    currentScreen = name;

    if (STAGE_ORDER.includes(name)) {
      hud.classList.remove('hidden');
      setStageLabel(name);
      // ضمّي الـ HUD داخل بطاقة عنوان المرحلة نفسها لمنع أي تداخل بصري
      const header = screens[name].querySelector('.stage-header');
      if (header && hud.parentElement !== header) header.appendChild(hud);
      state.currentStage = STAGE_ORDER.indexOf(name) + 1;
      persist();
    } else {
      hud.classList.add('hidden');
    }

    restartBtn.classList.toggle('hidden', name === 'intro');

    AudioManager.setRainAmbient(name === 'stage3');

    if (World && World.isReady !== undefined) World.setScreen(name);

    startScreenLogic(name);
  }

  function startScreenLogic(name) {
    switch (name) {
      case 'stage1':
        Game.Stage1.start($('stage1-canvas'));
        break;
      case 'stage2':
        Game.Stage2.start($('memory-garden'), $('stage2-continue'));
        break;
      case 'stage3':
        Game.Stage3.start($('stage3-canvas'));
        break;
      case 'stage4':
        Game.Stage4.start($('stage4-canvas'));
        break;
      case 'stage5':
        setupGiftStage();
        break;
    }
  }

  function stopScreenLogic(name) {
    switch (name) {
      case 'stage1': Game.Stage1.stop(); $('stage1-message').classList.add('hidden'); break;
      case 'stage2': Game.Stage2.stop(); break;
      case 'stage3': Game.Stage3.stop(); $('rain-message').classList.add('hidden'); break;
      case 'stage4': Game.Stage4.stop(); $('wish-message').classList.add('hidden'); break;
    }
  }

  function handleStageComplete(stageId) {
    AudioManager.sfx('stageComplete');
    if (!state.stagesCompleted.includes(stageId)) {
      state.stagesCompleted.push(stageId);
    }
    persist();

    const idx = STAGE_ORDER.indexOf(stageId);
    const next = STAGE_ORDER[idx + 1];

    if (stageId === 'stage4') {
      const first = Achievements.unlock('love_explorer');
      if (first) showAchievementToast('love_explorer');
    }

    if (next) {
      setTimeout(() => goToScreen(next), 400);
    }
  }

  /* ---------------- المرحلة ٢: نافذة الذكرى ---------------- */
  const memoryModal = $('memory-modal');
  function openMemoryModal(mem) {
    $('memory-icon').textContent = mem.icon;
    const img = $('memory-image');
    if (mem.image) {
      img.src = mem.image;
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
    }
    $('memory-text').textContent = mem.text;
    memoryModal.classList.remove('hidden');
  }
  $('memory-close').addEventListener('click', () => memoryModal.classList.add('hidden'));

  $('stage2-continue').addEventListener('click', () => handleStageComplete('stage2'));

  $('stage3-continue')?.classList.add('hidden');
  $('stage4-continue')?.classList.add('hidden');

  /* ---------------- المرحلة ٥: صندوق الهدية ---------------- */
  function setupGiftStage() {
    const box = $('gift-box');
    const hint = $('gift-hint');
    const finalMsg = $('gift-message');

    const alreadyOpen = state.stagesCompleted.includes('gift-opened');

    if (alreadyOpen) {
      box.classList.add('opened');
      hint.classList.add('hidden');
      finalMsg.classList.remove('hidden');
      revealGiftMessage(true);
      if (World && World.isReady) World.markGiftOpened();
    }

    function tryOpen() {
      if (box.classList.contains('opened')) return;
      box.classList.add('opened');
      Game.Stage5.open(box, () => {
        hint.classList.add('hidden');
        finalMsg.classList.remove('hidden');
        revealGiftMessage(false);
        if (!state.stagesCompleted.includes('gift-opened')) {
          state.stagesCompleted.push('gift-opened');
        }
        persist();
      });
    }

    box.onclick = tryOpen;
    box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') tryOpen(); };
  }

  /* ---------------- رسالة الهدية: بطاقة سينمائية + typewriter RTL ---------------- */
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

    const p = videoEl.play();
    if (p && p.catch) {
      p.catch(() => {
        // المتصفح منع التشغيل التلقائي — المستخدم يضغط زر التشغيل بنفسه
      });
    }
  }

  videoEl.addEventListener('ended', () => {
    $('video-outro').classList.remove('hidden');
    ParticleSystem.emit('heart', window.innerWidth / 2, window.innerHeight / 2, 20, { burst: true, life: 90, gravity: -0.01 });
  });

  $('video-close').addEventListener('click', () => {
    videoEl.pause();
    videoModal.classList.add('hidden');
    if (state.musicOn) AudioManager.playMusic();
  });

  /* ---------------- زر البداية ---------------- */
  $('intro-text').textContent = CONFIG.introLine;
  $('btn-start').addEventListener('click', () => {
    AudioManager.sfx('click');
    goToScreen('stage1');
  });

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
    state = Storage.reset();
    Achievements.init([]);
    Game.setState(state);
    restartConfirm.classList.add('hidden');
    updateHUD(0, 0);
    goToScreen('intro');
  });

  /* ---------------- استئناف التقدم عند إعادة فتح اللعبة ---------------- */
  function resume() {
    updateHUD(state.score, state.heartsCollected);
    if (state.currentStage && state.currentStage > 0) {
      const savedStage = STAGE_ORDER[state.currentStage - 1];
      // لو كانت المرحلة محفوظة مكتملة بالفعل، روحي للي بعدها
      if (savedStage && state.stagesCompleted.includes(savedStage)) {
        const idx = STAGE_ORDER.indexOf(savedStage);
        const next = STAGE_ORDER[idx + 1] || savedStage;
        goToScreen(next);
      } else if (savedStage) {
        goToScreen(savedStage);
      } else {
        goToScreen('intro');
      }
    } else {
      goToScreen('intro');
    }
  }

  resume();

})();
