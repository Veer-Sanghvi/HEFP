cd('/Users/veer/Desktop/simscape_thermal_model');

% Python reference (thermal_model.py solve_steady_state()), for comparison only.
% NOT used to adjust or round the Simscape outputs below.
PY_BARE_C = 484.14;
PY_TBC_C  = 477.50;
MISMATCH_TOL_C = 0.5;  % flag threshold for "meaningfully different"

fprintf('Running Simscape steady-state model: bare wall (with_tbc=false)...\n');
Ts_bare_C = build_and_run_steady(false);

fprintf('Running Simscape steady-state model: TBC-coated wall (with_tbc=true)...\n');
Ts_tbc_C = build_and_run_steady(true);

diff_C = Ts_bare_C - Ts_tbc_C;

fprintf('\n==================== RESULTS ====================\n');
fprintf('Bare wall steady-state Ts  = %.6f C\n', Ts_bare_C);
fprintf('TBC wall steady-state Ts   = %.6f C\n', Ts_tbc_C);
fprintf('Difference (bare - tbc)    = %.6f C\n', diff_C);
fprintf('===================================================\n\n');

fprintf('Comparison against Python thermal_model.py solve_steady_state():\n');
fprintf('  bare: Simscape=%.6f C  Python=%.6f C  |diff|=%.6f C\n', ...
    Ts_bare_C, PY_BARE_C, abs(Ts_bare_C - PY_BARE_C));
fprintf('  tbc:  Simscape=%.6f C  Python=%.6f C  |diff|=%.6f C\n', ...
    Ts_tbc_C, PY_TBC_C, abs(Ts_tbc_C - PY_TBC_C));

mismatch = false;
if abs(Ts_bare_C - PY_BARE_C) > MISMATCH_TOL_C
    fprintf('*** WARNING: bare-wall Simscape result differs from Python by more than %.2f C ***\n', MISMATCH_TOL_C);
    mismatch = true;
end
if abs(Ts_tbc_C - PY_TBC_C) > MISMATCH_TOL_C
    fprintf('*** WARNING: TBC Simscape result differs from Python by more than %.2f C ***\n', MISMATCH_TOL_C);
    mismatch = true;
end
if ~mismatch
    fprintf('No meaningful discrepancy (both within %.2f C of the Python results).\n', MISMATCH_TOL_C);
end
fprintf('\n');

% Write CSV -- unrounded actual sim outputs, not the paper's numbers.
fid = fopen('steady_state_results.csv', 'w');
fprintf(fid, 'case,Ts_C\n');
fprintf(fid, 'bare,%.6f\n', Ts_bare_C);
fprintf(fid, 'tbc,%.6f\n', Ts_tbc_C);
fclose(fid);
fprintf('Wrote steady_state_results.csv\n');
