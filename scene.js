// HEFP 3D scene: a simplified inline-4 engine block carrying a real scanned
// exhaust manifold mesh (CC-BY "Exhaust Manifold" by AnsysLearn, Sketchfab),
// with firing animation, exhaust-flow particles, and radiative heat-ray
// particles whose rate and brightness are driven by the live computed
// surface temperature and emissivity — i.e. the actual radiation term in
// the model, not decoration. The engine block/cylinders are procedural;
// the manifold geometry itself is the real mesh. Invisible guide curves
// (matched to the loaded mesh's footprint) drive where flow/ray particles
// travel, since the real mesh has no parametric runner paths of its own.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MANIFOLD_CREDIT = 'Exhaust Manifold by AnsysLearn (CC-BY-4.0, sketchfab.com/AnsysLearn)';

const N_CYL = 4;
const CYL_SPACING = 36;
const BLOCK_W = N_CYL * CYL_SPACING + 26;
const BLOCK_D = 76;
const BLOCK_H = 54;
const PIPE_R = 7.5;
const FIRING_ORDER = [0, 2, 3, 1]; // classic inline-4 1-3-4-2 firing order (0-indexed)

function tempToColor(T) {
  const stops = [
    { t: 20, c: [0.55, 0.62, 0.70] },
    { t: 90, c: [0.85, 0.82, 0.74] },
    { t: 300, c: [0.86, 0.42, 0.16] },
    { t: 550, c: [0.74, 0.15, 0.08] },
    { t: 900, c: [1.0, 0.78, 0.25] },
  ];
  if (T <= stops[0].t) return new THREE.Color(...stops[0].c);
  if (T >= stops[stops.length - 1].t) return new THREE.Color(...stops[stops.length - 1].c);
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (T >= stops[i].t && T <= stops[i + 1].t) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const f = (T - lo.t) / (hi.t - lo.t);
  return new THREE.Color(lo.c[0] + (hi.c[0] - lo.c[0]) * f, lo.c[1] + (hi.c[1] - lo.c[1]) * f, lo.c[2] + (hi.c[2] - lo.c[2]) * f);
}

