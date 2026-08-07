// HEFP 3D scene: a cutaway manifold-wall segment (gas core -> TBC -> metal ->
// outer surface), colored live by the computed steady-state / soak values.
// Layer thicknesses are exaggerated for visibility, not to true scale
// (real TBC is ~350 micron vs. a 6mm metal wall).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const GAS_R = 30, TBC_R = 38, METAL_R = 60, LENGTH = 150;
const THETA_LEN = Math.PI * 1.5; // quarter-wedge cut away

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

function ringGeometry(innerR, outerR) {
  return new THREE.RingGeometry(innerR, outerR, 40, 1, 0, THETA_LEN);
}
function tubeGeometry(r) {
  return new THREE.CylinderGeometry(r, r, LENGTH, 40, 1, true, 0, THETA_LEN);
}

export function createManifoldScene(hostEl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c1712);
  scene.fog = new THREE.Fog(0x1c1712, 500, 1400);

  const camera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
  camera.position.set(280, -260, 180);
  camera.up.set(0, 0, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  hostEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, LENGTH / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 180;
  controls.maxDistance = 900;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff2e2, 1.05);
  key.position.set(300, -200, 400);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f9fdd, 0.3);
  rim.position.set(-300, 300, 200);
  scene.add(rim);

  const grid = new THREE.GridHelper(900, 18, 0x33291f, 0x211a13);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -METAL_R - 2;
  scene.add(grid);

  const group = new THREE.Group();
  group.rotation.z = -Math.PI * 0.15; // rotate the wedge cut toward the camera
  scene.add(group);

  // ---- gas core: inner glowing tube (hollow, represents the hot exhaust gas) ----
  const gasMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const gasTube = new THREE.Mesh(tubeGeometry(GAS_R), gasMat);
  gasTube.rotation.x = Math.PI / 2;
  group.add(gasTube);

  // ---- TBC layer ----
  const tbcMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  const tbcTube = new THREE.Mesh(tubeGeometry(TBC_R), tbcMat);
  tbcTube.rotation.x = Math.PI / 2;
  group.add(tbcTube);
  const tbcCapFront = new THREE.Mesh(ringGeometry(GAS_R, TBC_R), tbcMat);
  const tbcCapBack = tbcCapFront.clone();
  tbcCapBack.position.z = LENGTH;
  group.add(tbcCapFront, tbcCapBack);

  // ---- metal wall (outer surface color = live Ts) ----
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide });
  const metalTube = new THREE.Mesh(tubeGeometry(METAL_R), metalMat);
  metalTube.rotation.x = Math.PI / 2;
  group.add(metalTube);
  const metalCapFront = new THREE.Mesh(ringGeometry(TBC_R, METAL_R), new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.4, roughness: 0.55, side: THREE.DoubleSide }));
  const metalCapBack = metalCapFront.clone();
  metalCapBack.position.z = LENGTH;
  group.add(metalCapFront, metalCapBack);

  function resize() {
    const w = hostEl.clientWidth, h = hostEl.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  new ResizeObserver(resize).observe(hostEl);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function setTemps({ Tgas, Ts }) {
    gasMat.color.copy(tempToColor(Tgas));
    const midT = (Tgas + Ts) / 2;
    tbcMat.color.copy(tempToColor(midT));
    tbcCapFront.material.color.copy(tempToColor(midT));
    tbcCapBack.material.color.copy(tempToColor(midT));
    metalMat.color.copy(tempToColor(Ts));
    metalCapFront.material.color.copy(tempToColor(Ts));
    metalCapBack.material.color.copy(tempToColor(Ts));
  }

  return { setTemps, tempToColor };
}
