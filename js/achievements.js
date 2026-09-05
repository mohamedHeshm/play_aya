/* =====================================================================
   achievements.js — نظام الإنجازات
   ✏️ يمكنك تعديل قائمة الإنجازات أو إضافة إنجازات جديدة هنا بسهولة
   ===================================================================== */

const Achievements = (() => {

  const LIST = {
    first_heart: { icon: '❤️', title: 'First Heart', desc: 'أول قلب جمعتيه' },
    heart_collector: { icon: '💖', title: 'Heart Collector', desc: 'خلصتي LEVEL 01 بالكامل' },
    memory_keeper: { icon: '🌹', title: 'Memory Keeper', desc: 'اكتشفتي كل الذكريات' },
    wish_maker: { icon: '⭐', title: 'Wish Maker', desc: 'جمعتي كل النجوم' },
    love_explorer: { icon: '🏆', title: 'Love Explorer', desc: 'خلصتي كل المراحل' },
    birthday_surprise: { icon: '🎁', title: 'Birthday Surprise', desc: 'فتحتي الهدية' },
  };

  let unlocked = new Set();
  let onUnlockCallback = null;

  function init(savedList) { unlocked = new Set(savedList || []); }
  function has(id) { return unlocked.has(id); }
  function getAll() { return LIST; }
  function getUnlocked() { return Array.from(unlocked); }
  function onUnlock(cb) { onUnlockCallback = cb; }

  function unlock(id) {
    if (!LIST[id] || unlocked.has(id)) return false;
    unlocked.add(id);
    if (onUnlockCallback) onUnlockCallback(id, LIST[id]);
    return true;
  }

  return { init, has, getAll, getUnlocked, unlock, onUnlock };
})();
