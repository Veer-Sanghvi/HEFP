import numpy as np

# ---- Base-case parameters from Table 2 (SemProj_HEFP) ----
T_gas = 650.0           # deg C, exhaust gas
h1 = 180.0               # W/m2K, gas side convection
k_TBC = 0.9              # W/mK, YSZ coating
L_TBC = 350e-6           # m, coating thickness
k_metal = 52.0           # W/mK, gray cast iron
L_metal = 6e-3           # m, wall thickness
T_amb_run = 80.0         # deg C, under hood air (running)
T_amb_soak = 45.0        # deg C, under hood air (soaked)
h2 = 35.0                # W/m2K, outer forced convection (running)
h_nat = 8.0              # W/m2K, outer natural convection (soaked)
eps = 0.85               # surface emissivity
sigma = 5.67e-8          # Stefan-Boltzmann, W/m2K4

# Effective thermal mass per unit area for the lumped post-shutdown soak
# model, NOT given directly in Table 2. Derived physically as rho*cp*L_metal
# for gray cast iron (rho=7870 kg/m3, cp=447 J/kgK, from the same Cengel &
# Ghajar property table that gives k_metal=52 W/mK above). Biot number
# (~0.0049) and Fourier number (~2464 over the 100-min soak) both confirm
# lumped capacitance across the full wall thickness is valid here.
RHO_METAL = 7870.0       # kg/m3, gray cast iron (Cengel & Ghajar table)
CP_METAL = 447.0         # J/kgK, gray cast iron (Cengel & Ghajar table)
C_EFF = RHO_METAL * CP_METAL * L_metal   # J/m2K, ~21107

def solve_steady_state(with_tbc=True, T_amb=T_amb_run, h_out=h2,
                        h1_val=h1, L_TBC_val=L_TBC, k_TBC_val=k_TBC,
                        tol=1e-8, max_iter=500):
    R_conv1 = 1.0/h1_val
    R_TBC = (L_TBC_val/k_TBC_val) if with_tbc else 0.0
    R_metal = L_metal/k_metal
    Ts = T_amb + 400.0
    for i in range(max_iter):
        TsK, TambK = Ts+273.15, T_amb+273.15
        h_rad = eps*sigma*(TsK+TambK)*(TsK**2+TambK**2)
        R_out = 1.0/(h_out+h_rad)
        R_total = R_conv1+R_TBC+R_metal+R_out
        q = (T_gas-T_amb)/R_total
        Ts_new = T_amb + q*R_out
        if abs(Ts_new-Ts) < tol:
            return Ts_new, q, i+1
        Ts = Ts_new
    return Ts, q, max_iter

def rk4_soak(T0, T_amb=T_amb_soak, h_out=h_nat, C_eff=C_EFF,
             dt=1.0, t_end=100*60):
    def dTdt(T):
        TK, TambK = T+273.15, T_amb+273.15
        return -(h_out*(T-T_amb)+eps*sigma*(TK**4-TambK**4))/C_eff
    n = int(t_end/dt)
    T, t = np.zeros(n+1), np.zeros(n+1)
    T[0] = T0
    for i in range(n):
        k1 = dTdt(T[i]); k2 = dTdt(T[i]+dt/2*k1)
        k3 = dTdt(T[i]+dt/2*k2); k4 = dTdt(T[i]+dt*k3)
        T[i+1] = T[i]+dt/6*(k1+2*k2+2*k3+k4)
        t[i+1] = t[i]+dt
    return t, T

def linearized_soak(T0, T_amb=T_amb_soak, h_out=h_nat, C_eff=C_EFF,
                     t_end=100*60):
    TK0, TambK = T0+273.15, T_amb+273.15
    h_rad0 = eps*sigma*(TK0+TambK)*(TK0**2+TambK**2)
    tau = C_eff/(h_out+h_rad0)
    t = np.linspace(0, t_end, int(t_end)+1)
    return t, T_amb+(T0-T_amb)*np.exp(-t/tau)

