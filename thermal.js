// HEFP thermal model: direct JS port of thermal_model.py.
// Every number on the page is computed here, in the browser, not precomputed.
"use strict";

const SIGMA = 5.67e-8;   // Stefan-Boltzmann, W/m2K4
const EPS = 0.85;        // surface emissivity
const L_METAL = 6e-3;    // m, wall thickness
const K_METAL = 52.0;    // W/mK, gray cast iron
const RHO_METAL = 7870.0, CP_METAL = 447.0;
const C_EFF = RHO_METAL * CP_METAL * L_METAL; // ~21107 J/m2K

function solveSteadyState({ Tgas, Tamb, hOut, h1, L_TBC, k_TBC, withTBC, eps = EPS, L_metal = L_METAL, tol = 1e-8, maxIter = 500 }) {
  const R_conv1 = 1.0 / h1;
  const R_TBC = withTBC ? (L_TBC / k_TBC) : 0.0;
  const R_metal = L_metal / K_METAL;
  let Ts = Tamb + 400.0;
  let q = 0, iters = 0;
  for (let i = 0; i < maxIter; i++) {
    const TsK = Ts + 273.15, TambK = Tamb + 273.15;
    const hRad = eps * SIGMA * (TsK + TambK) * (TsK ** 2 + TambK ** 2);
    const R_out = 1.0 / (hOut + hRad);
    const R_total = R_conv1 + R_TBC + R_metal + R_out;
    q = (Tgas - Tamb) / R_total;
    const TsNew = Tamb + q * R_out;
    iters = i + 1;
    if (Math.abs(TsNew - Ts) < tol) { Ts = TsNew; break; }
    Ts = TsNew;
  }
  return { Ts, q, iters };
}

function dTdt(T, Tamb, hOut, Ceff, eps = EPS) {
  const TK = T + 273.15, TambK = Tamb + 273.15;
  return -(hOut * (T - Tamb) + eps * SIGMA * (TK ** 4 - TambK ** 4)) / Ceff;
}

// RK4 integration of the soak, sampled every `sampleEvery` seconds for plotting.
function rk4Soak(T0, { Tamb, hOut, Ceff = C_EFF, eps = EPS, dt = 1.0, tEnd = 100 * 60, sampleEvery = 1 }) {
  const n = Math.round(tEnd / dt);
  const t = [0], T = [T0];
  let Tc = T0, tc = 0;
  const everyN = Math.max(1, Math.round(sampleEvery / dt));
  for (let i = 0; i < n; i++) {
    const k1 = dTdt(Tc, Tamb, hOut, Ceff, eps);
    const k2 = dTdt(Tc + dt / 2 * k1, Tamb, hOut, Ceff, eps);
    const k3 = dTdt(Tc + dt / 2 * k2, Tamb, hOut, Ceff, eps);
    const k4 = dTdt(Tc + dt * k3, Tamb, hOut, Ceff, eps);
    Tc = Tc + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    tc = tc + dt;
    if ((i + 1) % everyN === 0 || i === n - 1) { t.push(tc); T.push(Tc); }
  }
  return { t, T };
}

