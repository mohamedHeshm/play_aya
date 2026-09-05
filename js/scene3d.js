/* =====================================================================
   scene3d.js — العالم السينمائي ثلاثي الأبعاد (Three.js)
   طريق ليلي هادئ تحت المطر: سماء + نجوم + غيوم + ضباب + أرض مبللة
   + شخصية 3D تمشي تلقائيًا + صندوق هدية 3D تفاعلي
   يعمل كخلفية دائمة خلف كل شاشات اللعبة (canvas شفاف الطبقات فوقه)
   لا يوقف أي وظيفة موجودة: fallback كامل لو WebGL غير متاح
   ===================================================================== */

const World = (() => {

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
  let character, charMixerState;
  let giftBox, giftLid, giftGroup, giftPivot, giftHeartsPool = [];
  let pathCurve;
  let pathT = 0;
  let pauseTimer = 0;
  let isPaused = false;

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
    buildRain();
    buildCharacterPath();
    buildCharacter();
    buildLights();

    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });

    ready = true;
    loop();
    return true;
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
     الشخصية — نموذج stylized بسيط بالـ geometry (بدون Emoji)
  --------------------------------------------------------------- */
  function buildCharacter() {
    character = new THREE.Group();

    const skin = new THREE.MeshStandardMaterial({ color: 0xf1d9c9, roughness: 0.6 });
    const dress = new THREE.MeshStandardMaterial({ color: 0xb9857f, roughness: 0.55 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2c2130, roughness: 0.5 });

    const body = new THREE.Group();
    body.name = 'body';

    const torso = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 10), dress);
    torso.position.y = 0.95;
    body.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
    head.position.y = 1.55;
    body.add(head);

    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairCap.position.y = 1.58;
    body.add(hairCap);

    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.5, 8);
    const armL = new THREE.Mesh(armGeo, skin);
    armL.name = 'armL';
    armL.position.set(-0.32, 1.15, 0);
    armL.geometry.translate(0, -0.25, 0);
    const armR = armL.clone();
    armR.name = 'armR';
    armR.position.x = 0.32;
    body.add(armL, armR);

    const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.55, 8);
    const legL = new THREE.Mesh(legGeo, skin);
    legL.name = 'legL';
    legL.position.set(-0.12, 0.55, 0);
    legL.geometry.translate(0, -0.275, 0);
    const legR = legL.clone();
    legR.name = 'legR';
    legR.position.x = 0.12;
    body.add(legL, legR);

    character.add(body);

    // ظل ناعم أسفل الشخصية
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
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    character.add(shadowMesh);

    scene.add(character);

    // انعكاس خفيف على الأرض المبللة
    const reflectionChar = character.clone(true);
    reflectionChar.traverse(o => {
      if (o.isMesh && o.material && o.material.map !== shadowTex) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.16;
      }
    });
    reflectionGroup.add(reflectionChar);
    character.userData.reflection = reflectionChar;

    charMixerState = { bob: 0, stepPhase: 0 };
  }

  function updateCharacter(dt) {
    if (!character) return;

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
    const angle = Math.atan2(tangent.x, tangent.z);
    character.rotation.y = angle;

    const walking = !isPaused;
    charMixerState.stepPhase += (walking ? dt * 7 : dt * 1.2);
    charMixerState.bob = Math.abs(Math.sin(charMixerState.stepPhase)) * (walking ? 0.05 : 0.01);
    const body = character.getObjectByName('body');
    if (body) body.position.y = charMixerState.bob;

    const legL = character.getObjectByName('legL');
    const legR = character.getObjectByName('legR');
    const armL = character.getObjectByName('armL');
    const armR = character.getObjectByName('armR');
    const swing = walking ? Math.sin(charMixerState.stepPhase) * 0.5 : 0;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing * 0.7;
    if (armR) armR.rotation.x = swing * 0.7;

    if (rimLight) {
      rimLight.position.set(character.position.x - tangent.z * 1.2, 1.6, character.position.z + tangent.x * 1.2);
      rimLight.target.position.copy(character.position);
      rimLight.target.updateMatrixWorld();
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
    if (name === 'stage5') {
      buildGiftBox();
      if (giftGroup) giftGroup.visible = true;
    } else if (giftGroup) {
      giftGroup.visible = false;
    }
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
    triggerGiftOpen,
    markGiftOpened,
    get isReady() { return ready; },
  };
})();
