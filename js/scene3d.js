/* =====================================================================
   scene3d.js — العالم السينمائي ثلاثي الأبعاد (Three.js)
   طريق ليلي هادئ تحت المطر: سماء + نجوم + غيوم + ضباب + أرض مبللة
   + شخصية 3D تمشي تلقائيًا + صندوق هدية 3D تفاعلي
   يعمل كخلفية دائمة خلف كل شاشات اللعبة (canvas شفاف الطبقات فوقه)
   لا يوقف أي وظيفة موجودة: fallback كامل لو WebGL غير متاح
   ===================================================================== */

const World = (() => {

  // ✏️ الشخصية 3D — بنت procedural مبنية بالكامل من Three.js primitives
  // (بدون أي موديل GLB/GLTF/FBX خارجي، وبدون Texture أو Sprite)
  const CHARACTER_CONFIG = {
    turnSpeed: 6, // سرعة استدارة الجسم نحو اتجاه المشي (كل ما زاد كل ما كانت الاستدارة أسرع وأنعم)
  };

  // ✏️ الشخصية ثابتة (Idle) في كل الشاشات ما عدا مرحلة المطر — هنا موضعها الثابت
  const IDLE_SPOT = new THREE.Vector3(0, 0, 3.2);
  const IDLE_YAW = 0.12;

  // ✏️ مرحلة المطر هي المرحلة الوحيدة اللي تمشي فيها الشخصية، وبشكل تلقائي بالكامل
  // (بداية الطريق -> نهاية الطريق عند النجوم) بدون أي تحكم من اللاعب بالماوس/اللمس
  const RAIN_WALK = {
    start: new THREE.Vector3(0.4, 0, 5.5),
    end: new THREE.Vector3(-0.3, 0, -21),
    approachSlowDistance: 4.5, // تبدأ السرعة تقل تدريجيًا لما تقرب من هذه المسافة للنجوم
    minSpeedFactor: 0.12,      // أقل سرعة أثناء التباطؤ (ما تتوقفش فجأة)
    arriveThreshold: 0.25,     // تعتبر "وصلت" لما تقرب من النجوم بهذه المسافة
    walkSpeed: 1.55,           // وحدات عالم/ثانية بالسرعة الكاملة
    arrivePause: 1.0,          // وقفة سينمائية قصيرة (بالثواني) بعد الوصول وقبل تشغيل الانتقال
  };

  let renderer, scene, camera, clock;
  let canvas;
  let raf = null;
  let ready = false;
  let lowPower = false;
  let currentScreen = 'intro';
  let giftOpened = false;
  let onGiftOpenedCb = null;

  // مجموعات المشهد
  let moon, moonGlow, moonLight, ambientLight, rimLight, giftLight;
  let starsPoints, starsMaterial;
  let clouds = [];
  let ground, reflectionGroup;
  let rainMesh, rainDummy, rainData = [];
  let splashPool = [];
  let envProps = [];
  let character, charModelGroup, charMixerState;
  let mixer = null, actions = {}, currentAction = null, animState = 'idle';
  let modelReady = false;
  // مراجع أجزاء الشخصية البنت الـ procedural (يُملأ في buildPlaceholderCharacter) لاستخدامها في المشي الحركي
  let charParts = {};
  let giftBox, giftLid, giftGroup, giftPivot, giftHeartsPool = [];

  // ---------------- حالة حركة الشخصية ----------------
  // 'idle'     -> واقفة ثابتة / غير ظاهرة (كل الشاشات ما عدا المطر)
  // 'playing'  -> اللاعب يتحكم بها فعليًا (كيبورد/جويستيك) في مرحلة المطر
  // 'arriving' -> وصلت، وقفة سينمائية قصيرة قبل الانتقال
  // 'arrived'  -> واقفة عند النجوم (Idle) بعد انتهاء الوقفة
  let characterMode = 'idle';
  let rainCurve = null, rainCurveLength = 0, rainDistance = 0;
  let rainCallbacks = {};
  let arrivePauseTimer = 0;
  let stepDistanceAccum = 0;

  // مجموعة النجوم الهدف في نهاية طريق المطر (منفصلة عن حقل نجوم السماء الخلفي)
  let goalStarsGroup = null, goalStarsLight = null;
  let arrivedGlowActive = false, arrivedGlowTimer = 0;

  // ---------------- مجموعات بيئة كل مرحلة (كل مرحلة شكلها/Gameplay مختلف) ----------------
  // roadGroup: طريق المطر الكامل (أرض + أشجار + أعمدة + مباني + مطر + انعكاس) — المرحلة ٣ فقط
  let roadGroup = null;
  // heartsGroup: حديقة رومانسية دافئة صغيرة لجمع القلوب — المرحلة ١ فقط
  let heartsGroup = null;
  let heartsPool = [], heartsCollectorMesh = null;
  const HEARTS_PLANE_DISTANCE = 6.2; // بُعد مستوى القلوب الافتراضي أمام الكاميرا
  // memoryGroup: حديقة الذكريات — عناصر 3D تفاعلية — المرحلة ٢ فقط
  let memoryGroup = null;
  let memoryItems = []; // { id, mesh, glow, discovered }
  let memoryCallbacks = {};
  // giftEnvGroup: بيئة دافئة صغيرة حول صندوق الهدية — المرحلة ٥ فقط
  let giftEnvGroup = null;

  // ---------------- حركة المرحلة ٣: تحكم حقيقي من اللاعب (بدون مشي تلقائي) ----------------
  const STAGE3_BOUNDS = { xMin: -2.5, xMax: 2.5, zStart: 5.5, zEnd: -21 };
  const STAGE3_GOAL = new THREE.Vector3(-0.3, 0, -21);
  const STAGE3_SPEED = 3.1; // وحدات عالم/ثانية
  const STAGE3_ARRIVE_DIST = 1.4;
  let stage3Input = { x: 0, z: 0 };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const COLORS = {
    navy: 0x0b1330,
    navyDeep: 0x060a1c,
    warmWhite: 0xfff7ee,
    softPink: 0xe9b9c4,
    dustyRose: 0xb9857f,
    purpleBlue: 0x33355e,
    moon: 0xfff3d6,
    ground: 0x141327,
    road: 0x1c1a33,
  };

  /* ---------------------------------------------------------------
     تهيئة عامة
  --------------------------------------------------------------- */
  function detectLowPower() {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lowPower = cores <= 4 || mem <= 4 || reduced;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    detectLowPower();

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowPower,
        alpha: false,
        powerPreference: 'low-power',
      });
    } catch (e) {
      fallback();
      return false;
    }
    if (!renderer) { fallback(); return false; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(COLORS.navyDeep, 1);
    renderer.shadowMap.enabled = false;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(COLORS.navy, lowPower ? 0.028 : 0.022);

    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 3.6, 9.5);
    camera.lookAt(0, 1.4, -4);

    clock = new THREE.Clock();

    buildSky();
    buildStars();
    buildMoon();
    buildClouds();

    roadGroup = new THREE.Group();
    roadGroup.name = 'roadGroup';
    scene.add(roadGroup);

    buildGround();
    buildEnvironmentProps();
    buildRain();
    buildRainCurve();
    buildGoalStars();
    buildCharacter();
    buildLights();

    buildHeartsEnv();
    buildMemoryEnv();
    buildGiftEnv();

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });

    ready = true;
    loop();
    return true;
  }

  /* ---------------------------------------------------------------
     عناصر بيئية على جانبي الطريق — أشجار وأعمدة إنارة ومباني بسيطة
     (Low-poly, بدون أي إضاءات ديناميكية إضافية للحفاظ على الأداء)
  --------------------------------------------------------------- */
  function buildEnvironmentProps() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1c2a22, roughness: 0.85 });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x22223a, roughness: 0.5, metalness: 0.3 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffdfa8, fog: false });
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x171633, roughness: 0.8 });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9bd, fog: false, transparent: true, opacity: 0.75 });

    function addTree(x, z) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.4, 6), trunkMat);
      trunk.position.y = 0.7;
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.8, 7), leafMat);
      leaves.position.y = 2.0;
      g.add(leaves);
      const leaves2 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 7), leafMat);
      leaves2.position.y = 2.7;
      g.add(leaves2);
      g.position.set(x, 0, z);
      roadGroup.add(g);
      envProps.push(g);
    }

    function addLamp(x, z) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), poleMat);
      pole.position.y = 1.2;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), poleMat);
      arm.position.set(x < 0 ? 0.14 : -0.14, 2.35, 0);
      g.add(arm);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lampGlowMat);
      glow.position.set(x < 0 ? 0.28 : -0.28, 2.32, 0);
      g.add(glow);
      // هالة ناعمة بدون إضاءة ديناميكية حقيقية (Sprite بدل PointLight للحفاظ على الأداء)
      const haloTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const cx = c.getContext('2d');
        const rg = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        rg.addColorStop(0, 'rgba(255,223,168,0.5)');
        rg.addColorStop(1, 'rgba(255,223,168,0)');
        cx.fillStyle = rg; cx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })();
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, fog: false }));
      halo.scale.set(1.4, 1.4, 1);
      halo.position.copy(glow.position);
      g.add(halo);
      g.position.set(x, 0, z);
      roadGroup.add(g);
      envProps.push(g);
    }

    function addBuilding(x, z, w, h, d) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      box.position.y = h / 2;
      g.add(box);
      const rows = Math.floor(h / 0.6);
      for (let r = 0; r < rows; r++) {
        if (Math.random() < 0.4) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.35), windowMat);
        win.position.set(w / 2 + 0.01, 0.5 + r * 0.6, (Math.random() - 0.5) * d * 0.6);
        win.rotation.y = Math.PI / 2;
        g.add(win);
      }
      g.position.set(x, 0, z);
      roadGroup.add(g);
      envProps.push(g);
    }

    const roadHalf = lowPower ? 6 : 9;
    const count = lowPower ? 5 : 9;
    for (let i = 0; i < count; i++) {
      const z = 4 - i * 5.5;
      addTree(-roadHalf - Math.random() * 2, z + (Math.random() - 0.5) * 2);
      addTree(roadHalf + Math.random() * 2, z + (Math.random() - 0.5) * 2);
      if (i % 2 === 0) {
        addLamp(-3.4, z);
        addLamp(3.4, z - 2.5);
      }
    }
    if (!lowPower) {
      addBuilding(-11, -8, 5, 6, 6);
      addBuilding(11, -14, 6, 8, 6);
      addBuilding(-12, -22, 5.5, 5, 5);
    }
  }

  function fallback() {
    // لو WebGL غير متاح: خلفية متدرجة هادئة بديلة عبر CSS (body) بدون كسر أي وظيفة
    document.body.classList.add('no-webgl');
    ready = false;
  }

  /* ---------------------------------------------------------------
     السماء / الضباب
  --------------------------------------------------------------- */
  function buildSky() {
    const geo = new THREE.SphereGeometry(90, 24, 16);
    const canvasTex = document.createElement('canvas');
    canvasTex.width = 8; canvasTex.height = 128;
    const c = canvasTex.getContext('2d');
    const grad = c.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#050814');
    grad.addColorStop(0.45, '#0b1330');
    grad.addColorStop(0.75, '#1c1f45');
    grad.addColorStop(1, '#2c2547');
    c.fillStyle = grad;
    c.fillRect(0, 0, 8, 128);
    const tex = new THREE.CanvasTexture(canvasTex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(geo, mat);
    scene.add(sky);
  }

  /* ---------------------------------------------------------------
     النجوم — Point field حقيقي بأعماق وأحجام مختلفة + twinkle بسيط
  --------------------------------------------------------------- */
  function buildStars() {
    const count = lowPower ? 500 : 1400;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const bright = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const r = 45 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.62); // يبقي أغلب النجوم أعلى الأفق
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = Math.abs(r * Math.cos(phi)) * 0.9 + 4;
      const z = r * Math.sin(phi) * Math.sin(theta) - 10;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const isBig = Math.random() < 0.045;
      sizes[i] = isBig ? (2.4 + Math.random() * 1.8) : (0.5 + Math.random() * 1.1);
      bright[i] = isBig ? 1.0 : 0.35 + Math.random() * 0.5;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));

    starsMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aBright;
        varying float vBright;
        uniform float uTime;
        uniform float uPixelRatio;
        void main() {
          float twinkle = 0.65 + 0.35 * sin(uTime * 0.8 + aPhase);
          vBright = aBright * twinkle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vBright;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float alpha = smoothstep(0.5, 0.0, d) * vBright;
          vec3 col = mix(vec3(0.85,0.86,0.95), vec3(1.0,0.97,0.92), vBright);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });

    starsPoints = new THREE.Points(geometry, starsMaterial);
    scene.add(starsPoints);
  }

  /* ---------------------------------------------------------------
     القمر — كرة مضيئة + هالة ناعمة
  --------------------------------------------------------------- */
  function buildMoon() {
    const geo = new THREE.SphereGeometry(2.1, 24, 24);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.moon, fog: false });
    moon = new THREE.Mesh(geo, mat);
    moon.position.set(-14, 16, -30);
    scene.add(moon);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gc = glowCanvas.getContext('2d');
    const rg = gc.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,243,214,0.55)');
    rg.addColorStop(0.4, 'rgba(255,243,214,0.18)');
    rg.addColorStop(1, 'rgba(255,243,214,0)');
    gc.fillStyle = rg;
    gc.fillRect(0, 0, 256, 256);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false });
    moonGlow = new THREE.Sprite(glowMat);
    moonGlow.scale.set(22, 22, 1);
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);

    moonLight = new THREE.DirectionalLight(0xcfd6ff, lowPower ? 0.5 : 0.65);
    moonLight.position.copy(moon.position);
    scene.add(moonLight);
  }

  /* ---------------------------------------------------------------
     غيوم بعيدة — Sprites ناعمة تتحرك ببطء شديد
  --------------------------------------------------------------- */
  function buildClouds() {
    const cCanvas = document.createElement('canvas');
    cCanvas.width = cCanvas.height = 256;
    const cc = cCanvas.getContext('2d');
    for (let i = 0; i < 6; i++) {
      const rg = cc.createRadialGradient(
        128 + (Math.random() - 0.5) * 90, 128 + (Math.random() - 0.5) * 40, 0,
        128 + (Math.random() - 0.5) * 90, 128 + (Math.random() - 0.5) * 40, 90 + Math.random() * 30
      );
      rg.addColorStop(0, 'rgba(60,64,100,0.35)');
      rg.addColorStop(1, 'rgba(60,64,100,0)');
      cc.fillStyle = rg;
      cc.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(cCanvas);
    const count = lowPower ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false, fog: true });
      const sprite = new THREE.Sprite(mat);
      const scale = 26 + Math.random() * 18;
      sprite.scale.set(scale, scale * 0.5, 1);
      sprite.position.set((Math.random() - 0.5) * 70, 14 + Math.random() * 8, -25 - Math.random() * 30);
      sprite.userData.speed = 0.06 + Math.random() * 0.06;
      scene.add(sprite);
      clouds.push(sprite);
    }
  }

  /* ---------------------------------------------------------------
     الأرض — طريق مبلل مع لمعان خفيف + انعكاسات وهمية بسيطة
  --------------------------------------------------------------- */
  function buildGround() {
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 256; groundCanvas.height = 256;
    const gctx = groundCanvas.getContext('2d');
    gctx.fillStyle = '#141227';
    gctx.fillRect(0, 0, 256, 256);
    gctx.fillStyle = '#1d1a35';
    gctx.fillRect(96, 0, 64, 256);
    gctx.strokeStyle = 'rgba(233,185,196,0.18)';
    gctx.lineWidth = 3;
    gctx.setLineDash([14, 14]);
    gctx.beginPath();
    gctx.moveTo(128, 0);
    gctx.lineTo(128, 256);
    gctx.stroke();
    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(1, 10);

    const geo = new THREE.PlaneGeometry(40, 160, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.28,
      metalness: 0.25,
      color: 0xffffff,
    });
    ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -30);
    roadGroup.add(ground);

    // انعكاس وهمي رخيص: نسخة مقلوبة شفافة من مجموعة العالم الأمامي
    reflectionGroup = new THREE.Group();
    reflectionGroup.scale.set(1, -1, 1);
    reflectionGroup.position.y = -0.02;
    roadGroup.add(reflectionGroup);
  }

  /* ---------------------------------------------------------------
     المطر — InstancedMesh خفيف الأداء + بِرك splash متحركة
  --------------------------------------------------------------- */
  function buildRain() {
    const count = lowPower ? 220 : 520;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 1, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfd9ff, transparent: true, opacity: 0.35, fog: true });
    rainMesh = new THREE.InstancedMesh(geo, mat, count);
    rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rainDummy = new THREE.Object3D();
    rainData = [];
    for (let i = 0; i < count; i++) {
      const near = Math.random() < 0.3;
      rainData.push({
        x: (Math.random() - 0.5) * 26,
        y: Math.random() * 20,
        z: -30 + (Math.random() - 0.5) * 50,
        speed: (near ? 14 : 9) + Math.random() * 4,
        len: near ? (0.7 + Math.random() * 0.4) : (0.35 + Math.random() * 0.25),
        drift: (Math.random() - 0.5) * 0.6,
      });
    }
    roadGroup.add(rainMesh);

    // بِرك splash — دوائر شفافة صغيرة تنبض عشوائيًا فوق الأرض
    const splashCount = lowPower ? 8 : 16;
    const ringGeo = new THREE.RingGeometry(0.05, 0.16, 12);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < splashCount; i++) {
      const mesh = new THREE.Mesh(ringGeo, ringMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((Math.random() - 0.5) * 8, 0.02, -2 - Math.random() * 18);
      mesh.userData.phase = Math.random() * 2;
      mesh.userData.speed = 0.6 + Math.random() * 0.5;
      roadGroup.add(mesh);
      splashPool.push(mesh);
    }
  }

  function updateRain(dt) {
    if (!rainMesh) return;
    // المطر أثناء المرحلة ٣ فقط (بيئة "ليلة المطر") — بقية المراحل بيئتها مختلفة تمامًا
    const visible = currentScreen === 'stage3';
    rainMesh.visible = visible;
    if (!visible) return;
    for (let i = 0; i < rainData.length; i++) {
      const d = rainData[i];
      d.y -= d.speed * dt;
      d.x += d.drift * dt;
      if (d.y < 0) { d.y = 16 + Math.random() * 6; d.x = (Math.random() - 0.5) * 26; }
      rainDummy.position.set(d.x, d.y, d.z);
      rainDummy.rotation.set(0, 0, Math.atan2(d.drift, -d.speed) * 0.15);
      rainDummy.scale.set(1, d.len * 3.2, 1);
      rainDummy.updateMatrix();
      rainMesh.setMatrixAt(i, rainDummy.matrix);
    }
    rainMesh.instanceMatrix.needsUpdate = true;

    for (const s of splashPool) {
      s.userData.phase += dt * s.userData.speed;
      const t = s.userData.phase % 1;
      s.material.opacity = visible ? Math.sin(t * Math.PI) * 0.35 : 0;
      const sc = 0.4 + t * 1.6;
      s.scale.set(sc, sc, sc);
    }
  }

  /* ---------------------------------------------------------------
     مسار مرحلة المطر — منحنى ناعم من بداية الطريق حتى النجوم (اتجاه واحد فقط)
  --------------------------------------------------------------- */
  function buildRainCurve() {
    rainCurve = new THREE.CatmullRomCurve3([
      RAIN_WALK.start,
      new THREE.Vector3(0.9, 0, -1.5),
      new THREE.Vector3(-1.1, 0, -9),
      new THREE.Vector3(0.5, 0, -15.5),
      RAIN_WALK.end,
    ], false, 'catmullrom', 0.5);
    rainCurveLength = rainCurve.getLength();
  }

  function createGlowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d');
    const rg = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, inner);
    rg.addColorStop(1, outer);
    cx.fillStyle = rg;
    cx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------------------------------------------------------
     النجوم-الهدف في نهاية طريق المطر — الهدف البصري الواضح للشخصية
     خافتة وعائمة قبل الوصول، تضيء وتتألق لحظة وصول الشخصية فعليًا
  --------------------------------------------------------------- */
  function buildGoalStars() {
    goalStarsGroup = new THREE.Group();
    goalStarsGroup.position.copy(RAIN_WALK.end.clone().add(new THREE.Vector3(0, 1.5, -3.5)));

    const tex = createGlowTexture('rgba(255,246,224,0.95)', 'rgba(255,246,224,0)');
    const count = lowPower ? 4 : 7;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.5 });
      const spr = new THREE.Sprite(mat);
      const scale = 0.45 + Math.random() * 0.55;
      spr.scale.set(scale, scale, 1);
      spr.position.set((Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
      spr.userData.phase = Math.random() * Math.PI * 2;
      spr.userData.speed = 0.5 + Math.random() * 0.4;
      spr.userData.baseY = spr.position.y;
      goalStarsGroup.add(spr);
    }

    goalStarsLight = new THREE.PointLight(0xfff3d6, 0.3, 10, 2);
    goalStarsGroup.add(goalStarsLight);

    roadGroup.add(goalStarsGroup);
  }

  function updateGoalStars(dt) {
    if (!goalStarsGroup) return;
    if (arrivedGlowActive) arrivedGlowTimer = Math.min(arrivedGlowTimer + dt, 1.2);
    const boost = arrivedGlowActive ? Math.min(1, arrivedGlowTimer / 0.6) : 0;

    goalStarsGroup.children.forEach((child) => {
      if (!child.isSprite) return;
      child.userData.phase += dt * child.userData.speed;
      child.position.y = child.userData.baseY + Math.sin(child.userData.phase) * 0.12;
      const base = 0.35 + Math.sin(child.userData.phase * 0.7) * 0.15;
      child.material.opacity = Math.min(1, base + boost * 0.55);
    });

    if (goalStarsLight) goalStarsLight.intensity = 0.3 + boost * 1.7;
  }

  function triggerGoalStarsGlow() {
    arrivedGlowActive = true;
    arrivedGlowTimer = 0;
    if (goalStarsGroup && camera && typeof ParticleSystem !== 'undefined') {
      const p = worldToScreen(goalStarsGroup.position);
      if (p) {
        ParticleSystem.emit('sparkle', p.x, p.y, 18, { life: 55, gravity: 0 });
        ParticleSystem.emit('star', p.x, p.y, 10, { life: 70, gravity: -0.01, rise: true });
      }
    }
  }

  function resetGoalStarsGlow() {
    arrivedGlowActive = false;
    arrivedGlowTimer = 0;
  }

  function worldToScreen(vec3) {
    if (!camera) return null;
    const v = vec3.clone().project(camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (1 - (v.y * 0.5 + 0.5)) * window.innerHeight };
  }

  // نقطة على بُعد ثابت من الكاميرا في اتجاه بكسل شاشة معيّن — تُستخدم لتحويل
  // إحداثيات اللمس/الماوس ثنائية البعد (من كانفس المرحلة) إلى موضع 3D حقيقي
  function screenToWorldPoint(px, py, width, height, distance) {
    const ndcX = (px / width) * 2 - 1;
    const ndcY = -(py / height) * 2 + 1;
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().normalize().multiplyScalar(distance));
  }

  function makeHeartShape(size) {
    const s = new THREE.Shape();
    s.moveTo(0, size * 0.32);
    s.bezierCurveTo(0, size * 0.5, -size * 0.5, size * 0.62, -size * 0.5, size * 0.28);
    s.bezierCurveTo(-size * 0.5, -size * 0.05, -size * 0.18, -size * 0.32, 0, -size * 0.55);
    s.bezierCurveTo(size * 0.18, -size * 0.32, size * 0.5, -size * 0.05, size * 0.5, size * 0.28);
    s.bezierCurveTo(size * 0.5, size * 0.62, 0, size * 0.5, 0, size * 0.32);
    return s;
  }

  function simpleGlowSprite(color, scale) {
    const tex = createGlowTexture(color, 'rgba(0,0,0,0)');
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    spr.scale.set(scale, scale, 1);
    return spr;
  }

  /* =================================================================
     المرحلة ١ — حديقة رومانسية صغيرة لجمع القلوب (لا تظهر البنت هنا)
     القلوب مجسّمات 3D حقيقية (Extrude) وليست Emoji، تتبع لمس/سحب اللاعب
     الذي يتحكم بها game.js فيزيائيًا؛ هذا الملف فقط يعرضها كأجسام 3D.
  ================================================================= */
  function buildHeartsEnv() {
    heartsGroup = new THREE.Group();
    heartsGroup.name = 'heartsGroup';
    heartsGroup.visible = false;
    heartsGroup.position.set(0, 0, 2.5);

    // أرضية دائرية دافئة (وردي/بنفسجي) مختلفة تمامًا عن طريق المطر
    const discCanvas = document.createElement('canvas');
    discCanvas.width = discCanvas.height = 256;
    const dctx = discCanvas.getContext('2d');
    const rg = dctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, '#3a2140');
    rg.addColorStop(0.6, '#241a3a');
    rg.addColorStop(1, '#140f26');
    dctx.fillStyle = rg;
    dctx.fillRect(0, 0, 256, 256);
    const discTex = new THREE.CanvasTexture(discCanvas);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(9, 28),
      new THREE.MeshStandardMaterial({ map: discTex, roughness: 0.55, metalness: 0.1 })
    );
    disc.rotation.x = -Math.PI / 2;
    heartsGroup.add(disc);

    // أشجار وأضواء ناعمة صغيرة حول الحديقة
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a2f4a, roughness: 0.7, emissive: 0x2a1030, emissiveIntensity: 0.25 });
    const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd7ea, fog: false });
    const ringCount = lowPower ? 5 : 8;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const r = 6.5 + Math.random() * 1.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (i % 2 === 0) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.1, 6), trunkMat);
        trunk.position.y = 0.55;
        g.add(trunk);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 7), leafMat);
        leaves.position.y = 1.35;
        g.add(leaves);
        g.position.set(x, 0, z);
        heartsGroup.add(g);
      } else {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.6, 6), trunkMat);
        pole.position.y = 0.8;
        g.add(pole);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), lampGlowMat);
        glow.position.y = 1.62;
        g.add(glow);
        const halo = simpleGlowSprite('rgba(255,215,234,0.55)', 1.2);
        halo.position.y = 1.62;
        g.add(halo);
        g.position.set(x, 0, z);
        heartsGroup.add(g);
      }
    }

    const softLight = new THREE.PointLight(0xe9b9c4, 0.6, 16, 2);
    softLight.position.set(0, 3, 1);
    heartsGroup.add(softLight);

    scene.add(heartsGroup);

    // مجمع القلوب: مجسّمات Extrude حقيقية (ليست Emoji) — يُعاد استخدامها كل Frame
    const heartShape = makeHeartShape(1);
    const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    heartGeo.center();
    const normalMat = new THREE.MeshStandardMaterial({ color: 0xdba6c2, roughness: 0.35, metalness: 0.2, emissive: 0x6a2f45, emissiveIntensity: 0.35 });
    const specialMat = new THREE.MeshStandardMaterial({ color: 0xffd9e6, roughness: 0.25, metalness: 0.3, emissive: 0xff9dc0, emissiveIntensity: 0.6 });
    const POOL_SIZE = 16;
    heartsPool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(heartGeo, normalMat.clone());
      mesh.visible = false;
      mesh.userData.baseScale = 1;
      heartsGroup.add(mesh);
      heartsPool.push({ mesh, special: false, normalMat, specialMat });
    }

    // مؤشر/مجمّع اللاعب — كرة متوهجة بسيطة (بدون شخصية) تمثل موضع اللمس
    const collectorGeo = new THREE.SphereGeometry(0.18, 14, 12);
    const collectorMat = new THREE.MeshStandardMaterial({ color: 0xfff7ee, roughness: 0.3, emissive: 0xe9b9c4, emissiveIntensity: 0.7 });
    heartsCollectorMesh = new THREE.Mesh(collectorGeo, collectorMat);
    heartsCollectorMesh.visible = false;
    heartsGroup.add(heartsCollectorMesh);
    const collectorGlow = simpleGlowSprite('rgba(255,247,238,0.8)', 0.9);
    heartsCollectorMesh.add(collectorGlow);
  }

  // تُستدعى من game.js كل Frame أثناء المرحلة ١ لعرض القلوب/اللاعب كأجسام 3D حقيقية
  // hearts: [{x,y (إحداثيات كانفس المرحلة), radius, special}], player: {x,y,r}
  function stage1Render(hearts, player, width, height) {
    if (!ready || !heartsGroup) return;
    for (let i = 0; i < heartsPool.length; i++) {
      const slot = heartsPool[i];
      const h = hearts[i];
      if (!h) { slot.mesh.visible = false; continue; }
      const p = screenToWorldPoint(h.x, h.y, width, height, HEARTS_PLANE_DISTANCE);
      slot.mesh.position.copy(p);
      slot.mesh.visible = true;
      const scale = (h.radius || 20) / 22;
      slot.mesh.scale.set(scale, scale, scale);
      slot.mesh.rotation.y += 0.02;
      if (h.special !== slot.special) {
        slot.mesh.material = h.special ? slot.specialMat : slot.normalMat;
        slot.special = h.special;
      }
    }
    if (player && heartsCollectorMesh) {
      const cp = screenToWorldPoint(player.x, player.y, width, height, HEARTS_PLANE_DISTANCE - 0.4);
      heartsCollectorMesh.position.copy(cp);
      heartsCollectorMesh.visible = true;
    }
  }

  function stage1Stop() {
    if (!heartsPool.length) return;
    heartsPool.forEach(s => { s.mesh.visible = false; });
    if (heartsCollectorMesh) heartsCollectorMesh.visible = false;
  }

  /* =================================================================
     المرحلة ٢ — حديقة الذكريات: عناصر 3D تفاعلية مختلفة تمامًا عن
     المرحلة ١ (لا تظهر البنت هنا أيضًا)
  ================================================================= */
  function makeStage2Prop(type) {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.75 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.4, metalness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xffe3b0, emissive: 0xffcf8a, emissiveIntensity: 0.15, transparent: true, opacity: 0.85, roughness: 0.2 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5240, roughness: 0.8 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x6a3b4a, roughness: 0.5, metalness: 0.15 });
    const starMat = new THREE.MeshStandardMaterial({ color: 0xf3e6d2, emissive: 0xf3e6d2, emissiveIntensity: 0.25, roughness: 0.35 });
    let glowRef;

    if (type === 'chair') {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), woodMat);
      seat.position.y = 0.5; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), woodMat);
      back.position.set(0, 0.78, -0.22); g.add(back);
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), woodMat);
        leg.position.set(x, 0.25, z); g.add(leg);
      });
      glowRef = seat;
    } else if (type === 'lantern') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 6), metalMat);
      pole.position.y = 0.5; g.add(pole);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8), glassMat);
      body.position.y = 1.05; g.add(body);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 8), metalMat);
      cap.position.y = 1.24; g.add(cap);
      glowRef = body;
    } else if (type === 'tree') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.0, 6), woodMat);
      trunk.position.y = 0.5; g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 8), leafMat);
      leaves.position.y = 1.25; g.add(leaves);
      glowRef = leaves;
    } else if (type === 'box') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.32), boxMat);
      body.position.y = 0.2; g.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.36), boxMat);
      lid.position.y = 0.4; g.add(lid);
      glowRef = body;
    } else { // starlamp
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 6), metalMat);
      pole.position.y = 0.6; g.add(pole);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), starMat);
      star.position.y = 1.28; g.add(star);
      glowRef = star;
    }

    // نطاق لمس أكبر شفاف لسهولة الضغط على الموبايل
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.55;
    g.add(hit);

    return { group: g, glowMesh: glowRef, hitMesh: hit };
  }

  function buildMemoryEnv() {
    memoryGroup = new THREE.Group();
    memoryGroup.name = 'memoryGroup';
    memoryGroup.visible = false;
    memoryGroup.position.set(0, 0, 1.5);

    const discCanvas = document.createElement('canvas');
    discCanvas.width = discCanvas.height = 256;
    const dctx = discCanvas.getContext('2d');
    const rg = dctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, '#1c2436');
    rg.addColorStop(0.6, '#141b2c');
    rg.addColorStop(1, '#0c111e');
    dctx.fillStyle = rg;
    dctx.fillRect(0, 0, 256, 256);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 28),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(discCanvas), roughness: 0.6 })
    );
    disc.rotation.x = -Math.PI / 2;
    memoryGroup.add(disc);

    const ambient = new THREE.PointLight(0x9fb2ff, 0.5, 14, 2);
    ambient.position.set(0, 3, 2);
    memoryGroup.add(ambient);

    const TYPES = ['chair', 'lantern', 'tree', 'box', 'starlamp'];
    const SLOTS = 9;
    const COLS = 3;
    memoryItems = [];
    for (let i = 0; i < SLOTS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // شبكة تعتمد على العمق (z) وليس الاتساع الأفقي (x) كي تبقى كل العناصر
      // داخل مجال رؤية الكاميرا على الموبايل بغض النظر عن نسبة الشاشة
      const x = (col - 1) * 1.35 + (Math.random() - 0.5) * 0.15;
      const z = -row * 1.6 + (Math.random() - 0.5) * 0.15;
      const prop = makeStage2Prop(TYPES[i % TYPES.length]);
      prop.group.position.set(x, 0, z);
      prop.hitMesh.userData.slotIndex = i;
      memoryGroup.add(prop.group);
      memoryItems.push({ id: null, group: prop.group, glowMesh: prop.glowMesh, discovered: false, baseEmissive: prop.glowMesh.material.emissiveIntensity || 0 });
    }

    scene.add(memoryGroup);
  }

  function stage2SetItemVisual(index, discovered) {
    const item = memoryItems[index];
    if (!item) return;
    item.discovered = discovered;
    const targetIntensity = discovered ? Math.max(0.8, item.baseEmissive + 0.6) : item.baseEmissive;
    item.glowMesh.material.emissiveIntensity = targetIntensity;
    item.group.scale.setScalar(discovered ? 1.06 : 1);
  }

  // memories: [{id}], discoveredIds: [id,...], onSelect(id)
  function startStage2(memories, discoveredIds, onSelect) {
    memoryCallbacks.onSelect = onSelect || null;
    const disc = new Set(discoveredIds || []);
    memoryItems.forEach((item, i) => {
      const mem = memories[i];
      item.id = mem ? mem.id : null;
      item.group.visible = !!mem;
      if (mem) stage2SetItemVisual(i, disc.has(mem.id));
    });
  }

  function stage2MarkDiscovered(id) {
    const idx = memoryItems.findIndex(it => it.id === id);
    if (idx >= 0) stage2SetItemVisual(idx, true);
  }

  function stopStage2() {
    memoryCallbacks.onSelect = null;
  }

  function handleStage2Pick(e) {
    if (currentScreen !== 'stage2' || !memoryGroup || !memoryGroup.visible) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const targets = memoryItems.filter(it => it.id).map(it => it.group);
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    let obj = hits[0].object;
    while (obj && obj.userData.slotIndex === undefined) obj = obj.parent;
    if (!obj) return;
    const item = memoryItems[obj.userData.slotIndex];
    if (item && item.id && memoryCallbacks.onSelect) memoryCallbacks.onSelect(item.id);
  }

  /* =================================================================
     المرحلة ٥ — بيئة دافئة صغيرة حول صندوق الهدية (بدون البنت وبدون مطر)
  ================================================================= */
  function buildGiftEnv() {
    giftEnvGroup = new THREE.Group();
    giftEnvGroup.name = 'giftEnvGroup';
    giftEnvGroup.visible = false;
    giftEnvGroup.position.set(1.6, 0, -6.5);

    const discCanvas = document.createElement('canvas');
    discCanvas.width = discCanvas.height = 256;
    const dctx = discCanvas.getContext('2d');
    const rg = dctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, '#3a2818');
    rg.addColorStop(0.6, '#241a12');
    rg.addColorStop(1, '#140f0a');
    dctx.fillStyle = rg;
    dctx.fillRect(0, 0, 256, 256);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 24),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(discCanvas), roughness: 0.6 })
    );
    disc.rotation.x = -Math.PI / 2;
    giftEnvGroup.add(disc);

    const candleMat = new THREE.MeshStandardMaterial({ color: 0xfff3e0, roughness: 0.5 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, fog: false });
    const candleCount = 4;
    for (let i = 0; i < candleCount; i++) {
      const a = (i / candleCount) * Math.PI * 2;
      const r = 2.3;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 8), candleMat);
      body.position.y = 0.17; g.add(body);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), flameMat);
      flame.position.y = 0.37; g.add(flame);
      const halo = simpleGlowSprite('rgba(255,207,122,0.6)', 0.5);
      halo.position.y = 0.37; g.add(halo);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      giftEnvGroup.add(g);
    }

    const warmLight = new THREE.PointLight(0xffd9a0, 0.5, 8, 2);
    warmLight.position.set(0, 2, 0.5);
    giftEnvGroup.add(warmLight);

    scene.add(giftEnvGroup);
  }

  /* ---------------------------------------------------------------
     الشخصية — بنت 3D procedural كاملة، مبنية بالكامل من Three.js
     primitives (بدون أي ملف/Texture/Sprite/Emoji خارجي). الحركة
     (Idle / Walking) بتتحرك عبر تدوير أجزاء الجسم مباشرة (procedural
     animation) في updateCharacter، مفيش AnimationMixer ولا موديل خارجي.
  --------------------------------------------------------------- */
  function buildCharacter() {
    character = new THREE.Group();
    charModelGroup = new THREE.Group();
    charModelGroup.name = 'charModel';
    character.add(charModelGroup);

    buildPlaceholderCharacter();

    // ظل ناعم أسفل الشخصية (يبقى موجود دايمًا تحت أي موديل)
    const shadowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const cx = c.getContext('2d');
      const rg = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(0,0,0,0.45)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = rg; cx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    shadowMesh.name = 'charShadow';
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    character.add(shadowMesh);

    character.position.copy(IDLE_SPOT);
    character.rotation.y = IDLE_YAW;
    character.visible = false; // لا تظهر إلا في المرحلة ٣ (تُفعّل عبر setScreen)

    scene.add(character);
    refreshReflection();

    charMixerState = { bob: 0, stepPhase: 0, walkBlend: 0 };
  }

  // ---------------------------------------------------------------
  // الشخصية: بنت 3D كاملة، مبنية بالكامل من Three.js primitives
  // (بدون أي ملف/Texture/Sprite/Emoji خارجي) — هي الشخصية الأساسية
  // الدائمة في اللعبة (مفيش موديل GLB خارجي بيتحمّل خالص).
  // الـHierarchy: girlCharacter > head/hair/body(dress)/arms/legs
  // ---------------------------------------------------------------
  function buildPlaceholderCharacter() {
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b79a, roughness: 0.55 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.55 });
    const dressMat = new THREE.MeshStandardMaterial({ color: 0xdba6c2, roughness: 0.55 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2e2a3a, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2020, roughness: 0.4 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xa85f68, roughness: 0.5 });

    // اسم 'placeholder' يُبقى كما هو للتوافق مع أي كود آخر بيدور على الاسم ده
    const girlCharacter = new THREE.Group();
    girlCharacter.name = 'placeholder';
    charModelGroup.add(girlCharacter);
    charParts.root = girlCharacter;

    // ---------- الرقبة ----------
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 8), skinMat);
    neck.position.y = 1.28;
    girlCharacter.add(neck);

    // ---------- الرأس + الوجه ----------
    const head = new THREE.Group();
    head.name = 'head';
    head.position.y = 1.42;
    girlCharacter.add(head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 14), skinMat);
    headMesh.scale.set(0.88, 1.05, 0.92);
    head.add(headMesh);

    const eyeGeo = new THREE.SphereGeometry(0.013, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.05, 0.0, 0.135);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.05;
    head.add(eyeL, eyeR);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.007, 0.008), mouthMat);
    mouth.position.set(0, -0.065, 0.14);
    head.add(mouth);

    // ---------- الشعر (أهم جزء — واضح جدًا من الخلف) ----------
    const hair = new THREE.Group();
    hair.name = 'hair';
    head.add(hair);
    // قبعة الشعر أعلى الرأس
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.163, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    hairCap.position.y = 0.015;
    hair.add(hairCap);
    // الشعر الطويل من الخلف — يصل لأعلى الظهر (Cylinder بدل CapsuleGeometry)
    const hairBack = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 8), hairMat);
    hairBack.position.set(0, -0.24, -0.095);
    hairBack.scale.set(0.95, 1, 0.55);
    hair.add(hairBack);
    // خصلتان جانبيتان حول الرأس (Cylinder بدل CapsuleGeometry)
    const lockGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.24, 6);
    const lockL = new THREE.Mesh(lockGeo, hairMat);
    lockL.position.set(-0.135, -0.05, 0.01);
    lockL.rotation.z = 0.14;
    const lockR = lockL.clone();
    lockR.position.x = 0.135;
    lockR.rotation.z = -0.14;
    hair.add(lockL, lockR);
    charParts.hair = hair;

    // ---------- الجسم / الفستان ----------
    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'body';
    girlCharacter.add(bodyGroup);

    const dress = new THREE.Group();
    dress.name = 'dress';
    bodyGroup.add(dress);
    // أعلى الفستان (الكتفين ضيقين، خصر واضح قليلًا)
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.075, 0.22, 10), dressMat);
    bodice.position.y = 1.12;
    dress.add(bodice);
    // تنورة الفستان — انسيابية وتتسع للأسفل
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.2, 0.42, 12, 1, true), dressMat);
    skirt.position.y = 0.8;
    dress.add(skirt);
    const skirtHem = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), dressMat);
    skirtHem.rotation.x = -Math.PI / 2;
    skirtHem.position.y = 0.59;
    dress.add(skirtHem);

    // ---------- الذراعان (منفصلتان تمامًا عن الجسم) ----------
    function buildArm(sign) {
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.125, 1.2, 0);
      // العضد (Cylinder بدل CapsuleGeometry)
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.19, 8), skinMat);
      upperArm.position.y = -0.1;
      shoulder.add(upperArm);

      const elbow = new THREE.Group();
      elbow.position.y = -0.2;
      shoulder.add(elbow);
      // الساعد (Cylinder بدل CapsuleGeometry)
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.17, 8), skinMat);
      forearm.position.y = -0.09;
      elbow.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), skinMat);
      hand.position.y = -0.19;
      elbow.add(hand);

      bodyGroup.add(shoulder);
      return { shoulder, elbow };
    }
    const leftArm = buildArm(-1);
    const rightArm = buildArm(1);
    charParts.leftUpperArm = leftArm.shoulder;
    charParts.rightUpperArm = rightArm.shoulder;

    // ---------- الرجلان (منفصلتان، تظهران أسفل الفستان) ----------
    function buildLeg(sign) {
      const hip = new THREE.Group();
      hip.position.set(sign * 0.055, 0.58, 0);
      // أعلى الفخذ (Cylinder بدل CapsuleGeometry)
      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.22, 8), skinMat);
      upperLeg.position.y = -0.12;
      hip.add(upperLeg);

      const knee = new THREE.Group();
      knee.position.y = -0.24;
      hip.add(knee);
      // أسفل الساق (Cylinder بدل CapsuleGeometry)
      const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), skinMat);
      lowerLeg.position.y = -0.11;
      knee.add(lowerLeg);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.09), shoeMat);
      foot.position.set(0, -0.225, 0.02);
      knee.add(foot);

      girlCharacter.add(hip);
      return { hip, knee };
    }
    const leftLeg = buildLeg(-1);
    const rightLeg = buildLeg(1);
    charParts.leftUpperLeg = leftLeg.hip;
    charParts.rightUpperLeg = rightLeg.hip;

    // Smooth shading على كل الأسطح
    girlCharacter.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  }

  // انعكاس خفيف على الأرض المبللة — يُعاد بناؤه كل مرة يتغير فيها شكل الشخصية (placeholder <-> model)
  function refreshReflection() {
    if (!character || !reflectionGroup) return;
    const old = character.userData.reflection;
    if (old) { reflectionGroup.remove(old); }
    const reflectionChar = character.clone(true);
    reflectionChar.visible = true; // الوضوح الحقيقي يُحدَّده roadGroup.visible (المرحلة ٣ فقط) وليس character.visible
    reflectionChar.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = o.name === 'charShadow' ? 0 : 0.16;
      }
    });
    reflectionGroup.add(reflectionChar);
    character.userData.reflection = reflectionChar;
  }

  function setAnimState(name) {
    if (!mixer) return; // لسه بنستخدم الـ placeholder، مفيش أنيميشن حقيقي
    const next = actions[name] || actions.idle || actions.walk || actions.run;
    if (!next || next === currentAction) { animState = name; return; }
    if (currentAction) currentAction.fadeOut(0.25);
    next.reset().fadeIn(0.25).play();
    currentAction = next;
    animState = name;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function faceDirection(dirX, dirZ, dt) {
    const targetAngle = Math.atan2(dirX, dirZ);
    let diff = targetAngle - character.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    character.rotation.y += diff * Math.min(1, dt * CHARACTER_CONFIG.turnSpeed);
  }

  // ✏️ تحكم حقيقي من اللاعب في المرحلة ٣ — لا يوجد مشي تلقائي إطلاقًا.
  // input: { x, z } بمدى -1..1 (يُغذّى من game.js عبر لوحة المفاتيح/الجويستيك)
  function setStage3Move(x, z) {
    stage3Input.x = clamp(x, -1, 1);
    stage3Input.z = clamp(z, -1, 1);
  }

  // تُستدعى من game.js لبدء التحكم اليدوي بالشخصية في مرحلة المطر
  // callbacks: { onProgress(t 0..1), onArrived() } — onArrived تُستدعى مرة واحدة فقط
  function startStage3(callbacks) {
    rainCallbacks = callbacks || {};
    resetGoalStarsGlow();
    stage3Input.x = 0; stage3Input.z = 0;
    if (character) {
      character.position.set(RAIN_WALK.start.x, 0, STAGE3_BOUNDS.zStart);
      character.rotation.y = Math.PI; // تنظر نحو نهاية الطريق (اتجاه -z)
    }
    characterMode = 'playing';
  }

  // تُستدعى عند مغادرة مرحلة المطر (طبيعيًا أو بسبب إعادة البدء) لتصفير الحالة
  function resetStage3() {
    characterMode = 'idle';
    rainCallbacks = {};
    stage3Input.x = 0; stage3Input.z = 0;
    resetGoalStarsGlow();
  }
  // اسم قديم يبقى للتوافق
  function resetRainJourney() { resetStage3(); }

  function arriveAtStars() {
    if (characterMode !== 'playing') return;
    characterMode = 'arriving';
    arrivePauseTimer = RAIN_WALK.arrivePause;
    triggerGoalStarsGlow();
    AudioManager && AudioManager.sfx && AudioManager.sfx('achievement');
  }

  function updateCharacter(dt) {
    if (!character) return;
    if (mixer) mixer.update(dt);

    let moving = false;

    if (characterMode === 'playing') {
      const mag = Math.hypot(stage3Input.x, stage3Input.z);
      if (mag > 0.05) {
        moving = true;
        const nx = stage3Input.x / Math.max(mag, 1);
        const nz = stage3Input.z / Math.max(mag, 1);
        const speed = STAGE3_SPEED * Math.min(1, mag);
        // z موجب من الجويستيك/الكيبورد = تقدّم للأمام نحو النجوم (اتجاه -z في العالم)
        const worldDX = nx * speed * dt;
        const worldDZ = -nz * speed * dt;
        character.position.x = clamp(character.position.x + worldDX, STAGE3_BOUNDS.xMin, STAGE3_BOUNDS.xMax);
        character.position.z = clamp(character.position.z + worldDZ, STAGE3_BOUNDS.zEnd - 1, STAGE3_BOUNDS.zStart + 1);
        faceDirection(worldDX, worldDZ, dt);

        stepDistanceAccum += speed * dt;
        if (stepDistanceAccum > 1.0) {
          AudioManager && AudioManager.sfx && AudioManager.sfx('footstep');
          stepDistanceAccum = 0;
        }
      }

      const total = STAGE3_BOUNDS.zStart - STAGE3_BOUNDS.zEnd;
      const t = clamp(total > 0 ? (STAGE3_BOUNDS.zStart - character.position.z) / total : 1, 0, 1);
      if (rainCallbacks.onProgress) rainCallbacks.onProgress(t);

      const distToGoal = character.position.distanceTo(STAGE3_GOAL);
      if (distToGoal < STAGE3_ARRIVE_DIST) {
        arriveAtStars();
      }
    } else if (characterMode === 'arriving') {
      moving = false;
      arrivePauseTimer -= dt;
      if (arrivePauseTimer <= 0) {
        characterMode = 'arrived';
        if (rainCallbacks.onArrived) {
          const cb = rainCallbacks.onArrived;
          rainCallbacks.onArrived = null;
          cb();
        }
      }
    } else {
      // 'idle' أو 'arrived' -> واقفة ثابتة تمامًا، بدون أي تأثير من الماوس/اللمس/الكيبورد
      moving = false;
    }

    // Walk Animation procedural بالكامل — بدون أي ملف أنيميشن خارجي.
    // walkBlend يتحول بنعومة بين 0 (واقفة) و1 (بتمشي) باستخدام delta time
    // حتى لا تكون الحركة مفاجئة/robotic ولا تختلف سرعتها عن الـFPS.
    const targetBlend = moving ? 1 : 0;
    charMixerState.walkBlend += (targetBlend - charMixerState.walkBlend) * Math.min(1, dt * 4.5);
    const blend = charMixerState.walkBlend;
    charMixerState.stepPhase += dt * (0.9 + blend * 6.2);
    const phase = charMixerState.stepPhase;
    const swing = Math.sin(phase) * 0.5 * blend;

    if (charParts.leftUpperLeg) charParts.leftUpperLeg.rotation.x = swing;
    if (charParts.rightUpperLeg) charParts.rightUpperLeg.rotation.x = -swing;
    // الذراعان يتحركان عكس حركة الرجلين
    if (charParts.leftUpperArm) charParts.leftUpperArm.rotation.x = -swing * 0.85;
    if (charParts.rightUpperArm) charParts.rightUpperArm.rotation.x = swing * 0.85;

    // حركة بسيطة جدًا للجسم لأعلى وأسفل
    charMixerState.bob = Math.abs(Math.sin(phase)) * (0.008 + blend * 0.032);
    if (charParts.root) charParts.root.position.y = charMixerState.bob;

    // حركة بسيطة جدًا للشعر مع المشي/المطر (يتأخر قليلًا عن الجسم لإحساس طبيعي)
    if (charParts.hair) {
      charParts.hair.rotation.z = Math.sin(phase * 0.85) * (0.015 + blend * 0.055);
      charParts.hair.rotation.x = Math.sin(phase * 0.85 + 0.6) * (0.01 + blend * 0.03);
    }

    if (rimLight) {
      const facing = new THREE.Vector3(Math.sin(character.rotation.y), 0, Math.cos(character.rotation.y));
      rimLight.position.set(character.position.x - facing.z * 1.2, 1.6, character.position.z + facing.x * 1.2);
      rimLight.target.position.copy(character.position);
      rimLight.target.updateMatrixWorld();
    }

    updateGoalStars(dt);

    const refl = character.userData.reflection;
    if (refl) { refl.position.copy(character.position); refl.rotation.copy(character.rotation); }
  }

  /* ---------------------------------------------------------------
     صندوق الهدية ثلاثي الأبعاد
  --------------------------------------------------------------- */
  function buildGiftBox() {
    if (giftGroup) return;
    giftGroup = new THREE.Group();
    giftGroup.position.set(1.6, 0, -6.5);
    giftGroup.visible = false;

    const boxMat = new THREE.MeshStandardMaterial({ color: 0x7a2f3a, roughness: 0.4, metalness: 0.15 });
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xfff3e6, roughness: 0.3, metalness: 0.1 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), boxMat);
    body.position.y = 0.35;
    giftGroup.add(body);

    const ribbonV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.92), ribbonMat);
    ribbonV.position.y = 0.35;
    giftGroup.add(ribbonV);
    const ribbonH = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 0.16), ribbonMat);
    ribbonH.position.y = 0.35;
    giftGroup.add(ribbonH);

    giftPivot = new THREE.Group();
    giftPivot.position.set(0, 0.7, -0.45);
    giftGroup.add(giftPivot);

    giftLid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.22, 0.98), boxMat);
    giftLid.position.set(0, 0.11, 0.45);
    giftPivot.add(giftLid);

    const bowGeo = new THREE.TorusGeometry(0.14, 0.05, 8, 16, Math.PI * 1.4);
    const bowL = new THREE.Mesh(bowGeo, ribbonMat);
    bowL.position.set(-0.08, 0.78, 0);
    bowL.rotation.set(Math.PI / 2, 0, 0.6);
    const bowR = bowL.clone();
    bowR.position.x = 0.08;
    bowR.rotation.z = -0.6;
    giftGroup.add(bowL, bowR);

    giftLight = new THREE.PointLight(0xffd9a0, 0, 4, 2);
    giftLight.position.set(0, 0.6, 0);
    giftGroup.add(giftLight);

    giftBox = body; // hit target
    giftBox.userData.isGiftHit = true;
    ribbonV.userData.isGiftHit = true;
    ribbonH.userData.isGiftHit = true;
    giftLid.userData.isGiftHit = true;

    scene.add(giftGroup);

    // مجموعة قلوب 3D عائمة تظهر عند فتح الهدية
    const heartShape = new THREE.Shape();
    heartShape.moveTo(0, 0.25);
    heartShape.bezierCurveTo(0, 0.35, -0.15, 0.45, -0.25, 0.32);
    heartShape.bezierCurveTo(-0.4, 0.12, -0.15, -0.05, 0, -0.25);
    heartShape.bezierCurveTo(0.15, -0.05, 0.4, 0.12, 0.25, 0.32);
    heartShape.bezierCurveTo(0.15, 0.45, 0, 0.35, 0, 0.25);
    const heartGeo = new THREE.ShapeGeometry(heartShape);
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xe9b9c4, transparent: true, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(heartGeo, heartMat.clone());
      m.scale.set(0.18, 0.18, 0.18);
      m.material.opacity = 0;
      m.visible = false;
      scene.add(m);
      giftHeartsPool.push(m);
    }
  }

  function onPointerDown(e) {
    if (currentScreen === 'stage2') { handleStage2Pick(e); return; }
    if (currentScreen !== 'stage5' || giftOpened || !giftGroup || !giftGroup.visible) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(giftGroup.children, true);
    if (hits.length && hits.some(h => h.object.userData.isGiftHit)) {
      openGift();
    }
  }

  function openGift(cb) {
    if (giftOpened || !giftGroup) return;
    if (cb) onGiftOpenedCb = cb;
    giftOpened = true;

    AudioManager && AudioManager.sfx && AudioManager.sfx('giftOpen');

    // اهتزاز بسيط
    let shakeT = 0;
    const shakeDur = 0.45;
    const baseX = giftGroup.rotation.z;
    function shakeStep() {
      shakeT += 1 / 60;
      giftGroup.rotation.z = baseX + Math.sin(shakeT * 40) * 0.05 * (1 - shakeT / shakeDur);
      if (shakeT < shakeDur) requestAnimationFrame(shakeStep);
      else { giftGroup.rotation.z = baseX; liftLid(); }
    }
    shakeStep();
  }

  function liftLid() {
    let t = 0;
    const dur = 0.9;
    function step() {
      t += 1 / 60 / dur;
      const e = 1 - Math.pow(1 - Math.min(t, 1), 3);
      giftPivot.rotation.x = -e * (Math.PI * 0.72);
      giftLight.intensity = e * 2.2;
      if (t < 1) requestAnimationFrame(step);
      else spawnGiftHearts();
    }
    step();
  }

  function spawnGiftHearts() {
    giftHeartsPool.forEach((m, i) => {
      m.visible = true;
      m.material.opacity = 0;
      m.position.set(
        giftGroup.position.x + (Math.random() - 0.5) * 0.4,
        giftGroup.position.y + 0.7,
        giftGroup.position.z + (Math.random() - 0.5) * 0.4
      );
      m.userData.vy = 0.5 + Math.random() * 0.4;
      m.userData.life = 0;
      m.userData.maxLife = 2.4 + Math.random() * 0.8;
      m.userData.sway = Math.random() * Math.PI * 2;
    });
    if (onGiftOpenedCb) { onGiftOpenedCb(); onGiftOpenedCb = null; }
  }

  function updateGiftHearts(dt) {
    for (const m of giftHeartsPool) {
      if (!m.visible) continue;
      m.userData.life += dt;
      const t = m.userData.life / m.userData.maxLife;
      m.position.y += m.userData.vy * dt;
      m.userData.sway += dt * 2;
      m.position.x += Math.sin(m.userData.sway) * 0.002;
      m.material.opacity = Math.sin(Math.min(t, 1) * Math.PI) * 0.9;
      if (t >= 1) m.visible = false;
    }
  }

  /* ---------------------------------------------------------------
     الإضاءة
  --------------------------------------------------------------- */
  function buildLights() {
    ambientLight = new THREE.AmbientLight(0x6a6f9e, 0.55);
    scene.add(ambientLight);

    rimLight = new THREE.SpotLight(0xffe3c2, lowPower ? 0.8 : 1.1, 6, Math.PI / 4, 0.6, 1.2);
    rimLight.position.set(0.5, 1.6, 1);
    scene.add(rimLight);
    scene.add(rimLight.target);

    const fillLight = new THREE.PointLight(0x9fb2ff, 0.35, 20, 2);
    fillLight.position.set(0, 4, 2);
    scene.add(fillLight);
  }

  /* ---------------------------------------------------------------
     الكاميرا السينمائية
  --------------------------------------------------------------- */
  let camTime = 0;
  function updateCamera(dt) {
    camTime += dt;
    const idleX = Math.sin(camTime * 0.08) * 0.6;
    const idleY = 3.4 + Math.sin(camTime * 0.06) * 0.15;

    let targetPos, lookAt;
    const inRainJourney = currentScreen === 'stage3' &&
      (characterMode === 'playing' || characterMode === 'arriving' || characterMode === 'arrived');

    if (currentScreen === 'stage5' && giftGroup) {
      targetPos = new THREE.Vector3(giftGroup.position.x + 1.4, 1.5, giftGroup.position.z + 2.6);
      lookAt = new THREE.Vector3(giftGroup.position.x, 0.6, giftGroup.position.z);
    } else if (inRainJourney && character) {
      // كاميرا سينمائية ناعمة تتبع الشخصية أثناء تحكم اللاعب بها نحو النجوم
      const facing = new THREE.Vector3(Math.sin(character.rotation.y), 0, Math.cos(character.rotation.y));
      const arrived = characterMode !== 'playing';
      const followDist = arrived ? 3.1 : 4.6;
      const heightOff = arrived ? 1.9 : 2.3;
      targetPos = character.position.clone()
        .add(facing.clone().multiplyScalar(-followDist))
        .add(new THREE.Vector3(0, heightOff, 0));
      lookAt = character.position.clone().add(new THREE.Vector3(0, 1.3, 0));
      if (arrived && goalStarsGroup) {
        lookAt.lerp(goalStarsGroup.position, 0.4);
      }
    } else if (currentScreen === 'intro') {
      targetPos = new THREE.Vector3(idleX, idleY, 10);
      lookAt = new THREE.Vector3(0, 1.6, -6);
    } else if (currentScreen === 'stage1' && heartsGroup) {
      // حديقة جمع القلوب — إطلالة أمامية دافئة تسمح بمساحة كافية للّعب باللمس
      const c = heartsGroup.position;
      targetPos = new THREE.Vector3(c.x + idleX * 0.3, 3.0, c.z + 8.5);
      lookAt = new THREE.Vector3(c.x, 1.3, c.z - 1);
    } else if (currentScreen === 'stage2' && memoryGroup) {
      // حديقة الذكريات — إطلالة أوسع تُظهر كل العناصر التفاعلية معًا
      const c = memoryGroup.position;
      targetPos = new THREE.Vector3(c.x + idleX * 0.2, 3.8, c.z + 8.8);
      lookAt = new THREE.Vector3(c.x, 0.9, c.z - 1.5);
    } else if (currentScreen === 'stage4') {
      // سماء الأمنيات — تبتعد الكاميرا وتميل لأعلى نحو حقل النجوم الواسع
      targetPos = new THREE.Vector3(idleX * 0.5, 5.5, 4);
      lookAt = new THREE.Vector3(0, 10, -20);
    } else {
      // أي شاشة أخرى ثابتة: الشخصية Idle فقط
      const p = character ? character.position : IDLE_SPOT;
      targetPos = new THREE.Vector3(p.x + idleX * 0.4, 2.4, p.z + 4.2);
      lookAt = new THREE.Vector3(p.x, 1.1, p.z - 2);
    }
    camera.position.lerp(targetPos, 1 - Math.pow(0.0008, dt));
    const curLook = camera.userData.look || lookAt.clone();
    curLook.lerp(lookAt, 1 - Math.pow(0.001, dt));
    camera.userData.look = curLook;
    camera.lookAt(curLook);
  }

  /* ---------------------------------------------------------------
     حلقة التحديث
  --------------------------------------------------------------- */
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();

    if (starsMaterial) starsMaterial.uniforms.uTime.value = t;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 45) c.position.x = -45;
    }
    updateRain(dt);
    updateCharacter(dt);
    updateGiftHearts(dt);
    updateCamera(dt);

    renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------------------------------------------------------
     واجهة عامة
  --------------------------------------------------------------- */
  function setScreen(name) {
    const leavingRain = currentScreen === 'stage3' && name !== 'stage3';
    currentScreen = name;

    // كل مرحلة بيئتها الخاصة — نظهر مجموعة واحدة فقط في كل مرة
    if (roadGroup) roadGroup.visible = (name === 'stage3');
    if (heartsGroup) heartsGroup.visible = (name === 'stage1');
    if (memoryGroup) memoryGroup.visible = (name === 'stage2');

    if (name === 'stage5') {
      buildGiftBox();
      if (giftGroup) giftGroup.visible = true;
      if (giftEnvGroup) giftEnvGroup.visible = true;
    } else {
      if (giftGroup) giftGroup.visible = false;
      if (giftEnvGroup) giftEnvGroup.visible = false;
    }

    // الشخصية 3D procedural تظهر فقط في المرحلة ٣ (ليلة المطر) ولا تظهر في أي مرحلة أخرى
    if (character) character.visible = (name === 'stage3');

    if (name !== 'stage3') {
      if (leavingRain) resetStage3();
      characterMode = 'idle';
      if (character) {
        character.position.copy(IDLE_SPOT);
        character.rotation.y = IDLE_YAW;
      }
    }
  }

  // واجهة إضافية مطلوبة: setStage(1..5) — نفس منطق setScreen لكن بأرقام المراحل
  function setStage(stage) {
    if (typeof stage === 'number') setScreen(`stage${stage}`);
    else setScreen(stage);
  }

  function triggerGiftOpen(cb) {
    if (!ready) { if (cb) cb(); return; }
    openGift(cb);
  }

  // تُستخدم عند استئناف تقدم محفوظ مسبقًا: تُظهر الصندوق مفتوحًا بدون إعادة تشغيل الأنيميشن
  function markGiftOpened() {
    if (!ready) return;
    buildGiftBox();
    giftOpened = true;
    if (giftGroup) giftGroup.visible = true;
    if (giftPivot) giftPivot.rotation.x = -(Math.PI * 0.72);
    if (giftLight) giftLight.intensity = 0.6;
  }

  return {
    init,
    resize,
    setScreen,
    setStage,
    // المرحلة ١ — جمع القلوب 3D
    stage1Render,
    stage1Stop,
    // المرحلة ٢ — حديقة الذكريات التفاعلية 3D
    startStage2,
    stage2MarkDiscovered,
    stopStage2,
    // المرحلة ٣ — تحكم حقيقي من اللاعب (بدون مشي تلقائي)
    startStage3,
    setStage3Move,
    resetStage3,
    // أسماء قديمة للتوافق مع أي كود سابق
    startRainJourney: startStage3,
    resetRainJourney,
    // المرحلة ٥ — الهدية
    triggerGiftOpen,
    markGiftOpened,
    get isReady() { return ready; },
  };
})();