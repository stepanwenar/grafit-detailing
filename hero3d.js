/**
 * Первый экран: Porsche 911 Turbo S в детейлинг-боксе, вращение на 360°.
 *
 * - Потянуть мышью или пальцем по горизонтали — повернуть машину.
 *   Вертикальный свайп на телефоне прокручивает страницу как обычно.
 * - Без взаимодействия машина медленно вращается сама.
 * - Если WebGL недоступен или модель не загрузилась — остаётся фото.
 *
 * 3D-модель: «Porsche 911 Turbo S 992 (WIP)», автор — let's not care abt it (Sketchfab), CC BY 4.0.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const PAINTS = {
  white: { color: 0xeeeeeb, metalness: 0.05, roughness: 0.22 },
  graphite: { color: 0x3b3e42, metalness: 0.55, roughness: 0.28 },
  black: { color: 0x050506, metalness: 0.3, roughness: 0.18 },
};
const BODY_MATERIAL = "Material.009"; // панели кузова в исходной модели (Material.001 — чёрные детали)
const CAR_LENGTH = 4.55; // длина 911 Turbo S, м

const root = document.getElementById("hero-3d");
const hero = document.getElementById("hero");
const canvas = document.getElementById("hero-canvas");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => window.innerWidth < 900;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    return false;
  }
}

if (root && canvas && webglAvailable()) init().catch((err) => {
  console.warn("3D отключено:", err?.message || err);
  hero.classList.add("is-3d-failed");
});

async function init() {
  /* ---------- Рендерер, сцена, камера ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0c);
  scene.fog = new THREE.Fog(0x0b0b0c, 13, 30);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  /* ---------- Освещение ---------- */
  // Отражения на лаке — из невидимой студии с большими софтбоксами (мягкие градиенты, без полос).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildStudioEnvironment(), 0.015).texture;
  pmrem.dispose();

  // Общий свет бокса и ключевой спереди-сверху
  scene.add(new THREE.HemisphereLight(0xf2f4f8, 0x18181a, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 7, 6);
  scene.add(key);
  // Контровой свет сзади — отделяет чёрный силуэт от тёмного фона
  const rim = new THREE.DirectionalLight(0xe8eefc, 1.6);
  rim.position.set(-4, 3.5, -7);
  scene.add(rim);

  /* ---------- Студия: пол, стены, мягкий свет ---------- */
  const PODIUM_H = 0.07;
  const floorY = PODIUM_H; // машина стоит на подиуме
  buildShowroom(scene);
  const podium = buildPodium(PODIUM_H, !isSmall());
  // Мягкая тень под машиной
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, "rgba(0,0,0,0.95)"], [0.45, "rgba(0,0,0,0.65)"], [1, "rgba(0,0,0,0)"]]),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = floorY + 0.003;

  /* ---------- Модель ---------- */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const progress = root.querySelector(".hero-3d__progress span");
  const gltf = await loader.loadAsync("models/porsche-911.glb", (e) => {
    if (e.total && progress) progress.style.transform = `scaleX(${e.loaded / e.total})`;
  });

  const car = gltf.scene;
  const paint = new THREE.MeshPhysicalMaterial({
    ...PAINTS.black,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
  });
  car.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const replaced = mats.map((m) => {
      if (m.name === BODY_MATERIAL) return paint;
      if (m.transparent) {
        // Стёкла: тёмная тонировка
        m.color?.setHex(0x0a0c0e);
        m.opacity = Math.max(m.opacity, 0.82);
        m.roughness = 0.08;
        m.metalness = 0.1;
        m.envMapIntensity = 0.45;
      }
      return m;
    });
    o.material = Array.isArray(o.material) ? replaced : replaced[0];
  });

  // Нормируем размер и ставим на пол по центру
  const box = new THREE.Box3().setFromObject(car);
  const size = box.getSize(new THREE.Vector3());
  const lengthAxis = size.z >= size.x ? "z" : "x";
  const scale = CAR_LENGTH / size[lengthAxis];
  car.scale.setScalar(scale);
  box.setFromObject(car);
  const center = box.getCenter(new THREE.Vector3());
  car.position.sub(new THREE.Vector3(center.x, box.min.y - floorY, center.z));

  const turntable = new THREE.Group();
  if (lengthAxis === "x") car.rotation.y = Math.PI / 2;
  turntable.add(podium, shadow, car); // подиум вращается вместе с машиной
  if (!isSmall()) {
    // Отражение в глянцевом подиуме: зеркальная копия машины под его поверхностью
    const mirror = car.clone();
    mirror.scale.y *= -1;
    mirror.position.y = 2 * PODIUM_H - car.position.y;
    turntable.add(mirror);
  }
  scene.add(turntable);
  box.setFromObject(car);
  const carSize = box.getSize(new THREE.Vector3());
  shadow.scale.set(carSize.x * 1.55, Math.max(carSize.z, carSize.x) * 1.25, 1);

  /* ---------- Кадрирование: машина крупно и по центру ---------- */
  const target = new THREE.Vector3(0, 0.62, 0);
  function layout() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const small = w < 900;
    camera.fov = small ? 30 : 23;
    // Расстояние подбираем так, чтобы в профиль машина занимала ~85% ширины (на телефоне ~95%)
    const widthFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const wanted = CAR_LENGTH / (small ? 1.0 : 0.95);
    // …но так, чтобы по высоте машина тоже помещалась (важно для широких и низких окон)
    const heightFactor = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const minDist = (small ? 3.0 : 2.9) / heightFactor;
    const dist = Math.max(wanted / widthFactor, minDist);
    camera.position.set(0, small ? 1.45 : 1.35, dist);
    camera.lookAt(target);
    // На компьютере опускаем машину ниже центра — сверху надпись
    if (small) camera.clearViewOffset();
    else camera.setViewOffset(w, h, 0, -h * 0.095, w, h);
    camera.updateProjectionMatrix();
  }
  layout();
  window.addEventListener("resize", layout);

  /* ---------- Вращение: перетаскивание + инерция + автоповорот ---------- */
  let angle = 0.05; // стартовый ракурс — три четверти спереди
  let velocity = 0;
  let dragging = false;
  let lastX = 0;
  let lastInteraction = -Infinity;
  const AUTO_SPEED = reducedMotion ? 0 : 0.0016;

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    hero.classList.add("is-dragging", "was-touched");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const delta = (dx / root.clientWidth) * Math.PI * 1.6;
    angle += delta;
    velocity = delta;
    lastInteraction = performance.now();
  });
  const endDrag = () => {
    dragging = false;
    hero.classList.remove("is-dragging");
    lastInteraction = performance.now();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Стрелки с клавиатуры, когда фокус на сцене
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") velocity = -0.06;
    if (e.key === "ArrowRight") velocity = 0.06;
    lastInteraction = performance.now();
  });

  /* ---------- Цвет кузова ---------- */
  const swatches = [...document.querySelectorAll("[data-paint]")];
  const targetColor = new THREE.Color().setHex(PAINTS.black.color);
  let targetMetal = PAINTS.black.metalness;
  let targetRough = PAINTS.black.roughness;
  swatches.forEach((btn) =>
    btn.addEventListener("click", () => {
      const p = PAINTS[btn.dataset.paint];
      targetColor.setHex(p.color);
      targetMetal = p.metalness;
      targetRough = p.roughness;
      swatches.forEach((s) => s.setAttribute("aria-pressed", String(s === btn)));
    }),
  );

  /* ---------- Цикл отрисовки (только когда первый экран виден) ---------- */
  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(root);
  const clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05) * 60;
    if (!visible || document.hidden) return;

    if (!dragging) {
      velocity *= Math.pow(0.92, dt);
      angle += velocity * dt;
      const idle = performance.now() - lastInteraction > 3500;
      if (idle) angle += AUTO_SPEED * dt;
    }
    turntable.rotation.y = angle;

    paint.color.lerp(targetColor, Math.min(1, 0.08 * dt));
    paint.metalness += (targetMetal - paint.metalness) * 0.08 * dt;
    paint.roughness += (targetRough - paint.roughness) * 0.08 * dt;

    renderer.render(scene, camera);
  }
  frame();
  hero.classList.add("is-3d-ready");
}