export function createManifoldScene(hostEl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x181310);
  scene.fog = new THREE.Fog(0x181310, 500, 1600);

  const camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
  camera.position.set(420, -480, 300);
  camera.up.set(0, 0, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  hostEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 15, BLOCK_H / 2 + 10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 220;
  controls.maxDistance = 1100;

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xfff2e2, 1.05);
  key.position.set(300, -300, 500);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f9fdd, 0.3);
  rim.position.set(-300, 300, 200);
  scene.add(rim);

  const grid = new THREE.GridHelper(1000, 20, 0x2e2419, 0x1c160f);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  // ---- engine block ----
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x35383b, metalness: 0.5, roughness: 0.55 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_W, BLOCK_D, BLOCK_H), blockMat);
  block.position.set(0, 0, BLOCK_H / 2);
  scene.add(block);

  // ---- cylinders + spark/combustion flashers ----
  const cylPorts = [];
  const flashers = [];
  for (let i = 0; i < N_CYL; i++) {
    const x = -BLOCK_W / 2 + 23 + i * CYL_SPACING;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 12, 24), blockMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(x, -BLOCK_D / 2 + 14, BLOCK_H + 6);
    scene.add(head);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0 });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(10, 14, 14), flashMat);
    flash.position.set(x, -BLOCK_D / 2 + 14, BLOCK_H + 13);
    scene.add(flash);
    flashers.push({ mesh: flash, mat: flashMat, life: 0 });

    cylPorts.push(new THREE.Vector3(x, -BLOCK_D / 2 + 14, BLOCK_H + 18));
  }

  // ---- exhaust manifold: invisible guide curves (4 runners -> collector -> outlet) ----
  // these drive particle paths; the VISIBLE manifold is the loaded GLTF mesh below,
  // positioned to roughly follow this same footprint.
  const collector = new THREE.Vector3(0, BLOCK_D / 2 + 26, BLOCK_H - 14);
  const runnerCurves = cylPorts.map((p) => {
    const mid1 = new THREE.Vector3(p.x, p.y + 22, p.z + 6);
    const mid2 = new THREE.Vector3(p.x * 0.25, collector.y - 18, collector.z + 10);
    return new THREE.CatmullRomCurve3([p, mid1, mid2, collector]);
  });
  const outletEnd = new THREE.Vector3(0, BLOCK_D / 2 + 95, BLOCK_H - 22);
  const outletCurve = new THREE.CatmullRomCurve3([
    collector,
    new THREE.Vector3(0, collector.y + 28, collector.z - 6),
    outletEnd,
  ]);

  // ---- load the real manifold mesh and fit it over the guide-curve footprint ----
  let manifoldMaterials = [];
  const manifoldGroup = new THREE.Group();
  scene.add(manifoldGroup);
  new GLTFLoader().load(
    "models/exhaust_manifold/scene.gltf",
    (gltf) => {
      const model = gltf.scene;
      // glTF is Y-up; this scene uses Z-up (matches camera.up above)
      model.rotation.x = Math.PI / 2;

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // fit the manifold's across-cylinders span to the guide curves' span
      const targetWidth = (N_CYL - 1) * CYL_SPACING * 1.35;
      const scale = targetWidth / Math.max(size.x, 1e-6);
      model.scale.setScalar(scale);

      // re-measure after scaling, then center the model on the collector footprint
      const box2 = new THREE.Box3().setFromObject(model);
      const center2 = new THREE.Vector3();
      box2.getCenter(center2);
      const target = new THREE.Vector3(0, (BLOCK_D / 2 + collector.y) / 2 - 6, BLOCK_H + 6);
      model.position.sub(center2).add(target);

      model.traverse((child) => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.metalness = 0.55;
          child.material.roughness = 0.4;
          manifoldMaterials.push(child.material);
        }
      });
      manifoldGroup.add(model);
      if (pendingColor) manifoldMaterials.forEach((m) => m.color.copy(pendingColor));
    },
    undefined,
    (err) => console.error("HEFP: failed to load exhaust manifold model", err)
  );
  let pendingColor = null;

  // ---- exhaust-flow particles (hot gas moving through the manifold) ----
  const MAX_FLOW = 24;
  const flowPool = Array.from({ length: MAX_FLOW }, () => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0 }));
    scene.add(mesh);
    return { mesh, active: false, t: 0, curveIdx: 0, speed: 0 };
  });
  function spawnFlow(curveIdx) {
    const p = flowPool.find((f) => !f.active);
    if (!p) return;
    p.active = true; p.t = 0; p.curveIdx = curveIdx;
    p.speed = 0.9 + Math.random() * 0.3;
    p.mesh.material.opacity = 0.9;
  }

  // ---- radiative heat-ray particles (the model's actual radiation term) ----
  const MAX_RAYS = 70;
  const rayPool = Array.from({ length: MAX_RAYS }, () => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    return { line, geo, mat, active: false, life: 0, origin: new THREE.Vector3(), dir: new THREE.Vector3() };
  });
  const allManifoldCurves = [...runnerCurves, outletCurve];
  function spawnRay() {
    const p = rayPool.find((r) => !r.active);
    if (!p) return;
    const curve = allManifoldCurves[Math.floor(Math.random() * allManifoldCurves.length)];
    const t = Math.random();
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const arbitrary = Math.abs(tangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, arbitrary).normalize();
    const angle = Math.random() * Math.PI * 2;
    const dir = normal.clone().applyAxisAngle(tangent, angle);
    pos.addScaledVector(dir, PIPE_R * 1.05);
    p.active = true; p.life = 0; p.origin.copy(pos); p.dir.copy(dir);
  }

  let currentTs = 480, currentTgas = 650, currentEps = 0.85;
  let engineRunning = true;
  let firingTimer = 0, firingIdx = 0;
  const FIRING_INTERVAL = 0.42; // seconds, illustrative idle cadence

  function setTemps({ Tgas, Ts, eps }) {
    currentTgas = Tgas; currentTs = Ts;
    if (typeof eps === "number") currentEps = eps;
    const c = tempToColor(Ts);
    if (manifoldMaterials.length) manifoldMaterials.forEach((m) => m.color.copy(c));
    else pendingColor = c;
  }
  function setEngineRunning(v) { engineRunning = v; }

  function resize() {
    const w = hostEl.clientWidth, h = hostEl.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(hostEl);
  resize();

  let lastT = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    controls.update();

    // firing sequence
    if (engineRunning) {
      firingTimer += dt;
      if (firingTimer >= FIRING_INTERVAL) {
        firingTimer = 0;
        const cyl = FIRING_ORDER[firingIdx % FIRING_ORDER.length];
        firingIdx++;
        flashers[cyl].life = 1;
        spawnFlow(cyl);
      }
    }
    flashers.forEach((f) => {
      if (f.life > 0) {
        f.life = Math.max(0, f.life - dt * 6);
        f.mat.opacity = f.life * 0.9;
        const glow = tempToColor(currentTgas);
        f.mat.color.lerp(glow, 0.3).lerp(new THREE.Color(1, 1, 1), f.life * 0.6);
      }
    });

    // flow particles
    flowPool.forEach((p) => {
      if (!p.active) return;
      p.t += dt * p.speed * 0.7;
      const curve = runnerCurves[p.curveIdx];
      if (p.t >= 1) { p.active = false; p.mesh.material.opacity = 0; return; }
      const pos = curve.getPointAt(Math.min(p.t, 0.999));
      p.mesh.position.copy(pos);
      p.mesh.material.color.copy(tempToColor(currentTgas));
      p.mesh.material.opacity = 0.85 * (1 - p.t * 0.3);
    });

    // radiative rays: spawn rate scales with how hot + how emissive the surface is
    const heatFrac = THREE.MathUtils.clamp((currentTs - 80) / 500, 0, 1);
    const spawnChance = heatFrac * currentEps * dt * 26;
    if (Math.random() < spawnChance) spawnRay();
    rayPool.forEach((r) => {
      if (!r.active) return;
      r.life += dt;
      const dur = 0.55;
      if (r.life >= dur) { r.active = false; r.mat.opacity = 0; return; }
      const grow = r.life / dur;
      const p0 = r.origin;
      const p1 = r.origin.clone().addScaledVector(r.dir, 6 + grow * 16);
      const positions = r.geo.attributes.position;
      positions.setXYZ(0, p0.x, p0.y, p0.z);
      positions.setXYZ(1, p1.x, p1.y, p1.z);
      positions.needsUpdate = true;
      r.mat.opacity = (1 - grow) * 0.8;
      r.mat.color.copy(tempToColor(currentTs));
    });

    renderer.render(scene, camera);
  }
  animate();

  return { setTemps, setEngineRunning, tempToColor, credit: MANIFOLD_CREDIT };
}
