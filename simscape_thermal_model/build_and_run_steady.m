function Ts_C = build_and_run_steady(with_tbc, h1_val)
if nargin < 2
    h1_val = 180.0;
end
load_system('fl_lib');
load_system('nesl_utility');

if with_tbc
    modelName = 'manifold_steady_tbc';
else
    modelName = 'manifold_steady_bare';
end
if bdIsLoaded(modelName)
    close_system(modelName, 0);
end
new_system(modelName);

T_gas_C   = 650.0;
h1        = h1_val;
k_TBC     = 0.9;
L_TBC     = 350e-6;
k_metal   = 52.0;
L_metal   = 6e-3;
T_amb_run_C = 80.0;
h2        = 35.0;
eps_ = 0.85;
sigma = 5.67e-8;
A_ref = 1.0;

C2K = @(c) c + 273.15;

add_block('fl_lib/Thermal/Thermal Sources/Temperature Source', [modelName '/T_gas']);
add_block('fl_lib/Thermal/Thermal Elements/Convective Heat Transfer', [modelName '/conv_gas']);
if with_tbc
    add_block('fl_lib/Thermal/Thermal Elements/Conductive Heat Transfer', [modelName '/cond_TBC']);
end
add_block('fl_lib/Thermal/Thermal Elements/Conductive Heat Transfer', [modelName '/cond_metal']);
add_block('fl_lib/Thermal/Thermal Elements/Convective Heat Transfer', [modelName '/conv_out']);
add_block('fl_lib/Thermal/Thermal Elements/Radiative Heat Transfer', [modelName '/rad_out']);
add_block('fl_lib/Thermal/Thermal Sources/Temperature Source', [modelName '/T_amb']);
add_block('fl_lib/Thermal/Thermal Sensors/Temperature Sensor', [modelName '/Ts_sensor']);
add_block('nesl_utility/PS-Simulink Converter', [modelName '/PS2SL']);
add_block('simulink/Sinks/To Workspace', [modelName '/Ts_out']);
add_block('nesl_utility/Solver Configuration', [modelName '/SolverConfig']);

set_param([modelName '/T_gas'], 'temperature', num2str(C2K(T_gas_C)));
set_param([modelName '/conv_gas'], 'area', num2str(A_ref));
set_param([modelName '/conv_gas'], 'heat_tr_coeff', num2str(h1));
if with_tbc
    set_param([modelName '/cond_TBC'], 'area', num2str(A_ref));
    set_param([modelName '/cond_TBC'], 'thickness', num2str(L_TBC));
    set_param([modelName '/cond_TBC'], 'th_cond', num2str(k_TBC));
end
set_param([modelName '/cond_metal'], 'area', num2str(A_ref));
set_param([modelName '/cond_metal'], 'thickness', num2str(L_metal));
set_param([modelName '/cond_metal'], 'th_cond', num2str(k_metal));
set_param([modelName '/conv_out'], 'area', num2str(A_ref));
set_param([modelName '/conv_out'], 'heat_tr_coeff', num2str(h2));
set_param([modelName '/rad_out'], 'area', num2str(A_ref));
set_param([modelName '/rad_out'], 'rad_tr_coeff', num2str(eps_*sigma));
set_param([modelName '/T_amb'], 'temperature', num2str(C2K(T_amb_run_C)));
set_param([modelName '/Ts_sensor'], 'temperature_measure', 'foundation.enum.MeasurementReference.absolute');
set_param([modelName '/Ts_out'], 'VariableName', 'Ts_log');
set_param([modelName '/Ts_out'], 'SaveFormat', 'Array');

names = {'T_gas','conv_gas','cond_metal','conv_out','rad_out','T_amb','Ts_sensor','PS2SL','Ts_out','SolverConfig'};
if with_tbc
    names = [names, {'cond_TBC'}];
end
for i = 1:numel(names)
    set_param([modelName '/' names{i}], 'Position', [30+140*i, 100, 90+140*i, 140]);
end

ph = @(b) get_param([modelName '/' b], 'PortHandles');

add_line(modelName, ph('T_gas').LConn(1), ph('conv_gas').LConn(1));
add_line(modelName, ph('T_gas').LConn(1), ph('SolverConfig').RConn(1));

if with_tbc
    add_line(modelName, ph('conv_gas').RConn(1), ph('cond_TBC').LConn(1));
    add_line(modelName, ph('cond_TBC').RConn(1), ph('cond_metal').LConn(1));
else
    add_line(modelName, ph('conv_gas').RConn(1), ph('cond_metal').LConn(1));
end

add_line(modelName, ph('cond_metal').RConn(1), ph('conv_out').LConn(1));
add_line(modelName, ph('cond_metal').RConn(1), ph('rad_out').LConn(1));
add_line(modelName, ph('cond_metal').RConn(1), ph('Ts_sensor').LConn(1));

add_line(modelName, ph('conv_out').RConn(1), ph('T_amb').LConn(1));
add_line(modelName, ph('rad_out').RConn(1), ph('T_amb').LConn(1));

sensPorts = ph('Ts_sensor');
add_line(modelName, sensPorts.RConn(1), ph('PS2SL').LConn(1));
add_line(modelName, ph('PS2SL').Outport(1), get_param([modelName '/Ts_out'],'PortHandles').Inport(1));

set_param(modelName, 'StopTime', '1');
save_system(modelName, fullfile(pwd, [modelName '.slx']));

simOut = sim(modelName);
Ts_K = simOut.get('Ts_log');
Ts_C = Ts_K(end) - 273.15;

close_system(modelName, 1);
end
