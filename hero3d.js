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
import { Reflector } from "three/addons/objects/Reflector.js";

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
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0c);
  scene.fog = new THREE.Fog(0x0b0b0c, 16, 34);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

  /* ---------- Освещение ---------- */
  // Отражения на лаке — из невидимой сцены-окружения с яркими LED-полосами.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildStudioEnvironment(), 0.015).texture;
  pmrem.dispose();

  // Общий свет бокса и ключевой спереди-сверху
  scene.add(new THREE.HemisphereLight(0xf2f4f8, 0x202022, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 7, 6);
  scene.add(key);

  /* ---------- Детейлинг-бокс: пол, стены, потолок, LED ---------- */
  const floorY = 0;
  buildDetailingBay(scene, { reflections: !isSmall() });
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
  scene.add(shadow);

  /* ---------- Модель ---------- */
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const progress = root.querySelector(".hero-3d__progress span");
  const gltf = await loader.loadAsync("models/porsche-911.glb", (e) => {
    if (e.total && progress) progress.style.transform = `scaleX(${e.loaded / e.total})`;
  });

  const car = gltf.scene;
  const paint = new THREE.MeshPhysicalMaterial({
    ...PAINTS.white,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.25,
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
  turntable.add(car);
  scene.add(turntable);
  box.setFromObject(turntable);
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
    const minDist = (small ? 2.2 : 2.9) / heightFactor;
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
  const targetColor = new THREE.Color().setHex(PAINTS.white.color);
  let targetMetal = PAINTS.white.metalness;
  let targetRough = PAINTS.white.roughness;
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

    paint.color.lerp(targetColor, 0.08 * dt);
    paint.metalness += (targetMetal - paint.metalness) * 0.08 * dt;
    paint.roughness += (targetRough - paint.roughness) * 0.08 * dt;

    renderer.render(scene, camera);
  }
  frame();
  hero.classList.add("is-3d-ready");
}

/**
 * Видимый детейлинг-бокс вокруг машины (машина стоит в центре, нос смотрит на камеру по +Z).
 * Размер: 11 × 20 м, потолок 4.4 м. Камера находится внутри бокса.
 */
function buildDetailingBay(scene, { reflections }) {
  const W = 11, D = 20, H = 4.4;
  const zBack = -7.5, zFront = zBack + D;

  /* Пол: светло-серый наливной пол с плиткой 1×1 м и отражением */
  const tile = canvasTexture(512, (g, n) => {
    g.fillStyle = "#3a3b3e";
    g.fillRect(0, 0, n, n);
    // лёгкая неоднородность покрытия
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      g.fillRect(Math.random() * n, Math.random() * n, 2, 2);
    }
    g.strokeStyle = "rgba(10,10,12,0.9)";
    g.lineWidth = 6;
    g.strokeRect(0, 0, n, n);
  });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping;
  tile.repeat.set(W, D);
  tile.anisotropy = 8;

  if (reflections) {
    const reflector = new Reflector(new THREE.PlaneGeometry(W, D), {
      textureWidth: Math.round(window.innerWidth * 0.75),
      textureHeight: Math.round(window.innerHeight * 0.75),
      color: 0x9a9a9a,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, -0.002, zBack + D / 2);
    scene.add(reflector);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({
      map: tile,
      roughness: 0.32,
      metalness: 0,
      transparent: reflections,
      opacity: reflections ? 0.82 : 1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, zBack + D / 2);
  scene.add(floor);

  /* Стены: графитовые панели со швами */
  const panel = canvasTexture(256, (g, n) => {
    const grad = g.createLinearGradient(0, 0, n, 0);
    grad.addColorStop(0, "#232427");
    grad.addColorStop(0.5, "#2a2b2e");
    grad.addColorStop(1, "#232427");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    g.fillStyle = "#121214";
    g.fillRect(0, 0, 4, n);
  });
  panel.wrapS = panel.wrapT = THREE.RepeatWrapping;
  const wallMat = (repeatX) => {
    const t = panel.clone();
    t.needsUpdate = true;
    t.repeat.set(repeatX, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 });
  };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat(W / 1.2));
  back.position.set(0, H / 2, zBack);
  scene.add(back);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), wallMat(D / 1.2));
    wall.position.set((side * W) / 2, H / 2, zBack + D / 2);
    wall.rotation.y = -side * Math.PI / 2;
    scene.add(wall);
  }

  /* Потолок */
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H, zBack + D / 2);
  scene.add(ceiling);

  /* LED: линии на потолке, рамка по периметру, вертикали и подсветка пола на стенах */
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.3), toneMapped: false });
  const ledSoft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.15), toneMapped: false });
  const ledDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.55, 0.58), toneMapped: false });
  const bar = (w, h, d, x, y, z, mat = led) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
  };
  for (let i = -3; i <= 3; i++) bar(0.07, 0.03, 9, i * 1.05, H - 0.02, 0.5);        // линии над машиной
  for (const z of [-4.2, 5.2]) bar(7.4, 0.03, 0.07, 0, H - 0.02, z);                // поперечины рамки
  for (let i = -4; i <= 4; i++) bar(0.04, 1.9, 0.03, i * 1.2, 1.45, zBack + 0.02, ledDim); // вертикали на задней стене
  bar(W - 0.4, 0.035, 0.03, 0, 0.32, zBack + 0.02, ledSoft);                         // подсветка у пола сзади
  for (const side of [-1, 1]) {
    bar(0.03, 0.035, D - 2, side * (W / 2 - 0.02), 0.32, zBack + D / 2, ledSoft);    // подсветка у пола по бокам
    for (let k = 0; k < 5; k++) bar(0.03, 2.6, 0.05, side * (W / 2 - 0.02), 1.75, zBack + 1.6 + k * 2.4, ledSoft);
  }
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

/** Невидимая «студия» для отражений: тёмная комната, LED-полосы сверху и софтбоксы по бокам. */
function buildStudioEnvironment() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x020202);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(24, 9, 24),
    new THREE.MeshBasicMaterial({ color: 0x070707, side: THREE.BackSide }),
  );
  room.position.y = 4;
  env.add(room);

  const bright = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6.2) });
  for (let i = -3; i <= 3; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 14), bright);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(i * 1.3, 6.5, 0);
    env.add(strip);
  }
  const soft = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.7), side: THREE.DoubleSide });
  for (const x of [-9, 9]) {
    const box = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), soft);
    box.position.set(x, 2.2, 0);
    box.rotation.y = Math.PI / 2;
    env.add(box);
  }
  const front = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.4), soft);
  front.position.set(0, 2.6, 10);
  front.rotation.y = Math.PI;
  env.add(front);
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