/**
 * Студия WEN: тёмный полированный пол, стены с мягкими «заливками» света,
 * большой софтбокс над машиной. Никаких резких линий — только плавные градиенты.
 */
function buildShowroom(scene) {
  const W = 16, D = 24, H = 5.2;
  const zBack = -8.5;

  /* Пол: тёмный полированный бетон, без швов */
  const concrete = canvasTexture(512, (g, n) => {
    g.fillStyle = "#0e0e10";
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 0.035;
      g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 2})`;
      const r = Math.random() * 3 + 0.5;
      g.fillRect(Math.random() * n, Math.random() * n, r, r);
    }
  });
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  concrete.repeat.set(6, 9);

  // Пол — кольцо вокруг подиума: под подиумом пусто, там видно отражение машины
  const floor = new THREE.Mesh(
    new THREE.RingGeometry(3.04, 24, 128, 1),
    new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.55, metalness: 0, envMapIntensity: 0.12 }),
  );
  concrete.repeat.set(10, 10);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  /* Стены и потолок: глубокий графит без швов */
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95, envMapIntensity: 0.3 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat);
  back.position.set(0, H / 2, zBack);
  scene.add(back);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat);
    wall.position.set((side * W) / 2, H / 2, zBack + D / 2);
    wall.rotation.y = (-side * Math.PI) / 2;
    scene.add(wall);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, zBack + D / 2);
  scene.add(ceiling);

  /* Растушёвка стыка стены и пола — без линии горизонта, как «бесконечный» фон в фотостудии */
  const fade = (stops) =>
    new THREE.MeshBasicMaterial({
      map: linearTexture(stops),
      transparent: true,
      depthWrite: false,
      fog: false,
    });
  const floorFade = new THREE.Mesh(new THREE.PlaneGeometry(W, 7), fade([[0, "rgba(14,14,16,1)"], [0.55, "rgba(14,14,16,0.75)"], [1, "rgba(14,14,16,0)"]]));
  floorFade.rotation.x = -Math.PI / 2;
  floorFade.position.set(0, 0.006, zBack + 3.5);
  scene.add(floorFade);
  const wallFade = new THREE.Mesh(new THREE.PlaneGeometry(W, 2.2), fade([[0, "rgba(14,14,16,0)"], [1, "rgba(14,14,16,1)"]]));
  wallFade.position.set(0, 1.1, zBack + 0.05);
  scene.add(wallFade);

  /* Мягкий свет: всё — плоскости с размытыми краями и аддитивным смешиванием */
  const glow = (w, h, color, opacity, soft = 0.45) =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: softRectTexture(soft),
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    );

  // Большое мягкое сияние на задней стене за машиной — силуэт читается даже у чёрного авто
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 6),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, "rgba(255,255,255,0.55)"], [0.45, "rgba(255,255,255,0.16)"], [1, "rgba(255,255,255,0)"]]),
      color: 0xdfe4ee,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  halo.position.set(0, 1.6, zBack + 0.03);
  scene.add(halo);

  // Мягкие «заливки» света на задней стене (wall wash) — тёплый шампань по краям
  for (const x of [-5.6, 5.6]) {
    const wash = glow(2.4, H * 0.9, 0xd9c4a0, 0.22, 0.5);
    wash.position.set(x, H * 0.48, zBack + 0.04);
    scene.add(wash);
  }
  // Боковые стены: широкие вертикальные световые панели с размытыми краями
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const panel = glow(2.6, 3.4, 0xeef1f6, 0.16, 0.5);
      panel.position.set(side * (W / 2 - 0.03), 2.3, zBack + 3 + k * 5);
      panel.rotation.y = (-side * Math.PI) / 2;
      scene.add(panel);
    }
  }
  // Большой софтбокс над машиной
  const softbox = glow(7, 3.6, 0xffffff, 0.4, 0.42);
  softbox.rotation.x = Math.PI / 2;
  softbox.position.set(0, H - 0.04, 0);
  scene.add(softbox);
  // Мягкое отражение софтбокса на полу вокруг подиума
  const floorLight = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, "rgba(255,255,255,0.05)"], [0.5, "rgba(255,255,255,0.015)"], [1, "rgba(255,255,255,0)"]]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  floorLight.rotation.x = -Math.PI / 2;
  floorLight.position.y = 0.003;
  scene.add(floorLight);
}

/** Поворотный подиум: тёмный глянец + мягкое шампань-свечение по краю. */
function buildPodium(height, glossy) {
  const R = 3.05;
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R + 0.03, height, 128),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0d0f,
      metalness: 0,
      roughness: 0.32,
      envMapIntensity: 0.1,
      // На компьютере верх подиума — тёмное «стекло», в нём видно отражение машины
      transparent: glossy,
      opacity: glossy ? 0.84 : 1,
    }),
  );
  top.position.y = height / 2;
  group.add(top);

  // Свечение у основания подиума — кольцо с плавным спадом в обе стороны
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 2.9, R * 2.9),
    new THREE.MeshBasicMaterial({
      map: radialTexture([
        [0, "rgba(0,0,0,0)"],
        [0.6, "rgba(0,0,0,0)"],
        [0.69, "rgba(255,236,200,0.5)"],
        [0.8, "rgba(255,236,200,0.08)"],
        [1, "rgba(255,236,200,0)"],
      ]),
      color: 0xd9c4a0,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  group.add(ring);
  return group;
}

/** Текстура прямоугольника с мягкими краями (soft — доля размытия от края). */
function softRectTexture(soft = 0.45) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const f = Math.round(n * soft * 0.5);
  const h = g.createLinearGradient(0, 0, n, 0);
  h.addColorStop(0, "rgba(255,255,255,0)");
  h.addColorStop(f / n, "rgba(255,255,255,1)");
  h.addColorStop(1 - f / n, "rgba(255,255,255,1)");
  h.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = h;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = "destination-in";
  const v = g.createLinearGradient(0, 0, 0, n);
  v.addColorStop(0, "rgba(255,255,255,0)");
  v.addColorStop(f / n, "rgba(255,255,255,1)");
  v.addColorStop(1 - f / n, "rgba(255,255,255,1)");
  v.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = v;
  g.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Вертикальный линейный градиент: stops — [позиция 0..1 сверху вниз, цвет]. */
function linearTexture(stops) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([at, color]) => grad.addColorStop(at, color));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Текстура, нарисованная на canvas. */
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Невидимая студия для отражений на лаке: большие мягкие софтбоксы. */
function buildStudioEnvironment() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x030303);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(26, 10, 26),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0b, side: THREE.BackSide }),
  );
  room.position.y = 4.5;
  env.add(room);

  const box = (w, h, intensity, soft) =>
    new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: softRectTexture(soft),
        color: new THREE.Color(intensity, intensity, intensity * 1.02),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
  // Главный софтбокс сверху
  const top = box(9, 5, 7, 0.35);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 7, 0);
  env.add(top);
  // Длинные боковые софтбоксы — плавные «полосы» вдоль борта
  for (const x of [-10, 10]) {
    const side = box(14, 2.6, 3.2, 0.5);
    side.position.set(x, 2.4, 0);
    side.rotation.y = Math.PI / 2;
    env.add(side);
  }
  // Спереди и сзади — мягкие заполняющие
  const front = box(12, 3, 1.4, 0.55);
  front.position.set(0, 2.5, 11);
  front.rotation.y = Math.PI;
  env.add(front);
  const back = box(12, 3, 1.0, 0.55);
  back.position.set(0, 2.5, -11);
  env.add(back);
  return env;
}

/** Текстура радиального градиента (тень или световое пятно). */
function radialTexture(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([at, color]) => grad.addColorStop(at, color));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
