// HEFP thermal model: direct JS port of thermal_model.py.
// Every number on the page is computed here, in the browser, not precomputed.
"use strict";

const SIGMA = 5.67e-8;   // Stefan-Boltzmann, W/m2K4
const EPS = 0.85;        // surface emissivity
const L_METAL = 6e-3;    // m, wall thickness
const K_METAL = 52.0;    // W/mK, gray cast iron
const RHO_METAL = 7870.0, CP_METAL = 447.0;
const C_EFF = RHO_METAL * CP_METAL * L_METAL; // ~21107 J/m2K

function solveSteadyState({ Tgas, Tamb, hOut, h1, L_TBC, k_TBC, withTBC, tol = 1e-8, maxIter = 500 }) {
  const R_conv1 = 1.0 / h1;
  const R_TBC = withTBC ? (L_TBC / k_TBC) : 0.0;
  const R_metal = L_METAL / K_METAL;
  let Ts = Tamb + 400.0;
  let q = 0, iters = 0;
  for (let i = 0; i < maxIter; i++) {
    const TsK = Ts + 273.15, TambK = Tamb + 273.15;
    const hRad = EPS * SIGMA * (TsK + TambK) * (TsK ** 2 + TambK ** 2);
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

function dTdt(T, Tamb, hOut, Ceff) {
  const TK = T + 273.15, TambK = Tamb + 273.15;
  return -(hOut * (T - Tamb) + EPS * SIGMA * (TK ** 4 - TambK ** 4)) / Ceff;
}

// RK4 integration of the soak, sampled every `sampleEvery` seconds for plotting.
function rk4Soak(T0, { Tamb, hOut, Ceff = C_EFF, dt = 1.0, tEnd = 100 * 60, sampleEvery = 1 }) {
  const n = Math.round(tEnd / dt);
  const t = [0], T = [T0];
  let Tc = T0, tc = 0;
  const everyN = Math.max(1, Math.round(sampleEvery / dt));
  for (let i = 0; i < n; i++) {
    const k1 = dTdt(Tc, Tamb, hOut, Ceff);
    const k2 = dTdt(Tc + dt / 2 * k1, Tamb, hOut, Ceff);
    const k3 = dTdt(Tc + dt / 2 * k2, Tamb, hOut, Ceff);
    const k4 = dTdt(Tc + dt * k3, Tamb, hOut, Ceff);
    Tc = Tc + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    tc = tc + dt;
    if ((i + 1) % everyN === 0 || i === n - 1) { t.push(tc); T.push(Tc); }
  }
  return { t, T };
}

// RK4 integration returning only the final value at tEnd (for convergence sweeps, no sampling overhead).
function rk4SoakFinal(T0, { Tamb, hOut, Ceff = C_EFF, dt, tEnd }) {
  const n = Math.round(tEnd / dt);
  let Tc = T0;
  for (let i = 0; i < n; i++) {
    const k1 = dTdt(Tc, Tamb, hOut, Ceff);
    const k2 = dTdt(Tc + dt / 2 * k1, Tamb, hOut, Ceff);
    const k3 = dTdt(Tc + dt / 2 * k2, Tamb, hOut, Ceff);
    const k4 = dTdt(Tc + dt * k3, Tamb, hOut, Ceff);
    Tc = Tc + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return Tc;
}

function linearizedSoak(T0, { Tamb, hOut, Ceff = C_EFF, tEnd = 100 * 60, sampleEvery = 10 }) {
  const TK0 = T0 + 273.15, TambK = Tamb + 273.15;
  const hRad0 = EPS * SIGMA * (TK0 + TambK) * (TK0 ** 2 + TambK ** 2);
  const tau = Ceff / (hOut + hRad0);
  const t = [], T = [];
  for (let tc = 0; tc <= tEnd; tc += sampleEvery) {
    t.push(tc);
    T.push(Tamb + (T0 - Tamb) * Math.exp(-tc / tau));
  }
  return { t, T };
}

function rk4ConvergenceSweep({ dtList, tCheck = 2048.0, dtRef = 0.001953125, T0, Tamb, hOut }) {
  const Tref = rk4SoakFinal(T0, { Tamb, hOut, dt: dtRef, tEnd: tCheck });
  const Tvals = [], errors = [];
  for (const dt of dtList) {
    const Tv = rk4SoakFinal(T0, { Tamb, hOut, dt, tEnd: tCheck });
    Tvals.push(Tv);
    errors.push(Math.abs(Tv - Tref));
  }
  const orders = [];
  for (let i = 0; i < errors.length - 1; i++) {
    orders.push(Math.log2(errors[i] / errors[i + 1]));
  }
  return { dtList, Tvals, errors, orders, Tref };
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

window.HEFP = { solveSteadyState, rk4Soak, rk4SoakFinal, linearizedSoak, rk4ConvergenceSweep, monteCarlo, C_EFF };