def rk4_convergence_sweep(dt_list=(512.0, 256.0, 128.0, 64.0, 32.0, 16.0, 8.0, 4.0, 2.0, 1.0),
                           t_check=2048.0, dt_ref=0.001953125, T0=None):
    """Full diagnostic grid-convergence sweep for rk4_soak across many halvings.

    Compares T(t_check) for each dt in dt_list against a reference solution
    at dt_ref (must be far finer than every dt in dt_list -- the defaults
    give a 500-1000x margin -- so the reference's own error can't
    contaminate the observed order). t_check is chosen mid-transient, not
    the fully-relaxed soak endpoint, where truncation error would be
    invisible. Every dt (including dt_ref) divides t_check exactly so each
    run lands on t_check without interpolation.

    Returns (dt_list, T_vals, errors, orders), where orders[i] is the
    observed order between dt_list[i] and dt_list[i+1]
    (log2(errors[i]/errors[i+1])).

    This is the full story behind rk4_convergence_check(): sweeping the
    defaults above shows three regimes, not one clean 4th-order slope.
    dt>=64s is pre-asymptotic (observed order ~5.5-7, since RK4's dt^5/dt^6
    truncation terms haven't yet been dominated by the dt^4 leading term).
    dt~32-16s is a crossover anomaly (order dips to ~1.6 as the dt^4 term
    and higher-order terms partially cancel). dt=16..2s is the genuine
    asymptotic 4th-order regime (order ~3.5-3.8). dt<=1s approaches
    floating-point noise (errors ~1e-11 to 1e-12 for T~100C in float64),
    so the order estimate degrades again. Only the dt=16..2s window is a
    trustworthy read of RK4's true asymptotic order; rk4_convergence_check
    uses exactly that window as its default.
    """
    if T0 is None:
        T0 = solve_steady_state(with_tbc=True)[0]
    _, T_ref = rk4_soak(T0, dt=dt_ref, t_end=t_check)
    T_ref_val = T_ref[-1]
    T_vals, errors = [], []
    for dt in dt_list:
        _, T = rk4_soak(T0, dt=dt, t_end=t_check)
        T_vals.append(T[-1])
        errors.append(abs(T[-1] - T_ref_val))
    orders = [np.log2(errors[i]/errors[i+1]) for i in range(len(errors)-1)]
    return list(dt_list), T_vals, errors, orders

def rk4_convergence_check(T0, t_check=2048.0, dt_list=(16.0, 8.0, 4.0, 2.0),
                           dt_ref=0.001953125):
    """Grid convergence check for rk4_soak, verifying 4th-order accuracy.

    Compares T(t_check) across successively halved dt against a fine
    reference solution (dt_ref). t_check is chosen mid-transient (not the
    fully-relaxed endpoint), where truncation error is actually visible.
    All dt values (including dt_ref) divide t_check exactly so every run
    lands on t_check without interpolation.

    dt_list=(16,8,4,2) is deliberately the *asymptotic* regime, not the
    coarsest steps available: at dt>=32s the observed order overshoots 4
    (pre-asymptotic, higher-order truncation terms not yet negligible) and
    at dt<=1s the error approaches floating-point noise (~1e-12), so both
    ends give a misleading order estimate. dt=16..2s is the clean window
    where RK4's true asymptotic 4th-order behavior is visible; see
    rk4_convergence_sweep() for the full 9-point picture this was chosen
    from.
    """
    _, _, errors, orders = rk4_convergence_sweep(dt_list=dt_list, t_check=t_check,
                                                   dt_ref=dt_ref, T0=T0)
    return list(dt_list), errors, orders

def monte_carlo(N=20000, seed=42):
    rng = np.random.default_rng(seed)
    L_samples = L_TBC*(1+rng.uniform(-0.10, 0.10, N))
    k_samples = k_TBC*(1+rng.uniform(-0.10, 0.10, N))
    results = np.empty(N)
    for i, (L, k) in enumerate(zip(L_samples, k_samples)):
        results[i], _, _ = solve_steady_state(with_tbc=True, L_TBC_val=L, k_TBC_val=k)
    return results
