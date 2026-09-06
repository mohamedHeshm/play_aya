/* =====================================================================
   scene3d.js — العالم السينمائي ثلاثي الأبعاد (Three.js)
   طريق ليلي هادئ تحت المطر: سماء + نجوم + غيوم + ضباب + أرض مبللة
   + شخصية 3D تمشي تلقائيًا + صندوق هدية 3D تفاعلي
   يعمل كخلفية دائمة خلف كل شاشات اللعبة (canvas شفاف الطبقات فوقه)
   لا يوقف أي وظيفة موجودة: fallback كامل لو WebGL غير متاح
   ===================================================================== */

const World = (() => {

  // ✏️ الشخصية 3D — ضعي ملف الموديل بتاعك هنا (GLB مُجهّز Rigged + Animations)
  // الموديل الحالي placeholder مجاني (CC-BY) لحد ما تستبدليه بموديل نهائي مناسب للأجواء الرومانسية
  const CHARACTER_CONFIG = {
    url: 'assets/models/character.glb',
    targetHeight: 1.7,        // ارتفاع الشخصية بوحدات العالم (متر تقريبًا)
    modelYawOffset: Math.PI,  // ✏️ لو الشخصية بتمشي بظهرها، جربي 0 بدل Math.PI
    walkSpeed: 2.0,
    runSpeed: 4.2,
    runThreshold: 0.85,       // نسبة دفع الجويستيك/الكيبورد اللي تحوّل المشي لجري
    turnSpeed: 8,             // سرعة استدارة الجسم نحو اتجاه الحركة (كل ما زاد كل ما كانت الاستدارة أسرع وأنعم)
    bounds: { minX: -3.2, maxX: 3.2, minZ: -26, maxZ: 7 }, // حدود المشي داخل الطريق
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
  let giftBox, giftLid, giftGroup, giftPivot, giftHeartsPool = [];
  let pathCurve;
  let pathT = 0;
  let pauseTimer = 0;
  let isPaused = false;

  // ---------------- وضع التحكم باللاعب (Player Controlled Third-Person) ----------------
  let playerControlled = false;   // true في شاشة البداية: تحكم حر بالجويستيك/الكيبورد
  let lateralMode = false;        // true في مرحلة المطر: تحكم أفقي بسيط (يمين/يسار) يتحكم فيه game.js
  let lateralTargetX = 0;         // 0..1 قادمة من game.js -> تتحول لإحداثية X داخل bounds
  const keyState = {};
  const joystick = { active: false, x: 0, y: 0, pointerId: null, centerX: 0, centerY: 0, maxRadius: 42 };
  let stepDistanceAccum = 0;

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
    buildGround();
    buildEnvironmentProps();
    buildRain();
    buildCharacterPath();
    buildCharacter();
    buildLights();
    setupInput();

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
      scene.add(g);
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
      scene.add(g);
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
      scene.add(g);
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

  /* ---------------------------------------------------------------
     مدخلات اللاعب — Keyboard (WASD/Arrows) + Joystick افتراضي للموبايل
  --------------------------------------------------------------- */
  function setupInput() {
    window.addEventListener('keydown', (e) => { keyState[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keyState[e.key.toLowerCase()] = false; });

    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    function setStickVisual(dx, dy) {
      stick.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    zone.addEventListener('pointerdown', (e) => {
      if (!playerControlled) return;
      joystick.active = true;
      joystick.pointerId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      joystick.centerX = rect.left + rect.width / 2;
      joystick.centerY = rect.top + rect.height / 2;
      zone.setPointerCapture(e.pointerId);
      updateJoystickFromEvent(e);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!joystick.active || e.pointerId !== joystick.pointerId) return;
      updateJoystickFromEvent(e);
    });
    function endJoystick(e) {
      if (e.pointerId !== joystick.pointerId) return;
      joystick.active = false;
      joystick.x = 0; joystick.y = 0;
      setStickVisual(0, 0);
    }
    zone.addEventListener('pointerup', endJoystick);
    zone.addEventListener('pointercancel', endJoystick);

    function updateJoystickFromEvent(e) {
      let dx = e.clientX - joystick.centerX;
      let dy = e.clientY - joystick.centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > joystick.maxRadius) {
        dx = (dx / dist) * joystick.maxRadius;
        dy = (dy / dist) * joystick.maxRadius;
      }
      setStickVisual(dx, dy);
      joystick.x = dx / joystick.maxRadius;
      joystick.y = dy / joystick.maxRadius;
    }
  }

  function getMoveInput() {
    // الكيبورد له الأولوية لو مضغوط، وإلا نستخدم الجويستيك
    let x = 0, z = 0;
    if (keyState['arrowleft'] || keyState['a']) x -= 1;
    if (keyState['arrowright'] || keyState['d']) x += 1;
    if (keyState['arrowup'] || keyState['w']) z -= 1;
    if (keyState['arrowdown'] || keyState['s']) z += 1;
    const usingKeyboard = x !== 0 || z !== 0;
    if (!usingKeyboard && joystick.active) {
      x = joystick.x;
      z = joystick.y;
    }
    const running = usingKeyboard ? (keyState['shift'] || false) : (Math.hypot(x, z) > CHARACTER_CONFIG.runThreshold);
    return { x, z, running };
  }

  function setJoystickVisible(show) {
    const zone = document.getElementById('joystick-zone');
    if (zone) zone.classList.toggle('hidden', !show);
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
    scene.add(ground);

    // انعكاس وهمي رخيص: نسخة مقلوبة شفافة من مجموعة العالم الأمامي
    reflectionGroup = new THREE.Group();
    reflectionGroup.scale.set(1, -1, 1);
    reflectionGroup.position.y = -0.02;
    scene.add(reflectionGroup);
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
    scene.add(rainMesh);

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
      scene.add(mesh);
      splashPool.push(mesh);
    }
  }

  function updateRain(dt) {
    if (!rainMesh) return;
    const visible = currentScreen !== 'intro';
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
     مسار الشخصية — منحنى ناعم على طول الطريق
  --------------------------------------------------------------- */
  function buildCharacterPath() {
    pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.4, 0, 6),
      new THREE.Vector3(-1.2, 0, -2),
      new THREE.Vector3(0.6, 0, -10),
      new THREE.Vector3(-0.8, 0, -18),
      new THREE.Vector3(1.4, 0, -26),
      new THREE.Vector3(-2.4, 0, 6),
    ], true, 'catmullrom', 0.5);
  }

  /* ---------------------------------------------------------------
     الشخصية — 3D Character Model حقيقي (GLB/GLTF) Rigged + Animations
     Idle / Walking / Running عبر AnimationMixer، مع placeholder مؤقت
     (كبسولة بسيطة بدون Emoji) لحد ما يخلص تحميل الموديل، وكـ fallback
     دائم لو تعذّر تحميل الملف بدون ما نكسر اللعبة
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

    scene.add(character);
    refreshReflection();

    charMixerState = { bob: 0, stepPhase: 0 };

    loadCharacterModel();
  }

  // Placeholder مؤقت: شكل هندسي بسيط (كبسولة + رأس) بدون أي Emoji إطلاقًا
  function buildPlaceholderCharacter() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9857f, roughness: 0.6 });
    const g = new THREE.Group();
    g.name = 'placeholder';
    const bodyGeo = (typeof THREE.CapsuleGeometry === 'function')
      ? new THREE.CapsuleGeometry(0.26, 0.7, 4, 8)
      : new THREE.CylinderGeometry(0.26, 0.26, 1.0, 10);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.85;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), mat);
    head.position.y = 1.55;
    g.add(head);
    charModelGroup.add(g);
  }

  function loadCharacterModel() {
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('GLTFLoader غير محمّل — الشخصية هتفضل بالشكل البديل البسيط.');
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      CHARACTER_CONFIG.url,
      (gltf) => onCharacterModelLoaded(gltf),
      undefined,
      (err) => {
        console.warn('تعذّر تحميل موديل الشخصية 3D، هيستمر استخدام الشكل البديل:', err && err.message);
      }
    );
  }

  function onCharacterModelLoaded(gltf) {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; } });

    // تحجيم الموديل ليطابق الطول المطلوب + إلصاق القدمين بالأرض
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = CHARACTER_CONFIG.targetHeight / (size.y || 1);
    model.scale.setScalar(scale);
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;
    model.rotation.y = CHARACTER_CONFIG.modelYawOffset;

    // إزالة الـ placeholder واستبداله بالموديل الحقيقي
    const placeholder = charModelGroup.getObjectByName('placeholder');
    if (placeholder) charModelGroup.remove(placeholder);
    charModelGroup.add(model);
    modelReady = true;

    // ربط الأنيميشن
    mixer = new THREE.AnimationMixer(model);
    actions = {};
    (gltf.animations || []).forEach((clip) => {
      const key = clip.name.toLowerCase();
      if (key.includes('idle') || key.includes('standing')) actions.idle = actions.idle || mixer.clipAction(clip);
      else if (key.includes('run')) actions.run = actions.run || mixer.clipAction(clip);
      else if (key.includes('walk')) actions.walk = actions.walk || mixer.clipAction(clip);
    });
    animState = 'idle';
    currentAction = actions.idle || actions.walk || null;
    if (currentAction) currentAction.play();

    refreshReflection();
  }

  // انعكاس خفيف على الأرض المبللة — يُعاد بناؤه كل مرة يتغير فيها شكل الشخصية (placeholder <-> model)
  function refreshReflection() {
    if (!character || !reflectionGroup) return;
    const old = character.userData.reflection;
    if (old) { reflectionGroup.remove(old); }
    const reflectionChar = character.clone(true);
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

  function updateCharacter(dt) {
    if (!character) return;
    if (mixer) mixer.update(dt);

    let moving = false;
    let running = false;

    if (playerControlled) {
      const input = getMoveInput();
      const mag = Math.min(1, Math.hypot(input.x, input.z));
      if (mag > 0.06) {
        moving = true;
        running = input.running;
        const dirX = input.x / (Math.hypot(input.x, input.z) || 1);
        const dirZ = input.z / (Math.hypot(input.x, input.z) || 1);
        const speed = (running ? CHARACTER_CONFIG.runSpeed : CHARACTER_CONFIG.walkSpeed) * mag;
        const moveX = dirX * speed * dt;
        const moveZ = dirZ * speed * dt;
        character.position.x = clamp(character.position.x + moveX, CHARACTER_CONFIG.bounds.minX, CHARACTER_CONFIG.bounds.maxX);
        character.position.z = clamp(character.position.z + moveZ, CHARACTER_CONFIG.bounds.minZ, CHARACTER_CONFIG.bounds.maxZ);

        const targetAngle = Math.atan2(dirX, dirZ);
        let diff = targetAngle - character.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        character.rotation.y += diff * Math.min(1, dt * CHARACTER_CONFIG.turnSpeed);

        stepDistanceAccum += Math.hypot(moveX, moveZ);
        if (stepDistanceAccum > 1.0) {
          AudioManager && AudioManager.sfx && AudioManager.sfx('footstep');
          stepDistanceAccum = 0;
        }
      }
    } else if (lateralMode) {
      const targetX = CHARACTER_CONFIG.bounds.minX + lateralTargetX * (CHARACTER_CONFIG.bounds.maxX - CHARACTER_CONFIG.bounds.minX);
      const prevX = character.position.x;
      character.position.x += (targetX - prevX) * Math.min(1, dt * 6);
      character.position.z = -4;
      const dx = character.position.x - prevX;
      if (Math.abs(dx) > 0.0008) {
        moving = true;
        const targetAngle = dx > 0 ? Math.PI / 2 * 0.6 : -Math.PI / 2 * 0.6;
        character.rotation.y += (targetAngle - character.rotation.y) * Math.min(1, dt * 6);
        stepDistanceAccum += Math.abs(dx);
        if (stepDistanceAccum > 0.8) {
          AudioManager && AudioManager.sfx && AudioManager.sfx('footstep');
          stepDistanceAccum = 0;
        }
      }
    } else {
      // سلوك سينمائي تلقائي (بدون تحكم اللاعب) — نفس المسار المنحني القديم
      if (isPaused) {
        pauseTimer -= dt;
        if (pauseTimer <= 0) isPaused = false;
      } else {
        pathT += dt * 0.012;
        if (pathT > 1) pathT -= 1;
        if (Math.random() < 0.0022) { isPaused = true; pauseTimer = 0.7 + Math.random() * 0.9; }
      }
      const pos = pathCurve.getPointAt(((pathT % 1) + 1) % 1);
      const tangent = pathCurve.getTangentAt(((pathT % 1) + 1) % 1);
      character.position.set(pos.x, 0, pos.z);
      character.rotation.y = Math.atan2(tangent.x, tangent.z);
      moving = !isPaused;

      if (rimLight) {
        rimLight.position.set(character.position.x - tangent.z * 1.2, 1.6, character.position.z + tangent.x * 1.2);
        rimLight.target.position.copy(character.position);
        rimLight.target.updateMatrixWorld();
      }
    }

    // أنيميشن حقيقي لو الموديل جاهز، وإلا bounce بسيط على الـ placeholder فقط
    if (modelReady) {
      setAnimState(moving ? (running ? 'run' : 'walk') : 'idle');
    } else {
      charMixerState.stepPhase += moving ? dt * 7 : dt * 1.2;
      charMixerState.bob = Math.abs(Math.sin(charMixerState.stepPhase)) * (moving ? 0.05 : 0.01);
      const ph = charModelGroup.getObjectByName('placeholder');
      if (ph) ph.position.y = charMixerState.bob;
    }

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
    if (currentScreen === 'stage5' && giftGroup) {
      targetPos = new THREE.Vector3(giftGroup.position.x + 1.4, 1.5, giftGroup.position.z + 2.6);
      lookAt = new THREE.Vector3(giftGroup.position.x, 0.6, giftGroup.position.z);
    } else if (playerControlled && character) {
      // كاميرا Third-Person حقيقية تتبع اتجاه الشخصية بنعومة
      const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), character.rotation.y).multiplyScalar(4.4);
      targetPos = character.position.clone().add(back).add(new THREE.Vector3(0, 2.5, 0));
      lookAt = character.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    } else if (currentScreen === 'intro') {
      targetPos = new THREE.Vector3(idleX, idleY, 10);
      lookAt = new THREE.Vector3(0, 1.6, -6);
    } else {
      const behind = character ? character.position.clone() : new THREE.Vector3();
      targetPos = new THREE.Vector3(behind.x + idleX * 0.4, 2.4, behind.z + 4.2);
      lookAt = new THREE.Vector3(behind.x, 1.1, behind.z - 2);
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
    currentScreen = name;
    playerControlled = (name === 'intro');
    lateralMode = (name === 'stage3');
    setJoystickVisible(playerControlled);

    if (name === 'stage5') {
      buildGiftBox();
      if (giftGroup) giftGroup.visible = true;
    } else if (giftGroup) {
      giftGroup.visible = false;
    }

    if (name === 'stage3' && character) {
      // ابدئي مرحلة المطر من منتصف الطريق تقريبًا
      lateralTargetX = 0.5;
    }
  }

  // تُستدعى من game.js (مرحلة المطر) بدل رسم شخصية Emoji مسطحة على الكانفاس 2D
  // value: رقم بين 0 و 1 يمثل موضع اللاعب الأفقي على الشاشة
  function setLateralX(value) {
    lateralTargetX = clamp(value, 0, 1);
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
    setLateralX,
    triggerGiftOpen,
    markGiftOpened,
    get isReady() { return ready; },
    get isPlayerControlled() { return playerControlled; },
  };
})();
