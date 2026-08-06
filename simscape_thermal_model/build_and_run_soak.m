function [t, TC] = build_and_run_soak(C_eff, modelSuffix)
load_system('fl_lib');
load_system('nesl_utility');

modelName = ['manifold_soak_' modelSuffix];
if bdIsLoaded(modelName)
    close_system(modelName, 0);
end
new_system(modelName);

T0_C        = 477.50;   % initial wall temp at shutdown (TBC steady-state result)
T_amb_soak_C = 45.0;
h_nat       = 8.0;
eps_ = 0.85;
sigma = 5.67e-8;
A_ref = 1.0;
t_end = 100*60; % 100 minutes in seconds

C2K = @(c) c + 273.15;

add_block('fl_lib/Thermal/Thermal Elements/Thermal Mass', [modelName '/wall_mass']);
add_block('fl_lib/Thermal/Thermal Elements/Convective Heat Transfer', [modelName '/conv_soak']);
add_block('fl_lib/Thermal/Thermal Elements/Radiative Heat Transfer', [modelName '/rad_soak']);
add_block('fl_lib/Thermal/Thermal Sources/Temperature Source', [modelName '/T_amb_soak']);
add_block('fl_lib/Thermal/Thermal Sensors/Temperature Sensor', [modelName '/Ts_sensor']);
add_block('nesl_utility/PS-Simulink Converter', [modelName '/PS2SL']);
add_block('simulink/Sinks/To Workspace', [modelName '/Ts_out']);
add_block('nesl_utility/Solver Configuration', [modelName '/SolverConfig']);

set_param([modelName '/wall_mass'], 'mass', '1');
set_param([modelName '/wall_mass'], 'sp_heat', num2str(C_eff));
set_param([modelName '/wall_mass'], 'T_specify', 'on');
set_param([modelName '/wall_mass'], 'T', num2str(C2K(T0_C)));

set_param([modelName '/conv_soak'], 'area', num2str(A_ref));
set_param([modelName '/conv_soak'], 'heat_tr_coeff', num2str(h_nat));

set_param([modelName '/rad_soak'], 'area', num2str(A_ref));
set_param([modelName '/rad_soak'], 'rad_tr_coeff', num2str(eps_*sigma));

set_param([modelName '/T_amb_soak'], 'temperature', num2str(C2K(T_amb_soak_C)));

set_param([modelName '/Ts_sensor'], 'temperature_measure', 'foundation.enum.MeasurementReference.absolute');

set_param([modelName '/Ts_out'], 'VariableName', 'Ts_log');
set_param([modelName '/Ts_out'], 'SaveFormat', 'Structure With Time');
set_param([modelName '/Ts_out'], 'MaxDataPoints', 'inf');

names = {'wall_mass','conv_soak','rad_soak','T_amb_soak','Ts_sensor','PS2SL','Ts_out','SolverConfig'};
for i = 1:numel(names)
    set_param([modelName '/' names{i}], 'Position', [30+140*i, 100, 90+140*i, 140]);
end

ph = @(b) get_param([modelName '/' b], 'PortHandles');

add_line(modelName, ph('wall_mass').LConn(1), ph('conv_soak').LConn(1));
add_line(modelName, ph('wall_mass').LConn(1), ph('rad_soak').LConn(1));
add_line(modelName, ph('wall_mass').LConn(1), ph('Ts_sensor').LConn(1));
add_line(modelName, ph('wall_mass').LConn(1), ph('SolverConfig').RConn(1));

add_line(modelName, ph('conv_soak').RConn(1), ph('T_amb_soak').LConn(1));
add_line(modelName, ph('rad_soak').RConn(1), ph('T_amb_soak').LConn(1));

sensPorts = ph('Ts_sensor');
add_line(modelName, sensPorts.RConn(1), ph('PS2SL').LConn(1));
add_line(modelName, ph('PS2SL').Outport(1), get_param([modelName '/Ts_out'],'PortHandles').Inport(1));

set_param(modelName, 'StopTime', num2str(t_end));
set_param(modelName, 'Solver', 'ode4');
set_param(modelName, 'FixedStep', '1');

save_system(modelName, fullfile(pwd, [modelName '.slx']));

simOut = sim(modelName);
logged = simOut.get('Ts_log');
t = logged.time;
TC = logged.signals.values - 273.15;

close_system(modelName, 1);
end
