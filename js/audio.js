/* =====================================================================
   audio.js — نظام الصوت والموسيقى
   يعمل بشكل طبيعي حتى لو الملفات الصوتية غير موجودة (بدون أخطاء)
   ✏️ ضعي ملفاتك الصوتية داخل assets/audio/ بنفس الأسماء التالية،
      أو غيّري الأسماء هنا لتطابق ملفاتك.
   ===================================================================== */

const AudioManager = (() => {

  const FILES = {
    music:        'assets/audio/1.mp3',
    heart:        'assets/audio/heart-collect.mp3',
    click:        'assets/audio/button-click.mp3',
    stageComplete: 'assets/audio/stage-complete.mp3',
    achievement:  'assets/audio/achievement-unlock.mp3',
    giftOpen:     'assets/audio/gift-open.mp3',
    celebration:  'assets/audio/final-celebration.mp3',
    footstep:     'assets/audio/footstep.mp3',
    rainAmbient:  'assets/audio/1.mp3',
  };

  let ambientEl = null;
  let ambientOn = false;

  let musicEl = null;
  let musicOn = true;
  let unlocked = false; // لازم تفاعل من المستخدم لتشغيل الصوت على الموبايل
  const sfxCache = {};

  function safeAudio(src) {
    try {
      const a = new Audio(src);
      a.preload = 'auto';
      // لو الملف مش موجود، تجاهلي الخطأ بهدوء
      a.addEventListener('error', () => { a.__broken = true; }, { once: true });
      return a;
    } catch (e) {
      return null;
    }
  }

  function init() {
    musicEl = safeAudio(FILES.music);
    if (musicEl) {
      musicEl.loop = true;
      musicEl.volume = 0.45;
    }
    ambientEl = safeAudio(FILES.rainAmbient);
    if (ambientEl) {
      ambientEl.loop = true;
      ambientEl.volume = 0.28;
    }
    Object.keys(FILES).forEach(key => {
      if (key === 'music' || key === 'rainAmbient') return;
      sfxCache[key] = safeAudio(FILES[key]);
    });
  }

  // صوت مطر مستمر خفيف في الخلفية أثناء العالم الليلي الممطر (كل الشاشات ما عدا البداية)
  function setRainAmbient(on) {
    ambientOn = on;
    if (!ambientEl || ambientEl.__broken || !unlocked) return;
    if (on) {
      const p = ambientEl.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      ambientEl.pause();
    }
  }

  function unlockOnFirstInteraction() {
    if (unlocked) return;
    unlocked = true;
    if (musicOn) playMusic();
    if (ambientOn) setRainAmbient(true);
  }

  function playMusic() {
    if (!musicEl || musicEl.__broken || !musicOn) return;
    const p = musicEl.play();
    if (p && p.catch) p.catch(() => { /* المتصفح منع التشغيل التلقائي، لا مشكلة */ });
  }

  function pauseMusic() {
    if (musicEl && !musicEl.__broken) musicEl.pause();
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) playMusic(); else pauseMusic();
    return musicOn;
  }

  function setMusicOn(value) {
    musicOn = value;
    if (musicOn) playMusic(); else pauseMusic();
  }

  function sfx(name) {
    const base = sfxCache[name];
    if (!base || base.__broken) return;
    try {
      // استنساخ العنصر للسماح بتشغيل نفس الصوت عدة مرات متتالية
      const clone = base.cloneNode(true);
      clone.volume = 0.7;
      const p = clone.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* تجاهل بهدوء */ }
  }

  return {
    init,
    unlockOnFirstInteraction,
    playMusic,
    pauseMusic,
    toggleMusic,
    setMusicOn,
    setRainAmbient,
    sfx,
    get isMusicOn() { return musicOn; },
  };
})();
