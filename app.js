// HEFP dashboard: wiring, SVG charts, UI state, and the 3D manifold scene.
"use strict";
import { createManifoldScene } from "./scene.js";

const NS = "http://www.w3.org/2000/svg";
const HAZ_LOW = 311, HAZ_HIGH = 450; // paper's autoignition band, deg C
const fmt = (v, d = 1) => Number(v).toFixed(d);
const $ = (id) => document.getElementById(id);
const scene3d = createManifoldScene($("canvas-host-3d"));
let lastRk4 = null;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function clearSvg(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }

// ---------- generic cartesian frame ----------
function frame(svg, { x0, y0, w, h, xDomain, yDomain, xTicks = 5, yTicks = 5, xFmt = (v) => v, yFmt = (v) => v, xLabel, yLabel }) {
  const xs = (v) => x0 + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * w;
  const ys = (v) => y0 + h - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * h;

  if (yTicks > 0) for (let i = 0; i <= yTicks; i++) {
    const v = yDomain[0] + (i / yTicks) * (yDomain[1] - yDomain[0]);
    const y = ys(v);
    svg.appendChild(svgEl("line", { x1: x0, x2: x0 + w, y1: y, y2: y, class: "grid-line" }));
    const t = svgEl("text", { x: x0 - 8, y: y + 3, "text-anchor": "end", class: "axis-label" });
    t.textContent = yFmt(v);
    svg.appendChild(t);
  }
  if (xTicks > 0) for (let i = 0; i <= xTicks; i++) {
    const v = xDomain[0] + (i / xTicks) * (xDomain[1] - xDomain[0]);
    const x = xs(v);
    const t = svgEl("text", { x, y: y0 + h + 18, "text-anchor": "middle", class: "axis-label" });
    t.textContent = xFmt(v);
    svg.appendChild(t);
  }
  svg.appendChild(svgEl("line", { x1: x0, x2: x0 + w, y1: y0 + h, y2: y0 + h, class: "baseline" }));

  if (xLabel) {
    const t = svgEl("text", { x: x0 + w / 2, y: y0 + h + 38, "text-anchor": "middle", class: "axis-label" });
    t.textContent = xLabel; svg.appendChild(t);
  }
  if (yLabel) {
    const t = svgEl("text", { x: 14, y: y0 + h / 2, "text-anchor": "middle", class: "axis-label", transform: `rotate(-90 14 ${y0 + h / 2})` });
    t.textContent = yLabel; svg.appendChild(t);
  }
  return { xs, ys };
}

