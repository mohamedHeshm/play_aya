/* =====================================================================
   physics.js — فيزياء بسيطة وواقعية للقلوب المتساقطة
   Gravity / Velocity / Collision / Bounce / Floating movement
   ===================================================================== */

const Physics = (() => {

  const GRAVITY = 0.12;
  const BOUNCE_DAMPING = 0.55;
  const FLOAT_AMPLITUDE = 0.6;

  /**
   * ينشئ جسم "قلب" جديد بخصائص فيزيائية
   */
  function createFallingHeart(x, y, width, opts = {}) {
    return {
      x, y,
      width,
      vx: (Math.random() - 0.5) * 1.2,
      vy: opts.vy ?? (0.5 + Math.random() * 0.8),
      radius: opts.radius ?? (18 + Math.random() * 10),
      special: opts.special ?? false,
      floatPhase: Math.random() * Math.PI * 2,
      floatSpeed: 0.03 + Math.random() * 0.02,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.03,
      collected: false,
      bounces: 0,
    };
  }

  /**
   * يحدّث موقع القلب: يطبّق الجاذبية + حركة عائمة خفيفة + الارتداد من الحواف
   */
  function updateFallingHeart(heart, bounds, dt = 1) {
    if (heart.collected) return heart;

    // Gravity
    heart.vy += GRAVITY * dt * 0.4;

    // Floating side-to-side motion (كأنه يطفو في الهواء)
    heart.floatPhase += heart.floatSpeed * dt;
    const floatOffset = Math.sin(heart.floatPhase) * FLOAT_AMPLITUDE;

    heart.x += (heart.vx + floatOffset) * dt;
    heart.y += heart.vy * dt;
    heart.rotation += heart.rotSpeed * dt;

    // Collision مع الحواف الجانبية -> Bounce
    if (heart.x - heart.radius < 0) {
      heart.x = heart.radius;
      heart.vx *= -BOUNCE_DAMPING;
    } else if (heart.x + heart.radius > bounds.width) {
      heart.x = bounds.width - heart.radius;
      heart.vx *= -BOUNCE_DAMPING;
    }

    // Collision مع الأرض -> Bounce خفيف ثم استقرار
    const floor = bounds.height - heart.radius;
    if (heart.y > floor) {
      heart.y = floor;
      if (Math.abs(heart.vy) > 0.5 && heart.bounces < 3) {
        heart.vy *= -BOUNCE_DAMPING;
        heart.bounces++;
      } else {
        heart.vy = 0;
      }
    }

    return heart;
  }

  /**
   * كشف تصادم دائري بسيط بين نقطة (لمسة/فأرة) وقلب
   */
  function isPointInHeart(px, py, heart) {
    const dx = px - heart.x;
    const dy = py - heart.y;
    return Math.sqrt(dx * dx + dy * dy) <= heart.radius * 1.3;
  }

  /**
   * كشف تصادم بين شخصية اللاعب (مربع/دائرة) وقلب
   */
  function circleCollision(x1, y1, r1, x2, y2, r2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy) < (r1 + r2);
  }

  return {
    GRAVITY,
    createFallingHeart,
    updateFallingHeart,
    isPointInHeart,
    circleCollision,
  };
})();
