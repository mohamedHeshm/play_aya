/* =====================================================================
   storage.js — نظام الحفظ (LocalStorage)
   يحفظ تقدم كل Level على حدة + النقاط + الإنجازات + الإعدادات
   ===================================================================== */

const Storage = (() => {
  const KEY = 'romantic-adventure-save-v2';

  const defaultState = () => ({
    currentLevel: 0,          // 0 = لسه في شاشة PLAY / خريطة اللعبة
    levelsCompleted: [],      // ["level1", "level2", ...]
    score: 0,
    achievements: [],
    musicOn: true,
    progress: {
      level1: { hearts: 0 },
      level2: { memories: [] },
      level3: { stars: 0 },
      level4: { memories: [] },
      level5: { unlocked: false },
    },
  });

  function migrate(parsed) {
    const base = defaultState();
    const merged = { ...base, ...parsed };
    merged.progress = { ...base.progress, ...(parsed.progress || {}) };
    for (const k of Object.keys(base.progress)) {
      merged.progress[k] = { ...base.progress[k], ...(merged.progress[k] || {}) };
    }
    return merged;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('Storage load failed, using defaults', e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Storage save failed', e);
      return false;
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    return defaultState();
  }

  return { load, save, reset, defaultState };
})();
