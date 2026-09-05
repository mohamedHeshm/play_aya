/* =====================================================================
   storage.js — نظام الحفظ (LocalStorage)
   يحفظ تقدم كل Level على حدة + النقاط + الإنجازات + الإعدادات + الأسرار
   ===================================================================== */

const Storage = (() => {
  const KEY = 'romantic-adventure-save-v3';

  const defaultState = () => ({
    currentLevel: 0,
    levelsCompleted: [],
    score: 0,
    achievements: [],
    musicOn: true,
    progress: {
      level1: { hearts: 0, secrets: [] },
      level2: { memories: [], secrets: [] },
      level3: { stars: 0, secrets: [] },
      level4: { memories: [], secrets: [] },
      level5: { unlocked: false, fireflies: 0 },
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