function pathFrom(pts, xs, ys) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p[0]).toFixed(2)} ${ys(p[1]).toFixed(2)}`).join(" ");
}

// ---------- current input state ----------
function readSteadyInputs() {
  return {
    Tgas: +$("Tgas").value,
    h1: +$("h1").value,
    L_TBC: +$("Ltbc").value * 1e-6,
    k_TBC: +$("ktbc").value,
    Tamb: +$("Tamb").value,
    hOut: +$("h2").value,
    eps: +$("eps").value,
    L_metal: +$("Lmetal").value * 1e-3,
  };
}

// The soak model shares the same physical wall (emissivity, thickness) as the
// steady-state solver above, so its Ceff and eps follow those same sliders.
function currentCeff() {
  return HEFP.RHO_METAL * HEFP.CP_METAL * (+$("Lmetal").value * 1e-3);
}
function currentEps() {
  return +$("eps").value;
}

function readSoakInputs() {
  return {
    Tamb: +$("Tsoak").value,
    hOut: +$("hnat").value,
    T0: +$("T0override").value,
  };
}

let lastTbcSteady = 477.5;
let heroAnimated = false; // true after the first paint; only the very first render draws in

// ================= Section 1: steady state =================
function renderSteady() {
  const inp = readSteadyInputs();
  $("v-Tgas").textContent = `${inp.Tgas} °C`;
  $("v-h1").textContent = `${inp.h1} W/m²K`;
  $("v-Ltbc").textContent = `${(inp.L_TBC * 1e6).toFixed(0)} μm`;
  $("v-ktbc").textContent = `${inp.k_TBC.toFixed(2)} W/mK`;
  $("v-Tamb").textContent = `${inp.Tamb} °C`;
  $("v-h2").textContent = `${inp.hOut} W/m²K`;
  $("v-eps").textContent = `${inp.eps.toFixed(2)}`;
  $("v-Lmetal").textContent = `${(inp.L_metal * 1e3).toFixed(1)} mm`;

  const bare = HEFP.solveSteadyState({ ...inp, withTBC: false });
  const tbc = HEFP.solveSteadyState({ ...inp, withTBC: true });
  lastTbcSteady = tbc.Ts;

  $("stat-bare").innerHTML = `${fmt(bare.Ts, 2)}<span class="unit">°C</span>`;
  $("stat-tbc").innerHTML = `${fmt(tbc.Ts, 2)}<span class="unit">°C</span>`;
  $("stat-drop").innerHTML = `${fmt(bare.Ts - tbc.Ts, 2)}<span class="unit">°C</span>`;
  if (!window.__soakPlaying) { scene3d.setTemps({ Tgas: inp.Tgas, Ts: tbc.Ts, eps: inp.eps }); scene3d.setEngineRunning(true); }

  const flag = (val, elId) => {
    const el = $(elId);
    if (val > HAZ_HIGH) el.innerHTML = `<span class="hazard-flag danger">above 450 °C, outside the studied band</span>`;
    else if (val >= HAZ_LOW) el.innerHTML = `<span class="hazard-flag danger">inside 311–450 °C autoignition band</span>`;
    else el.innerHTML = `<span class="hazard-flag safe">below 311 °C, safe</span>`;
  };
  flag(bare.Ts, "stat-bare-sub");
  flag(tbc.Ts, "stat-tbc-sub");

  // chart: horizontal comparison against hazard band
  const svg = $("chart-steady");
  clearSvg(svg);
  const x0 = 60, y0 = 14, w = 640, h = 130;
  const lo = 0, hi = Math.max(550, bare.Ts + 40, tbc.Ts + 40);
  const { xs } = frame(svg, { x0, y0, w, h, xDomain: [lo, hi], yDomain: [0, 1], xTicks: 6, yTicks: 0, xFmt: (v) => v.toFixed(0) + "°" });

  // hazard band
  svg.appendChild(svgEl("rect", { x: xs(HAZ_LOW), y: y0, width: xs(HAZ_HIGH) - xs(HAZ_LOW), height: h, fill: "var(--critical-tint)" }));
  const bandLbl = svgEl("text", { x: (xs(HAZ_LOW) + xs(HAZ_HIGH)) / 2, y: y0 - 4, "text-anchor": "middle", class: "axis-label", fill: "var(--critical)" });
  bandLbl.textContent = "autoignition band 311–450°C";
  svg.appendChild(bandLbl);

  const barH = 30;
  const bareW = xs(bare.Ts) - x0, tbcW = xs(tbc.Ts) - x0;
  // bare bar
  const bareBar = svgEl("rect", { x: x0, y: y0 + 24, width: heroAnimated ? bareW : 0, height: barH, fill: "var(--cool)", rx: 2 });
  svg.appendChild(bareBar);
  const lbl1 = svgEl("text", { x: Math.min(xs(bare.Ts) + 8, x0 + w - 4), y: y0 + 24 + barH / 2 + 4, class: "axis-label", fill: "var(--ink-2)" });
  lbl1.textContent = `bare  ${fmt(bare.Ts, 1)}°C`;
  svg.appendChild(lbl1);
  // tbc bar
  const tbcBar = svgEl("rect", { x: x0, y: y0 + 24 + barH + 16, width: heroAnimated ? tbcW : 0, height: barH, fill: "var(--heat)", rx: 2 });
  svg.appendChild(tbcBar);
  const lbl2 = svgEl("text", { x: Math.min(xs(tbc.Ts) + 8, x0 + w - 4), y: y0 + 24 + barH + 16 + barH / 2 + 4, class: "axis-label", fill: "var(--ink-2)" });
  lbl2.textContent = `TBC  ${fmt(tbc.Ts, 1)}°C`;
  svg.appendChild(lbl2);
  if (!heroAnimated) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bareBar.style.transition = "width 1.1s cubic-bezier(0.16,1,0.3,1)";
      tbcBar.style.transition = "width 1.1s cubic-bezier(0.16,1,0.3,1) 0.12s";
      bareBar.setAttribute("width", bareW);
      tbcBar.setAttribute("width", tbcW);
    }));
  }

  // keep soak T0 slider following steady-state unless user has dragged it manually
  if (!window.__t0Touched) {
    $("T0override").value = tbc.Ts.toFixed(1);
    $("v-T0").textContent = `${fmt(tbc.Ts, 1)} °C (steady-state)`;
  }
  renderSoak();
}

// ---- Beyond the paper: physics-derived h_nat + Biot lumped-capacitance check ----
function renderHnatPhysics() {
  const soakInp = readSoakInputs();
  const D = +$("Dnat").value * 1e-3; // mm -> m
  $("v-Dnat").textContent = `${$("Dnat").value} mm`;
  const est = HEFP.naturalConvectionH(soakInp.T0, soakInp.Tamb, D);
  $("hnat-physics").innerHTML = `Physics estimate: <strong>${fmt(est.h, 1)} W/m²K</strong> (Nu = ${fmt(est.Nu, 1)}, Ra<sub>D</sub> = ${est.Ra_D.toExponential(2)}, film temp ${fmt(est.Tf_C, 0)} °C) via the Churchill&ndash;Chu horizontal-cylinder correlation, evaluated at the current starting temp and soak ambient.`;
}

function renderBiot() {
  const soakInp = readSoakInputs();
  const eps = currentEps();
  const Lc = +$("Lmetal").value * 1e-3;
  const hRad = HEFP.radiativeH(soakInp.T0, soakInp.Tamb, eps);
  const hTotal = soakInp.hOut + hRad;
  const Bi = HEFP.biotNumber(hTotal, Lc, HEFP.K_METAL);
  const valid = Bi < 0.1;
  $("biot-summary").innerHTML = `Bi = ${Bi.toFixed(4)} at the start of the soak (h<sub>total</sub> = ${fmt(hTotal, 1)} W/m²K = ${fmt(soakInp.hOut, 1)} convective + ${fmt(hRad, 1)} radiative, L<sub>c</sub> = ${(Lc * 1e3).toFixed(1)} mm, k = ${HEFP.K_METAL} W/mK). ` +
    (valid
      ? `<span style="color:var(--good)">Well under the 0.1 threshold</span>. Treating the wall as one uniform temperature is a safe simplification for this geometry and wall thickness.`
      : `<span style="color:var(--critical)">Above the 0.1 threshold</span>. The wall likely has a measurable internal temperature gradient the RK4 model's single-lump temperature can't capture; a true fix would need 1-D transient conduction, not a bigger lump.`);
}

// ================= Section 2: soak decay =================
function renderSoak() {
  const soakInp = readSoakInputs();
  $("v-Tsoak").textContent = `${soakInp.Tamb} °C`;
  $("v-hnat").textContent = `${soakInp.hOut.toFixed(1)} W/m²K`;
  if (window.__t0Touched) $("v-T0").textContent = `${fmt(soakInp.T0, 1)} °C`;

  const T0 = soakInp.T0;
  const Ceff = currentCeff(), eps = currentEps();
  const rk4 = HEFP.rk4Soak(T0, { Tamb: soakInp.Tamb, hOut: soakInp.hOut, Ceff, eps, dt: 1.0, tEnd: 100 * 60, sampleEvery: 15 });
  const lin = HEFP.linearizedSoak(T0, { Tamb: soakInp.Tamb, hOut: soakInp.hOut, Ceff, eps, tEnd: 100 * 60, sampleEvery: 15 });
  lastRk4 = rk4;

  // find crossing times (minutes)
  function crossTime(t, T, threshold) {
    for (let i = 1; i < T.length; i++) {
      if (T[i - 1] >= threshold && T[i] < threshold) {
        const frac = (T[i - 1] - threshold) / (T[i - 1] - T[i]);
        return (t[i - 1] + frac * (t[i] - t[i - 1])) / 60;
      }
    }
    return T[0] < threshold ? 0 : null;
  }
  const t450 = crossTime(rk4.t, rk4.T, HAZ_HIGH);
  const t311 = crossTime(rk4.t, rk4.T, HAZ_LOW);
  $("stat-t450").innerHTML = t450 === null ? `never<span class="unit"></span>` : `${fmt(t450, 1)}<span class="unit">min</span>`;
  $("stat-t311").innerHTML = t311 === null ? `never<span class="unit"></span>` : `${fmt(t311, 1)}<span class="unit">min</span>`;
  if (t450 !== null && t311 !== null) {
    $("stat-window").innerHTML = `${fmt(t311 - t450, 1)}<span class="unit">min</span>`;
  } else {
    $("stat-window").innerHTML = `—`;
  }

  const svg = $("chart-soak");
  clearSvg(svg);
  const x0 = 56, y0 = 14, w = 640, h = 230;
  const tMaxMin = 100;
  const yLo = Math.min(soakInp.Tamb - 5, 20);
  const yHi = Math.max(T0 + 20, HAZ_HIGH + 20);
  const { xs, ys } = frame(svg, {
    x0, y0, w, h, xDomain: [0, tMaxMin], yDomain: [yLo, yHi],
    xTicks: 5, yTicks: 5, xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0) + "°",
    xLabel: "minutes since shutdown", yLabel: "surface temp (°C)",
  });

  // hazard band
  if (yHi > HAZ_LOW) {
    const bandTop = Math.min(HAZ_HIGH, yHi);
    svg.appendChild(svgEl("rect", {
      x: x0, y: ys(bandTop), width: w, height: ys(HAZ_LOW) - ys(bandTop),
      fill: "var(--critical-tint)",
    }));
  }
  [HAZ_LOW, HAZ_HIGH].forEach((v) => {
    if (v >= yLo && v <= yHi) {
      svg.appendChild(svgEl("line", { x1: x0, x2: x0 + w, y1: ys(v), y2: ys(v), stroke: "var(--critical)", "stroke-width": 1, "stroke-dasharray": "2,3", opacity: 0.6 }));
      const t = svgEl("text", { x: x0 + w - 4, y: ys(v) - 4, "text-anchor": "end", class: "axis-label", fill: "var(--critical)" });
      t.textContent = `${v}°C`;
      svg.appendChild(t);
    }
  });

  const rk4Pts = rk4.t.map((tt, i) => [tt / 60, rk4.T[i]]);
  const linPts = lin.t.map((tt, i) => [tt / 60, lin.T[i]]);
  svg.appendChild(svgEl("path", { d: pathFrom(linPts, xs, ys), fill: "none", stroke: "var(--cool)", "stroke-width": 2, "stroke-dasharray": "5,5" }));
  const rk4Path = svgEl("path", { d: pathFrom(rk4Pts, xs, ys), fill: "none", stroke: "var(--heat)", "stroke-width": 2.25, "stroke-linecap": "round" });
  svg.appendChild(rk4Path);
  if (!heroAnimated) {
    const len = rk4Path.getTotalLength();
    rk4Path.style.strokeDasharray = `${len}`;
    rk4Path.style.strokeDashoffset = `${len}`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      rk4Path.style.transition = "stroke-dashoffset 1.6s cubic-bezier(0.16,1,0.3,1) 0.3s";
      rk4Path.style.strokeDashoffset = "0";
    }));
  }

  renderHnatPhysics();
  renderBiot();
}

$("T0override").addEventListener("input", () => { window.__t0Touched = true; renderSoak(); });
$("Dnat").addEventListener("input", renderHnatPhysics);
$("use-hnat-physics").addEventListener("click", () => {
  const soakInp = readSoakInputs();
  const D = +$("Dnat").value * 1e-3;
  const est = HEFP.naturalConvectionH(soakInp.T0, soakInp.Tamb, D);
  const hnatEl = $("hnat");
  if (est.h > +hnatEl.max) hnatEl.max = Math.ceil(est.h);
  hnatEl.value = est.h.toFixed(1);
  renderSoak();
});

// ================= Section 3a: h1 sensitivity =================
function renderH1Sensitivity() {
  const base = readSteadyInputs();
  const h1s = [];
  for (let h = 40; h <= 400; h += 10) h1s.push(h);
  const pts = h1s.map((h) => [h, HEFP.solveSteadyState({ ...base, h1: h, withTBC: true }).Ts]);

  const svg = $("chart-h1");
  clearSvg(svg);
  const x0 = 56, y0 = 14, w = 380, h2 = 190;
  const yVals = pts.map((p) => p[1]);
  const { xs, ys } = frame(svg, {
    x0, y0, w, h: h2,
    xDomain: [40, 400], yDomain: [Math.min(...yVals) - 15, Math.max(...yVals) + 15],
    xTicks: 4, yTicks: 4, xFmt: (v) => v.toFixed(0), yFmt: (v) => v.toFixed(0) + "°",
    xLabel: "h₁ (W/m²K)", yLabel: "Ts (°C)",
  });
  svg.appendChild(svgEl("path", { d: pathFrom(pts, xs, ys), fill: "none", stroke: "var(--heat)", "stroke-width": 2.25, "stroke-linecap": "round" }));
  // current h1 marker
  const curH1 = base.h1;
  const curTs = HEFP.solveSteadyState({ ...base, h1: curH1, withTBC: true }).Ts;
  svg.appendChild(svgEl("circle", { cx: xs(curH1), cy: ys(curTs), r: 4.5, fill: "var(--surface)", stroke: "var(--heat)", "stroke-width": 2.5 }));
}

// ================= Section 3b: Monte Carlo =================
function renderMC() {
  const base = readSteadyInputs();
  const btn = $("run-mc");
  btn.disabled = true;
  btn.textContent = "Running 20,000 samples…";
  setTimeout(() => {
    const results = HEFP.monteCarlo({ N: 20000, seed: Math.floor(Math.random() * 2 ** 31), ...base });
    let min = Infinity, max = -Infinity, sum = 0;
    for (const v of results) { if (v < min) min = v; if (v > max) max = v; sum += v; }
    const mean = sum / results.length;
    let variance = 0;
    for (const v of results) variance += (v - mean) ** 2;
    const std = Math.sqrt(variance / results.length);
    const belowBand = Array.from(results).filter((v) => v < HAZ_LOW).length;

    $("mc-summary").innerHTML = `Mean <strong>${fmt(mean, 2)}°C</strong>, spread (σ) <strong>${fmt(std, 3)}°C</strong>, range [${fmt(min, 2)}, ${fmt(max, 2)}]. ` +
      (belowBand === 0
        ? `<span style="color:var(--good)">0 of 20,000 samples dropped below 311°C</span> . Manufacturing tolerance alone does not make this surface safe.`
        : `<span style="color:var(--critical)">${belowBand} of 20,000 samples dropped below 311°C.</span>`);

    // histogram
    const bins = 28;
    const lo = mean - 5 * Math.max(std, 0.05), hi = mean + 5 * Math.max(std, 0.05);
    const counts = new Array(bins).fill(0);
    for (const v of results) {
      let idx = Math.floor(((v - lo) / (hi - lo)) * bins);
      idx = Math.max(0, Math.min(bins - 1, idx));
      counts[idx]++;
    }
    const svg = $("chart-mc");
    clearSvg(svg);
    const x0 = 50, y0 = 10, w = 390, h = 150;
    const maxCount = Math.max(...counts);
    const { xs, ys } = frame(svg, {
      x0, y0, w, h, xDomain: [lo, hi], yDomain: [0, maxCount * 1.1],
      xTicks: 4, yTicks: 0, xFmt: (v) => v.toFixed(1) + "°",
    });
    const barW = w / bins;
    counts.forEach((c, i) => {
      const bx = x0 + i * barW;
      const bh = (c / (maxCount * 1.1)) * h;
      svg.appendChild(svgEl("rect", { x: bx + 0.5, y: y0 + h - bh, width: Math.max(barW - 1.5, 1), height: bh, fill: "var(--heat)", opacity: 0.85 }));
    });
    [HAZ_LOW].forEach((v) => {
      if (v >= lo && v <= hi) {
        svg.appendChild(svgEl("line", { x1: xs(v), x2: xs(v), y1: y0, y2: y0 + h, stroke: "var(--critical)", "stroke-width": 1.5, "stroke-dasharray": "3,3" }));
      }
    });

    btn.disabled = false;
    btn.textContent = "Re-run 20,000 samples";
  }, 20);
}

// ================= Section 4: RK4 convergence =================
function renderConvergence() {
  const base = readSteadyInputs();
  const tbcSteady = HEFP.solveSteadyState({ ...base, withTBC: true }).Ts;
  const dtList = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1];
  const sweep = HEFP.rk4ConvergenceSweep({
    dtList, tCheck: 2048, dtRef: 0.001953125,
    T0: tbcSteady, Tamb: +$("Tsoak").value, hOut: +$("hnat").value,
    Ceff: currentCeff(), eps: currentEps(),
  });

  const svg = $("chart-conv");
  clearSvg(svg);
  const x0 = 64, y0 = 14, w = 620, h = 210;
  const logDt = dtList.map((d) => Math.log10(d));
  const logErr = sweep.errors.map((e) => Math.log10(Math.max(e, 1e-13)));
  const pts = logDt.map((x, i) => [x, logErr[i]]);
  const { xs, ys } = frame(svg, {
    x0, y0, w, h,
    xDomain: [Math.min(...logDt) - 0.2, Math.max(...logDt) + 0.2],
    yDomain: [Math.min(...logErr) - 0.5, Math.max(...logErr) + 0.5],
    xTicks: 5, yTicks: 5,
    xFmt: (v) => `10^${v.toFixed(1)}`, yFmt: (v) => `10^${v.toFixed(0)}`,
    xLabel: "step size dt (s), log scale", yLabel: "|error| °C, log scale",
  });

  // highlight the genuine asymptotic window dt=16..2s
  const windowDts = [16, 8, 4, 2];
  const wIdx = windowDts.map((d) => dtList.indexOf(d));
  const bx0 = xs(Math.log10(16)) , bx1 = xs(Math.log10(2));
  svg.appendChild(svgEl("rect", { x: Math.min(bx0,bx1)-6, y: y0, width: Math.abs(bx1-bx0)+12, height: h, fill: "rgba(12,163,12,0.06)" }));
  const bandLbl = svgEl("text", { x: (bx0+bx1)/2, y: y0 - 2, "text-anchor": "middle", class: "axis-label", fill: "var(--good)" });
  bandLbl.textContent = "genuine 4th-order window";
  svg.appendChild(bandLbl);

  svg.appendChild(svgEl("path", { d: pathFrom(pts, xs, ys), fill: "none", stroke: "var(--heat)", "stroke-width": 2, "stroke-linecap": "round" }));
  pts.forEach(([x, y], i) => {
    const inWindow = wIdx.includes(i);
    svg.appendChild(svgEl("circle", { cx: xs(x), cy: ys(y), r: inWindow ? 4.5 : 3.5, fill: inWindow ? "var(--good)" : "var(--heat)" }));
  });

  const tbody = document.querySelector("#conv-table tbody");
  tbody.innerHTML = "";
  dtList.forEach((dt, i) => {
    const tr = document.createElement("tr");
    const order = i < sweep.orders.length ? sweep.orders[i].toFixed(2) : "—";
    const inWindow = windowDts.includes(dt) && i < sweep.orders.length && windowDts.includes(dtList[i+1]);
    tr.innerHTML = `<td>${dt}</td><td>${sweep.Tvals[i].toFixed(6)}</td><td>${sweep.errors[i].toExponential(3)}</td><td class="${inWindow ? "order-band" : ""}">${order}</td>`;
    tbody.appendChild(tr);
  });
}

// ================= wiring =================
["Tgas", "h1", "Ltbc", "ktbc", "Tamb", "h2", "eps", "Lmetal"].forEach((id) => $(id).addEventListener("input", renderSteady));
["Tsoak", "hnat"].forEach((id) => $(id).addEventListener("input", renderSoak));

$("reset-steady").addEventListener("click", () => {
  $("Tgas").value = 650; $("h1").value = 180; $("Ltbc").value = 350; $("ktbc").value = 0.9;
  $("Tamb").value = 80; $("h2").value = 35; $("eps").value = 0.85; $("Lmetal").value = 6;
  renderSteady();
});
$("reset-soak").addEventListener("click", () => {
  $("Tsoak").value = 45; $("hnat").value = 8; $("hnat").max = 25; $("Dnat").value = 80; window.__t0Touched = false;
  renderSteady();
});
$("run-mc").addEventListener("click", renderMC);

renderSteady();
renderH1Sensitivity();
renderConvergence();
heroAnimated = true; // first paint is done drawing in; every render after this is instant
["Tgas", "h1", "Ltbc", "ktbc", "Tamb", "h2", "eps", "Lmetal"].forEach((id) => $(id).addEventListener("input", () => { renderH1Sensitivity(); renderConvergence(); }));
["Tsoak", "hnat"].forEach((id) => $(id).addEventListener("input", renderConvergence));

// ---------------- 3D soak playback ----------------
let soakPlayToken = 0;
$("play-soak-3d").addEventListener("click", () => {
  if (!lastRk4) return;
  const myToken = ++soakPlayToken;
  window.__soakPlaying = true;
  scene3d.setEngineRunning(false); // forced convection stops at shutdown; no more firing or exhaust flow
  $("play-soak-3d").disabled = true;
  $("play-soak-3d").innerHTML = "Playing…";

  const traj = lastRk4;
  const soakEps = +$("eps").value;
  const realDurationMs = 5000; // compress the 100-minute soak into 5 real seconds
  const eventDurationSec = traj.t[traj.t.length - 1];
  const startTime = performance.now();

  function frame(now) {
    if (myToken !== soakPlayToken) return;
    const progress = Math.min(1, (now - startTime) / realDurationMs);
    const simTimeSec = progress * eventDurationSec;
    let idx = Math.floor((simTimeSec / eventDurationSec) * (traj.t.length - 1));
    idx = Math.max(0, Math.min(traj.t.length - 2, idx));
    const t0 = traj.t[idx], t1 = traj.t[idx + 1];
    const frac = t1 > t0 ? (simTimeSec - t0) / (t1 - t0) : 0;
    const T = traj.T[idx] + (traj.T[idx + 1] - traj.T[idx]) * frac;
    scene3d.setTemps({ Tgas: T, Ts: T, eps: soakEps }); // post-shutdown: roughly uniform cooling, but radiation (rays) continues

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      window.__soakPlaying = false;
      $("play-soak-3d").disabled = false;
      $("play-soak-3d").innerHTML = "&#9654; Replay soak decay";
      renderSteady(); // restore the 3D view to the current steady-state values
    }
  }
  requestAnimationFrame(frame);
});
