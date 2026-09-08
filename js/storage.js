/* =====================================================================
   storage.js — نظام الحفظ (LocalStorage)
   يحفظ: المرحلة الحالية، النقاط، القلوب، الإنجازات، الإعدادات
   ===================================================================== */

const Storage = (() => {
  const KEY = 'birthday-game-save-v1';

  const defaultState = () => ({
    currentStage: 0,        // 0 = شاشة البداية
    stagesCompleted: [],    // ["stage1", "stage2", ...]
    score: 0,
    heartsCollected: 0,
    achievements: [],       // achievement ids
    memoriesDiscovered: [], // memory ids
    musicOn: true,
    wishStar: null,         // index of chosen star
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
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