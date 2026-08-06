cd('/Users/veer/Desktop/simscape_thermal_model');

h1_vals = [80.0, 120.0, 160.0, 200.0, 240.0, 280.0, 320.0];
n = numel(h1_vals);
Ts_vals = zeros(1, n);

fprintf('Running Simscape steady-state (TBC-coated) model across h1 sweep...\n\n');
for i = 1:n
    fprintf('  h1 = %6.1f W/m2K ... ', h1_vals(i));
    Ts_vals(i) = build_and_run_steady(true, h1_vals(i));
    fprintf('Ts = %.6f C\n', Ts_vals(i));
end

fprintf('\n==================== RESULTS ====================\n');
for i = 1:n
    fprintf('  h1=%6.1f  Ts=%.6f C\n', h1_vals(i), Ts_vals(i));
end
fprintf('===================================================\n\n');

fid = fopen('h1_sensitivity_results.csv', 'w');
fprintf(fid, 'h1_W_m2K,Ts_C\n');
for i = 1:n
    fprintf(fid, '%.1f,%.6f\n', h1_vals(i), Ts_vals(i));
end
fclose(fid);
fprintf('Wrote h1_sensitivity_results.csv\n');
