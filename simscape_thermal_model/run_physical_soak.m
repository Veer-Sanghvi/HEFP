cd('/Users/veer/Desktop/simscape_thermal_model');
[t, TC] = build_and_run_soak(21107.3, 'physical');
writematrix([t, TC], 'soak_physical_results.csv');
fprintf('DONE: final T = %.4f C at t=%.1f s, n=%d points\n', TC(end), t(end), numel(t));
[~,idx] = min(abs(t-34.0));
fprintf('T at t=34.0s (450C crossing check): %.4f C\n', TC(idx));
[~,idx2] = min(abs(t-310.0));
fprintf('T at t=310.0s (311C crossing check): %.4f C\n', TC(idx2));