// RK4 integration returning only the final value at tEnd (for convergence sweeps, no sampling overhead).
function rk4SoakFinal(T0, { Tamb, hOut, Ceff = C_EFF, eps = EPS, dt, tEnd }) {
  const n = Math.round(tEnd / dt);
  let Tc = T0;
  for (let i = 0; i < n; i++) {
    const k1 = dTdt(Tc, Tamb, hOut, Ceff, eps);
    const k2 = dTdt(Tc + dt / 2 * k1, Tamb, hOut, Ceff, eps);
    const k3 = dTdt(Tc + dt / 2 * k2, Tamb, hOut, Ceff, eps);
    const k4 = dTdt(Tc + dt * k3, Tamb, hOut, Ceff, eps);
    Tc = Tc + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return Tc;
}

function linearizedSoak(T0, { Tamb, hOut, Ceff = C_EFF, eps = EPS, tEnd = 100 * 60, sampleEvery = 10 }) {
  const TK0 = T0 + 273.15, TambK = Tamb + 273.15;
  const hRad0 = eps * SIGMA * (TK0 + TambK) * (TK0 ** 2 + TambK ** 2);
  const tau = Ceff / (hOut + hRad0);
  const t = [], T = [];
  for (let tc = 0; tc <= tEnd; tc += sampleEvery) {
    t.push(tc);
    T.push(Tamb + (T0 - Tamb) * Math.exp(-tc / tau));
  }
  return { t, T };
}

function rk4ConvergenceSweep({ dtList, tCheck = 2048.0, dtRef = 0.001953125, T0, Tamb, hOut, Ceff = C_EFF, eps = EPS }) {
  const Tref = rk4SoakFinal(T0, { Tamb, hOut, Ceff, eps, dt: dtRef, tEnd: tCheck });
  const Tvals = [], errors = [];
  for (const dt of dtList) {
    const Tv = rk4SoakFinal(T0, { Tamb, hOut, Ceff, eps, dt, tEnd: tCheck });
    Tvals.push(Tv);
    errors.push(Math.abs(Tv - Tref));
  }
  const orders = [];
  for (let i = 0; i < errors.length - 1; i++) {
    orders.push(Math.log2(errors[i] / errors[i + 1]));
  }
  return { dtList, Tvals, errors, orders, Tref };
}

// ---- Beyond the paper: physics-derived natural convection + Biot check ----
// The paper's post-shutdown model treats h_nat as a manually-set input. The
// functions below let the page additionally *compute* a natural-convection
// coefficient from geometry and temperature, and check the validity of the
// lumped-capacitance assumption the RK4 soak model relies on -- both using
// standard correlations (Cengel & Ghajar, Heat and Mass Transfer, 6e), not
// anything reported in the submitted paper.

// Air properties at 1 atm (Cengel & Ghajar, Table A-15), sparse rows from
// 0-800 degC, linearly interpolated. Columns: [T degC, k W/mK, nu m2/s,
// alpha m2/s, Pr].
const AIR_TABLE = [
  [0,   0.02364, 1.338e-5, 1.818e-5, 0.7362],
  [50,  0.02735, 1.798e-5, 2.487e-5, 0.7228],
  [100, 0.03095, 2.306e-5, 3.243e-5, 0.7111],
  [120, 0.03235, 2.522e-5, 3.565e-5, 0.7073],
  [140, 0.03374, 2.745e-5, 3.898e-5, 0.7041],
  [160, 0.03511, 2.975e-5, 4.241e-5, 0.7014],
  [180, 0.03646, 3.212e-5, 4.593e-5, 0.6992],
  [200, 0.03779, 3.455e-5, 4.954e-5, 0.6974],
  [250, 0.04104, 4.091e-5, 5.890e-5, 0.6946],
  [300, 0.04418, 4.765e-5, 6.871e-5, 0.6935],
  [350, 0.04721, 5.475e-5, 7.892e-5, 0.6937],
  [400, 0.05015, 6.219e-5, 8.951e-5, 0.6948],
  [450, 0.05298, 6.997e-5, 1.004e-4, 0.6965],
  [500, 0.05572, 7.806e-5, 1.117e-4, 0.6986],
  [600, 0.06093, 9.515e-5, 1.352e-4, 0.7037],
  [700, 0.06581, 1.133e-4, 1.598e-4, 0.7092],
  [800, 0.07037, 1.326e-4, 1.855e-4, 0.7149],
];

function airProps(T_C) {
  const t = Math.max(AIR_TABLE[0][0], Math.min(AIR_TABLE[AIR_TABLE.length - 1][0], T_C));
  let i = 0;
  while (i < AIR_TABLE.length - 2 && AIR_TABLE[i + 1][0] < t) i++;
  const [T0, k0, nu0, a0, Pr0] = AIR_TABLE[i];
  const [T1, k1, nu1, a1, Pr1] = AIR_TABLE[i + 1];
  const f = (T1 === T0) ? 0 : (t - T0) / (T1 - T0);
  const lerp = (v0, v1) => v0 + f * (v1 - v0);
  return { k: lerp(k0, k1), nu: lerp(nu0, nu1), alpha: lerp(a0, a1), Pr: lerp(Pr0, Pr1) };
}

// Natural convection off a horizontal cylinder, Churchill-Chu correlation
// (Cengel & Ghajar Eq. 9-25), valid for Ra_D <= 1e12:
//   Nu = {0.6 + 0.387 Ra_D^(1/6) / [1 + (0.559/Pr)^(9/16)]^(8/27)}^2
// The exhaust manifold is treated as a horizontal cylinder of effective
// diameter D -- a real manifold isn't a simple cylinder, so D is an
// engineering approximation, not a paper-reported dimension.
function naturalConvectionH(Ts_C, Tamb_C, D) {
  const Tf_C = (Ts_C + Tamb_C) / 2;
  const Tf_K = Tf_C + 273.15;
  const { k, nu, alpha, Pr } = airProps(Tf_C);
  const g = 9.81;
  const beta = 1 / Tf_K; // ideal-gas approximation
  const Ra_D = (g * beta * Math.abs(Ts_C - Tamb_C) * D ** 3) / (nu * alpha);
  const denom = (1 + (0.559 / Pr) ** (9 / 16)) ** (8 / 27);
  const Nu = (0.6 + (0.387 * Ra_D ** (1 / 6)) / denom) ** 2;
  const h = (Nu * k) / D;
  return { h, Nu, Ra_D, Pr, Tf_C };
}

// Linearized radiative heat-transfer coefficient at the given surface/ambient
// temperatures, same form used inside solveSteadyState()'s hRad.
function radiativeH(Ts_C, Tamb_C, eps = EPS) {
  const TsK = Ts_C + 273.15, TambK = Tamb_C + 273.15;
  return eps * SIGMA * (TsK + TambK) * (TsK ** 2 + TambK ** 2);
}

// Biot number check for the lumped-capacitance assumption the RK4 soak model
// makes (one uniform wall temperature). Cengel & Ghajar's criterion: the
// lumped approximation is considered acceptable when Bi = h*Lc/k < 0.1
// (ch. 4). Lc = L_metal here, treating the wall as insulated on the gas
// side and convecting/radiating from the outer face only, consistent with
// how dTdt() is defined above.
function biotNumber(h, Lc, k = K_METAL) {
  return (h * Lc) / k;
}

// Simple seeded PRNG (mulberry32) so Monte Carlo is reproducible across runs.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function monteCarlo({ N = 20000, seed = 42, Tgas, Tamb, hOut, h1, L_TBC, k_TBC }) {
  const rng = mulberry32(seed);
  const results = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const L = L_TBC * (1 + (rng() * 2 - 1) * 0.10);
    const k = k_TBC * (1 + (rng() * 2 - 1) * 0.10);
    results[i] = solveSteadyState({ Tgas, Tamb, hOut, h1, L_TBC: L, k_TBC: k, withTBC: true }).Ts;
  }
  return results;
}

window.HEFP = {
  solveSteadyState, rk4Soak, rk4SoakFinal, linearizedSoak, rk4ConvergenceSweep, monteCarlo,
  airProps, naturalConvectionH, radiativeH, biotNumber,
  C_EFF, RHO_METAL, CP_METAL, EPS, L_METAL, K_METAL,
};
