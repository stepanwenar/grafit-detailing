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
  root.classList.add("is-failed");
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
  scene.fog = new THREE.Fog(0x0b0b0c, 9, 22);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  /* ---------- Освещение: «бокс» с линейными LED-панелями ---------- */
  // Отражения на лаке берутся из невидимой сцены-окружения со светящимися полосами.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(buildStudioEnvironment(), 0.015).texture;
  pmrem.dispose();

  // Мягкий заполняющий свет сверху и ключевой спереди, чтобы белый кузов выглядел белым
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 6, 5);
  scene.add(key);

  // Видимые элементы бокса: полосы света на потолке и на дальней стене
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.65) });
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 7.5), stripMat);
    strip.position.set(i * 1.25, 3.6, -1);
    scene.add(strip);
  }
  const wallMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.55, 0.58) });
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.035), wallMat);
    line.position.set(0, 1.0 + i * 0.85, -7.5);
    scene.add(line);
  }

  /* ---------- Пол: тёмный глянец + отражение машины ---------- */
  const floorY = 0;
  if (!isSmall()) {
    const reflector = new Reflector(new THREE.CircleGeometry(14, 64), {
      textureWidth: Math.round(window.innerWidth * 0.6),
      textureHeight: Math.round(window.innerHeight * 0.6),
      color: 0x8a8a8a,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = floorY - 0.002;
    scene.add(reflector);
  }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0d0d0e,
      roughness: 0.35,
      metalness: 0.0,
      transparent: !isSmall(),
      opacity: isSmall() ? 1 : 0.86,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  scene.add(floor);

  // Мягкая тень под машиной
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: radialShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
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
        m.roughness = 0.02;
        m.metalness = 0.1;
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

  /* ---------- Кадрирование под ширину экрана ---------- */
  const target = new THREE.Vector3(0, 0.55, 0);
  function layout() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const small = w < 900;
    camera.fov = small ? 34 : 28;
    const dist = small ? 9.2 / Math.min(1, camera.aspect * 1.25) : 10.6;
    camera.position.set(0, small ? 1.5 : 1.55, dist);
    camera.lookAt(target);
    // Сдвигаем машину вправо на компьютере (слева текст) и вверх на телефоне (снизу текст)
    if (small) camera.setViewOffset(w, h, 0, h * 0.02, w, h);
    else camera.setViewOffset(w, h, -w * 0.22, h * 0.02, w, h);
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
    root.classList.add("is-dragging", "was-touched");
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
    root.classList.remove("is-dragging");
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
  const swatches = [...root.querySelectorAll("[data-paint]")];
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
  root.classList.add("is-ready");
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

/** Текстура мягкой тени: тёмное пятно с размытыми краями. */
function radialShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, "rgba(0,0,0,0.95)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.65)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
