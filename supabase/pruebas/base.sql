-- Pruebas de la base: roles, ingreso, fichaje verificado, supervisión y administración.
-- Corre todo dentro de una transacción con el reloj fijado y termina con un error a propósito:
-- así nada queda guardado y el resultado vuelve en el mensaje ("RESULTADO n pruebas, fallaron: [...]").
-- Se ejecuta con una sesión de mantenimiento (usuario postgres), que es la única que puede fijar el reloj.
do $$
declare
  res jsonb := '[]'::jsonb;
  v jsonb; e text; cod text; tok text; b bigint; m bigint; n integer; lic integer; sec bytea;
  a_admin uuid; a_sup uuid; a_c1 uuid; a_c2 uuid;
  p_admin integer; p_sup integer; p_c1 integer; p_c2 integer;
  s1 integer; asg1 integer; asg2 integer;
  j1 bigint; j2 bigint; j3 bigint; j4 bigint; j5 bigint; j6 bigint;
  cerca_lat constant double precision := -32.8896; cerca_lon constant double precision := -68.8459;
begin
  perform set_config('dem.reloj', '2026-11-30 11:00:00+00', true);            -- lunes 30/11, 08:00 en Mendoza
  perform set_config('request.jwt.claims', '{}', true);

  -- Primera configuración
  update dem.config set instalacion_hash = dem.huella('PRUEBA1234'), instalacion_vence = now() + interval '1 hour' where id;
  v := public.instalacion();
  res := res || jsonb_build_array(jsonb_build_array('instalación pendiente', not (v ->> 'instalada')::boolean));
  v := public.instalar('otro-codigo', '90000001', 'Ana', 'Admin', 'clave-admin-1');
  res := res || jsonb_build_array(jsonb_build_array('instalar: código incorrecto', not (v ->> 'ok')::boolean));
  begin v := public.instalar('prueba-1234', '90000001', 'Ana', 'Admin', 'corta'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('instalar: clave corta', e = 'La clave tiene que tener al menos 8 caracteres.'));
  v := public.instalar('prueba-1234', '90.000.001', 'Ana', 'Admin', 'clave-admin-1');
  select id, auth_id into p_admin, a_admin from dem.personas where dni = '90000001';
  res := res || jsonb_build_array(jsonb_build_array('instalar: crea la administración', (v ->> 'ok')::boolean and p_admin is not null
    and (select rol = 'admin' and not debe_cambiar_clave from dem.personas where id = p_admin)));
  begin v := public.instalar('prueba-1234', '90000009', 'Otra', 'Persona', 'clave-larga-1'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('instalar: una sola vez', e = 'La plataforma ya está configurada. Ingresá con tu DNI y tu clave.'));
  res := res || jsonb_build_array(jsonb_build_array('cuenta con DNI como identificador', (select email = '90000001@dni.invalid' from auth.users where id = a_admin)));

  -- Administración: sede, clave inicial y altas
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_sede('{"nombre":"Sede Prueba","direccion":"Calle 1","lat":"-32.8895","lon":"-68.8458","radio":"150","verificacion":"pantalla"}');
  select id into s1 from dem.sedes where nombre = 'Sede Prueba';
  res := res || jsonb_build_array(jsonb_build_array('sede creada', s1 is not null and v -> 'estado' -> 'sedes' -> 0 ->> 'nombre' = 'Sede Prueba'));
  begin v := public.admin_persona('{"dni":"90000002","nombre":"Sofía","apellido":"Super","rol":"supervisor"}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('alta exige clave inicial', e = 'Antes de dar de alta personas, definí la clave inicial.'));
  begin v := public.admin_clave_inicial('123'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('clave inicial corta', e like 'La clave inicial tiene que tener%'));
  v := public.admin_clave_inicial('inicial-123');
  v := public.admin_persona('{"dni":"90.000.002","nombre":"Sofía","apellido":"Super","rol":"supervisor"}');
  v := public.admin_persona('{"dni":"90000003","nombre":"Carlos","apellido":"Colab","rol":"colaborador"}');
  v := public.admin_persona('{"dni":"90000004","nombre":"Dora","apellido":"Dos"}');
  select id, auth_id into p_sup, a_sup from dem.personas where dni = '90000002';
  select id, auth_id into p_c1, a_c1 from dem.personas where dni = '90000003';
  select id, auth_id into p_c2, a_c2 from dem.personas where dni = '90000004';
  res := res || jsonb_build_array(jsonb_build_array('altas con clave pendiente', (select count(*) = 3 from dem.personas where debe_cambiar_clave)
    and (select extensions.crypt('inicial-123', encrypted_password) = encrypted_password from auth.users where id = a_c1)));
  res := res || jsonb_build_array(jsonb_build_array('admin ve DNI y acceso', exists (select 1 from jsonb_array_elements(v -> 'estado' -> 'colabs') x where x ->> 'dni' = '90000003' and x ->> 'acceso' = 'pendiente')));
  begin v := public.admin_persona('{"dni":"90000003","nombre":"Otro"}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('DNI repetido', e = 'Ya hay una persona con ese DNI.'));
  begin v := public.admin_persona('{"dni":"12ab","nombre":"Otro"}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('DNI inválido', e = 'Escribí el DNI solo con números, sin puntos.'));

  -- Clave inicial: bloquea todo hasta cambiarla
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('estado mínimo con clave pendiente', (v -> 'yo' ->> 'debeCambiarClave')::boolean and not (v ? 'jornadas')));
  begin v := public.novedad('{"tipo":"otra","crit":"baja","texto":"x"}'); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('bloqueado hasta cambiar la clave', e = 'DEM03'));
  begin v := public.clave_cambiada(); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no vale seguir con la inicial', e = 'Elegí una clave distinta de la inicial.'));
  update auth.users set encrypted_password = extensions.crypt('clave-propia-1', extensions.gen_salt('bf', 4)) where id in (a_c1, a_c2, a_sup);
  v := public.clave_cambiada();
  res := res || jsonb_build_array(jsonb_build_array('habilitado al cambiarla', (v ->> 'ok')::boolean and not (v -> 'estado' -> 'yo' ->> 'debeCambiarClave')::boolean));
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  v := public.clave_cambiada();
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  v := public.clave_cambiada();

  -- Permisos por rol
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1, 'role', 'authenticated')::text, true);
  begin v := public.admin_aplicar('{}'); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('colaborador no administra', e = 'DEM04'));
  begin v := public.sup_asistido(1); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('colaborador no supervisa', e = 'DEM04'));
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  begin v := public.admin_sede('{"nombre":"X"}'); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('supervisor no administra', e = 'DEM04'));
  perform set_config('request.jwt.claims', '{}', true);
  begin v := public.estado(); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('sin sesión no entra', e = 'DEM02'));

  -- Asignaciones: generan los turnos de hoy
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_aplicar(jsonb_build_object('asigs', jsonb_build_array(
    jsonb_build_object('id', 'a1000001', 'c', p_c1::text, 'sede', s1::text, 'dias', jsonb_build_array(1, 2, 3, 4, 5), 'ti', 480, 'tf', 840, 'modalidad', 'hora', 'valor', 6500, 'activa', true, 'desde', null, 'hasta', null),
    jsonb_build_object('id', 'a1000002', 'c', p_c2::text, 'sede', s1::text, 'dias', jsonb_build_array(1, 2, 3, 4, 5), 'ti', 480, 'tf', 840, 'modalidad', 'fijo', 'valor', 950000, 'activa', true))));
  select id into asg1 from dem.asignaciones where persona_id = p_c1;
  select id into asg2 from dem.asignaciones where persona_id = p_c2;
  select id into j1 from dem.jornadas where asignacion_id = asg1 and f = '2026-11-30';
  select id into j2 from dem.jornadas where asignacion_id = asg2 and f = '2026-11-30';
  res := res || jsonb_build_array(jsonb_build_array('turnos de hoy generados', j1 is not null and j2 is not null));
  res := res || jsonb_build_array(jsonb_build_array('admin ve los valores', exists (select 1 from jsonb_array_elements(v -> 'estado' -> 'asigs') x where (x ->> 'valor')::integer = 6500)));

  -- Colaborador: ve solo lo suyo, con la hora del servidor
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('colaborador ve solo lo suyo', jsonb_array_length(v -> 'jornadas') = 1 and jsonb_array_length(v -> 'colabs') = 1
    and (v -> 'asigs' -> 0 ->> 'valor')::integer = 0 and not (v -> 'colabs' -> 0 ? 'dni') and jsonb_array_length(v -> 'marcas') = 0));
  res := res || jsonb_build_array(jsonb_build_array('hora del servidor', (v ->> 'ahora')::integer = 480 and v ->> 'hoy' = '2026-11-30' and (v -> 'yo' ->> 'colab')::boolean));

  -- Fichaje con el código de la pantalla
  v := public.fichar(j1, 'entrada', '000000', 'codigo', cerca_lat, cerca_lon, 20, 'telefono-uno-00000001', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('código incorrecto', not (v ->> 'ok')::boolean and (select entrada is null from dem.jornadas where id = j1)));
  select dem.totp(secreto, dem.paso()) into cod from dem.sedes where id = s1;
  begin v := public.fichar(j2, 'entrada', cod, 'qr', cerca_lat, cerca_lon, 20, 'telefono-uno-00000001', 'Android'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no ficha el turno de otra persona', e = 'No encontramos ese turno.'));
  v := public.fichar(j1, 'entrada', cod, 'qr', cerca_lat, cerca_lon, 20, 'telefono-uno-00000001', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('entrada con QR', (v ->> 'ok')::boolean and v ->> 'geo' = 'ok' and v ->> 'telefono' = 'nuevo' and (v ->> 'hora')::integer = 480
    and (v -> 'estado' -> 'jornadas' -> 0 ->> 'entrada')::integer = 480 and v -> 'estado' -> 'jornadas' -> 0 ->> 'metodoIn' = 'qr'));
  begin v := public.fichar(j1, 'entrada', cod, 'qr', cerca_lat, cerca_lon, 20, 'telefono-uno-00000001', 'Android'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no ficha dos veces', e = 'La entrada de este turno ya está registrada.'));

  -- 35 segundos después el código anterior todavía vale; la ubicación lejana queda marcada
  perform set_config('dem.reloj', '2026-11-30 11:00:35+00', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  v := public.fichar(j2, 'entrada', cod, 'codigo', -32.93, -68.80, 15, 'telefono-dos-00000002', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('código del paso anterior y ubicación lejana', (v ->> 'ok')::boolean and v ->> 'geo' = 'lejos'));
  perform set_config('dem.reloj', '2026-11-30 11:02:10+00', true);
  v := public.fichar(j2, 'salida', cod, 'codigo', cerca_lat, cerca_lon, 15, 'telefono-dos-00000002', 'Android', '{"conf":true}');
  res := res || jsonb_build_array(jsonb_build_array('código vencido', not (v ->> 'ok')::boolean));

  -- Supervisión: ve la alerta, anula el fichaje y lo reemplaza por uno asistido
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('supervisión ve el fichaje lejos', jsonb_array_length(v -> 'marcas') = 1 and v -> 'marcas' -> 0 ->> 'geo' = 'lejos'
    and (v -> 'marcas' -> 0 ->> 'dist')::integer > 3000));
  res := res || jsonb_build_array(jsonb_build_array('supervisión no ve valores ni DNI', not exists (select 1 from jsonb_array_elements(v -> 'asigs') x where (x ->> 'valor')::integer <> 0)
    and not exists (select 1 from jsonb_array_elements(v -> 'colabs') x where x ? 'dni')));
  select id into m from dem.marcas where jornada_id = j2;
  v := public.sup_marca(m, 'anular');
  res := res || jsonb_build_array(jsonb_build_array('anular borra la entrada', (select entrada is null and not cerrada from dem.jornadas where id = j2) and jsonb_array_length(v -> 'estado' -> 'marcas') = 0));
  v := public.sup_asistido(j2);
  res := res || jsonb_build_array(jsonb_build_array('fichaje asistido de entrada', v ->> 'que' = 'entrada' and (select metodo_in = 'supervisor' from dem.jornadas where id = j2)
    and v -> 'estado' -> 'bitacora' -> 0 ->> 'texto' = 'Dora Dos en Sede Prueba: entrada asistida a las 08:02'));

  -- Salida a horario, confirmada
  perform set_config('dem.reloj', '2026-11-30 17:05:10+00', true);            -- 14:05
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1, 'role', 'authenticated')::text, true);
  select dem.totp(secreto, dem.paso()) into cod from dem.sedes where id = s1;
  v := public.fichar(j1, 'salida', cod, 'qr', cerca_lat, cerca_lon, 20, 'telefono-uno-00000001', 'Android', '{"conf":true,"decl":null}');
  res := res || jsonb_build_array(jsonb_build_array('salida confirmada', (v ->> 'ok')::boolean and v ->> 'telefono' = 'registrado'
    and (select cerrada and conf and metodo_out = 'qr' and decl is null from dem.jornadas where id = j1) and (v -> 'estado' -> 'jornadas' -> 0 ->> 'salida')::integer = 845));

  -- Salida con tiempo de más, desde el teléfono de otra persona: control excedente y alerta
  perform set_config('dem.reloj', '2026-11-30 18:30:00+00', true);            -- 15:30
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  select dem.totp(secreto, dem.paso()) into cod from dem.sedes where id = s1;
  begin v := public.fichar(j2, 'salida', cod, 'codigo', cerca_lat, cerca_lon, 10, 'telefono-uno-00000001', 'Android', '{"decl":{"tipo":"olvido","hora":2000,"texto":""}}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('hora declarada fuera de rango', e = 'La hora tiene que estar entre tu entrada y ahora.'));
  v := public.fichar(j2, 'salida', cod, 'codigo', cerca_lat, cerca_lon, 10, 'telefono-uno-00000001', 'Android', '{"conf":false,"decl":{"tipo":"extra","hora":null,"texto":"Me quedé a terminar"}}');
  res := res || jsonb_build_array(jsonb_build_array('salida con declaración y teléfono compartido', (v ->> 'ok')::boolean and v ->> 'telefono' = 'compartido'
    and (select decl ->> 'tipo' = 'extra' and not conf and cerrada from dem.jornadas where id = j2)));
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('alerta de teléfono compartido', v -> 'marcas' -> 0 ->> 'tel' = 'compartido' and v -> 'marcas' -> 0 ->> 'con' = p_c1::text));
  select id into m from dem.marcas where jornada_id = j2 and tipo = 'salida';
  v := public.sup_marca(m, 'visto');
  res := res || jsonb_build_array(jsonb_build_array('alerta vista', jsonb_array_length(v -> 'estado' -> 'marcas') = 0 and (select salida is not null from dem.jornadas where id = j2)));
  begin v := public.sup_resolver(j2, 'extra', 800); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('extra exige salida posterior al turno', e = 'Para hora extra, la salida validada tiene que ser posterior a las 14:00.'));
  v := public.sup_resolver(j2, 'extra', 930);
  res := res || jsonb_build_array(jsonb_build_array('resolver como hora extra', (select rev = 'extra' and salida_val = 930 from dem.jornadas where id = j2)
    and v -> 'estado' -> 'bitacora' -> 0 ->> 'texto' = 'Dora Dos, lun 30 en Sede Prueba: hora extra verificada, 1 h 30 min'));
  begin v := public.sup_resolver(j2, 'ok'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no se resuelve dos veces', e = 'Ese turno ya fue resuelto. Actualizá la pantalla.'));
  select id into b from dem.bitacora where tipo = 'rev' and jornada_id = j2;
  v := public.sup_deshacer(b);
  res := res || jsonb_build_array(jsonb_build_array('deshacer una resolución', (select rev is null and salida_val is null from dem.jornadas where id = j2)));
  select id into b from dem.bitacora where tipo = 'asistido' and jornada_id = j2;
  begin v := public.sup_deshacer(b); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('el asistido no se deshace', e = 'Eso no se puede deshacer.'));

  -- Martes: una inasistencia y una salida olvidada
  perform set_config('dem.reloj', '2026-12-01 11:02:00+00', true);            -- martes 08:02
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  v := public.estado();
  select id into j3 from dem.jornadas where asignacion_id = asg2 and f = '2026-12-01';
  select id into j4 from dem.jornadas where asignacion_id = asg1 and f = '2026-12-01';
  select dem.totp(secreto, dem.paso()) into cod from dem.sedes where id = s1;
  v := public.fichar(j3, 'entrada', cod, 'qr', cerca_lat, cerca_lon, 10, 'telefono-dos-00000002', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('entrada del martes', (v ->> 'ok')::boolean and (v ->> 'hora')::integer = 482 and v ->> 'telefono' = 'registrado'));
  perform set_config('dem.reloj', '2026-12-01 17:01:00+00', true);            -- 14:01
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('inasistencia al terminar el turno', (select cerrada and entrada is null and metodo_out is null from dem.jornadas where id = j4)
    and (select not cerrada from dem.jornadas where id = j3)));
  begin v := public.sup_asistido(j4); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('sin asistido sobre un turno cerrado', e = 'Ese turno ya no admite fichaje asistido.'));
  v := public.sup_justificar(j4, 'aviso');
  res := res || jsonb_build_array(jsonb_build_array('justificar inasistencia', (select justif = 'aviso' from dem.jornadas where id = j4)
    and v -> 'estado' -> 'bitacora' -> 0 ->> 'texto' = 'Carlos Colab, mar 1 en Sede Prueba: inasistencia justificada, ausencia con aviso'));
  perform set_config('dem.reloj', '2026-12-01 23:01:00+00', true);            -- 20:01, seis horas después del fin
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('cierre automático a las seis horas', (select cerrada and salida is null and metodo_out = 'auto' from dem.jornadas where id = j3)));
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  begin v := public.declarar_olvido(j3, 480); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('olvido: hora anterior a la entrada', e = 'La salida tiene que ser posterior a tu entrada de las 08:02.'));
  v := public.declarar_olvido(j3, 845);
  res := res || jsonb_build_array(jsonb_build_array('olvido declarado', (select decl ->> 'tipo' = 'olvido' and (decl ->> 'hora')::integer = 845 from dem.jornadas where id = j3)));
  v := public.descargo(j3, '  Se me apagó el teléfono  ');
  res := res || jsonb_build_array(jsonb_build_array('descargo guardado', (select descargo = 'Se me apagó el teléfono' from dem.jornadas where id = j3)));
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  v := public.sup_resolver(j3, 'olvido', 845);
  res := res || jsonb_build_array(jsonb_build_array('resolver olvido', v -> 'estado' -> 'bitacora' -> 0 ->> 'texto' = 'Dora Dos, mar 1 en Sede Prueba: olvido de salida, validada a las 14:05'));

  -- Miércoles: licencias y cambios de asignación sobre el día en curso
  perform set_config('dem.reloj', '2026-12-02 10:00:00+00', true);            -- miércoles 07:00
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.estado();
  v := public.admin_aplicar(jsonb_build_object('licencias', jsonb_build_array(jsonb_build_object('id', 'l1000001', 'c', p_c1::text, 'tipo', 'licencia', 'desde', '2026-12-02', 'hasta', '2026-12-03'))));
  res := res || jsonb_build_array(jsonb_build_array('la licencia justifica el turno de hoy', (select justif = 'licencia' and cerrada from dem.jornadas where asignacion_id = asg1 and f = '2026-12-02')));
  begin v := public.admin_aplicar(jsonb_build_object('licencias', jsonb_build_array(jsonb_build_object('c', p_c1::text, 'tipo', 'franco', 'desde', '2026-12-03', 'hasta', '2026-12-05')))); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('licencias que se pisan', e = 'Ya tiene una ausencia cargada en esas fechas.'));
  select id into lic from dem.licencias where persona_id = p_c1;
  v := public.admin_aplicar(jsonb_build_object('licenciasQuitar', jsonb_build_array(lic::text)));
  res := res || jsonb_build_array(jsonb_build_array('quitar la licencia reabre el turno', (select justif is null and not cerrada from dem.jornadas where asignacion_id = asg1 and f = '2026-12-02')));
  v := public.admin_aplicar(jsonb_build_object('asigs', jsonb_build_array(
    jsonb_build_object('id', asg1::text, 'c', p_c1::text, 'sede', s1::text, 'dias', jsonb_build_array(1, 2, 3, 4, 5), 'ti', 540, 'tf', 900, 'modalidad', 'hora', 'valor', 7000, 'activa', true))));
  res := res || jsonb_build_array(jsonb_build_array('el turno sin empezar toma el horario nuevo', (select ti = 540 and tf = 900 from dem.jornadas where asignacion_id = asg1 and f = '2026-12-02')
    and (select valor = 7000 from dem.asignaciones where id = asg1)));
  v := public.admin_aplicar(jsonb_build_object('asigs', jsonb_build_array(
    jsonb_build_object('id', asg1::text, 'c', p_c1::text, 'sede', s1::text, 'dias', jsonb_build_array(1, 2, 3, 4, 5), 'ti', 540, 'tf', 900, 'modalidad', 'hora', 'valor', 7000, 'activa', false))));
  res := res || jsonb_build_array(jsonb_build_array('desactivar quita el turno pendiente', not exists (select 1 from dem.jornadas where asignacion_id = asg1 and f = '2026-12-02')
    and exists (select 1 from dem.jornadas where id = j1)));

  -- Sede con QR impreso
  v := public.admin_sede(jsonb_build_object('id', s1::text, 'nombre', 'Sede Prueba', 'direccion', 'Calle 1', 'lat', '-32.8895', 'lon', '-68.8458', 'radio', '150', 'verificacion', 'impreso'));
  perform set_config('dem.reloj', '2026-12-02 11:00:00+00', true);            -- 08:00
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  select id into j5 from dem.jornadas where asignacion_id = asg2 and f = '2026-12-02';
  v := public.fichar(j5, 'entrada', 'ffffffffffffffffff', 'qr', cerca_lat, cerca_lon, 10, 'telefono-dos-00000002', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('QR impreso de otra sede', not (v ->> 'ok')::boolean and v ->> 'error' = 'Ese QR no es el de esta sede.'));
  select codigo_fijo into cod from dem.sedes where id = s1;
  v := public.fichar(j5, 'entrada', cod, 'qr', null, null, null, 'telefono-dos-00000002', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('QR impreso, sin ubicación', (v ->> 'ok')::boolean and v ->> 'geo' = 'sin_dato' and (select metodo_in = 'impreso' from dem.jornadas where id = j5)));

  -- Sede que verifica solo por ubicación
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_sede(jsonb_build_object('id', s1::text, 'nombre', 'Sede Prueba', 'direccion', 'Calle 1', 'lat', '-32.8895', 'lon', '-68.8458', 'radio', '150', 'verificacion', 'ubicacion'));
  perform set_config('dem.reloj', '2026-12-02 17:00:00+00', true);            -- 14:00
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  v := public.fichar(j5, 'salida', null, null, null, null, null, 'telefono-dos-00000002', 'Android', '{"conf":true}');
  res := res || jsonb_build_array(jsonb_build_array('solo ubicación: sin dato no ficha', not (v ->> 'ok')::boolean));
  v := public.fichar(j5, 'salida', null, null, -32.93, -68.80, 20, 'telefono-dos-00000002', 'Android', '{"conf":true}');
  res := res || jsonb_build_array(jsonb_build_array('solo ubicación: lejos no ficha', not (v ->> 'ok')::boolean and v ->> 'error' like 'Tu teléfono figura a %km de la sede%'));
  v := public.fichar(j5, 'salida', null, null, -32.8925, -68.8480, 400, 'telefono-dos-00000002', 'Android', '{"conf":true}');
  res := res || jsonb_build_array(jsonb_build_array('solo ubicación: imprecisa ficha y queda anotada', (v ->> 'ok')::boolean and v ->> 'geo' = 'imprecisa' and (select metodo_out = 'ubicacion' from dem.jornadas where id = j5)));

  -- Turno de noche: empieza el miércoles 22:00 y se cierra el jueves a la mañana
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_aplicar(jsonb_build_object('asigs', jsonb_build_array(
    jsonb_build_object('id', asg1::text, 'c', p_c1::text, 'sede', s1::text, 'dias', jsonb_build_array(3), 'ti', 1320, 'tf', 1800, 'modalidad', 'hora', 'valor', 7000, 'activa', true))));
  select id into j6 from dem.jornadas where asignacion_id = asg1 and f = '2026-12-02';
  perform set_config('dem.reloj', '2026-12-03 01:00:00+00', true);            -- miércoles 22:00
  perform set_config('request.jwt.claims', json_build_object('sub', a_c1, 'role', 'authenticated')::text, true);
  v := public.fichar(j6, 'entrada', null, null, cerca_lat, cerca_lon, 10, 'telefono-uno-00000001', 'Android');
  res := res || jsonb_build_array(jsonb_build_array('entrada del turno de noche', j6 is not null and (v ->> 'ok')::boolean and (v ->> 'hora')::integer = 1320 and v ->> 'geo' = 'ok'));
  perform set_config('dem.reloj', '2026-12-03 09:03:00+00', true);            -- jueves 06:03
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('pasada la medianoche el turno sigue abierto', v ->> 'hoy' = '2026-12-03' and (select not cerrada from dem.jornadas where id = j6)
    and exists (select 1 from jsonb_array_elements(v -> 'jornadas') x where x ->> 'id' = j6::text and x ->> 'f' = '2026-12-02')));
  v := public.fichar(j6, 'salida', null, null, cerca_lat, cerca_lon, 10, 'telefono-uno-00000001', 'Android', '{"conf":true}');
  res := res || jsonb_build_array(jsonb_build_array('salida del turno de noche', (v ->> 'ok')::boolean and (v ->> 'hora')::integer = 1803 and (select cerrada from dem.jornadas where id = j6)));
  begin v := public.salida_declarada(j6, 1700); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('salida declarada solo con el turno abierto', e = 'Ese turno no está abierto.'));
  v := public.novedad(jsonb_build_object('tipo', 'insumos', 'crit', 'media', 'texto', 'Faltan bolsas', 'sede', s1::text));
  res := res || jsonb_build_array(jsonb_build_array('novedad cargada', v -> 'estado' -> 'novedades' -> 0 ->> 'texto' = 'Faltan bolsas' and v -> 'estado' -> 'novedades' -> 0 ->> 'estado' = 'abierta'));

  -- Reglas, avisos, horario contratado y feriados
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_aplicar('{"P":{"topeFijo":9},"avisos":["Administración cambió el tope diario de las asignaciones fijas de 8 a 9 h."]}');
  res := res || jsonb_build_array(jsonb_build_array('regla y aviso', (v -> 'estado' -> 'P' ->> 'topeFijo')::integer = 9 and (v -> 'estado' -> 'P' ->> 'gracia')::integer = 5 and jsonb_array_length(v -> 'estado' -> 'avisos') = 1));
  begin v := public.admin_aplicar('{"P":{"rojo":2}}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('rojo no puede ser menor que la gracia', e = 'La demora que pasa a rojo no puede ser menor que la gracia de llegada.'));
  begin v := public.admin_aplicar('{"P":{"topeHora":40}}'); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('tope fuera de rango', e = 'Usá un número entre 1 y 24.'));
  v := public.admin_aplicar(jsonb_build_object(
    'franjas', jsonb_build_array(jsonb_build_object('id', 'f1000001', 'sede', s1::text, 'dias', jsonb_build_array(7, 1, 2, 3, 4, 5, 6), 'ti', 1320, 'tf', 1800, 'dot', 1)),
    'feriados', jsonb_build_array(jsonb_build_object('f', '2026-12-24', 'nombre', 'Asueto', 'tipo', 'no_laborable', 'propio', true),
                                  jsonb_build_object('f', '2026-12-08', 'nombre', 'Inmaculada Concepción de María', 'tipo', 'no_laborable'))));
  select id into n from dem.franjas where sede_id = s1;
  res := res || jsonb_build_array(jsonb_build_array('franja nocturna y feriados', n is not null and (select dias = '{1,2,3,4,5,6,7}' from dem.franjas where id = n)
    and (select propio from dem.feriados where f = '2026-12-24') and (select tipo = 'no_laborable' and not propio from dem.feriados where f = '2026-12-08')));
  v := public.admin_aplicar(jsonb_build_object('franjasQuitar', jsonb_build_array(n::text), 'feriadosQuitar', jsonb_build_array('2026-12-24')));
  res := res || jsonb_build_array(jsonb_build_array('quitar franja y feriado', not exists (select 1 from dem.franjas where id = n) and not exists (select 1 from dem.feriados where f = '2026-12-24')));
  perform set_config('request.jwt.claims', json_build_object('sub', a_sup, 'role', 'authenticated')::text, true);
  select id into b from dem.avisos limit 1;
  v := public.sup_aviso(b);
  res := res || jsonb_build_array(jsonb_build_array('aviso visto', jsonb_array_length(v -> 'estado' -> 'avisos') = 0));
  select id into b from dem.novedades limit 1;
  v := public.sup_novedad(b, 'resuelta');
  res := res || jsonb_build_array(jsonb_build_array('novedad resuelta', v -> 'estado' -> 'novedades' -> 0 ->> 'estado' = 'resuelta'));

  -- Pantalla de la sede
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.admin_vincular(s1);
  cod := v ->> 'codigo';
  perform set_config('request.jwt.claims', '{}', true);
  v := public.pantalla_vincular('00000000', 'Recepción');
  res := res || jsonb_build_array(jsonb_build_array('vinculación: código incorrecto', length(cod) = 8 and not (v ->> 'ok')::boolean));
  v := public.pantalla_vincular(cod, 'Recepción');
  tok := v ->> 'token';
  res := res || jsonb_build_array(jsonb_build_array('pantalla vinculada', (v ->> 'ok')::boolean and length(tok) = 64));
  v := public.pantalla_vincular(cod, 'Otra');
  res := res || jsonb_build_array(jsonb_build_array('código de un solo uso', not (v ->> 'ok')::boolean));
  v := public.pantalla_estado(tok);
  res := res || jsonb_build_array(jsonb_build_array('la pantalla recibe el secreto de su sede', (v ->> 'ok')::boolean and v ->> 'sede' = 'Sede Prueba'
    and decode(v ->> 'secreto', 'base64') = (select secreto from dem.sedes where id = s1) and (v ->> 'periodo')::integer = 30));
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  v := public.estado();
  res := res || jsonb_build_array(jsonb_build_array('admin ve la pantalla en línea', jsonb_array_length(v -> 'sedes' -> 0 -> 'pantallas') = 1 and (v -> 'sedes' -> 0 -> 'pantallas' -> 0 ->> 'hace')::integer = 0));
  select secreto into sec from dem.sedes where id = s1;
  v := public.admin_sede_codigo(s1);
  res := res || jsonb_build_array(jsonb_build_array('cambiar los códigos de la sede', (select secreto <> sec from dem.sedes where id = s1)
    and decode(public.pantalla_estado(tok) ->> 'secreto', 'base64') = (select secreto from dem.sedes where id = s1)));
  select id into n from dem.pantallas limit 1;
  v := public.admin_pantalla(n);
  perform set_config('request.jwt.claims', '{}', true);
  v := public.pantalla_estado(tok);
  res := res || jsonb_build_array(jsonb_build_array('pantalla desvinculada', not (v ->> 'ok')::boolean));

  -- Personas: resguardos, baja, restablecer clave, teléfono y cambio de DNI
  perform set_config('request.jwt.claims', json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);
  begin v := public.admin_persona(jsonb_build_object('id', p_admin::text, 'dni', '90000001', 'nombre', 'Ana', 'apellido', 'Admin', 'rol', 'colaborador')); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('siempre queda una administración', e = 'Tiene que quedar al menos una persona activa con rol de administración.'));
  begin v := public.admin_restablecer(p_admin); e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no se restablece la propia clave', e like 'Tu propia clave se cambia%'));
  v := public.admin_restablecer(p_c1);
  res := res || jsonb_build_array(jsonb_build_array('restablecer clave', (select debe_cambiar_clave from dem.personas where id = p_c1)
    and (select extensions.crypt('inicial-123', encrypted_password) = encrypted_password from auth.users where id = a_c1)));
  v := public.admin_clave_inicial('otra-inicial');
  res := res || jsonb_build_array(jsonb_build_array('la clave inicial nueva alcanza a los pendientes', (select extensions.crypt('otra-inicial', encrypted_password) = encrypted_password from auth.users where id = a_c1)
    and (select extensions.crypt('clave-propia-1', encrypted_password) = encrypted_password from auth.users where id = a_c2)));
  v := public.admin_telefono(p_c2, 'aceptar');
  res := res || jsonb_build_array(jsonb_build_array('aceptar el teléfono nuevo', (select count(*) = 1 from dem.dispositivos where persona_id = p_c2 and estado = 'registrado' and huella = dem.huella('telefono-uno-00000001'))));
  v := public.admin_telefono(p_c2, 'liberar');
  res := res || jsonb_build_array(jsonb_build_array('liberar el teléfono', not exists (select 1 from dem.dispositivos where persona_id = p_c2)));
  v := public.admin_persona(jsonb_build_object('id', p_c1::text, 'dni', '90000033', 'nombre', 'Carlos', 'apellido', 'Colab', 'rol', 'colaborador', 'activa', true));
  res := res || jsonb_build_array(jsonb_build_array('corregir el DNI cambia el ingreso', (select email = '90000033@dni.invalid' from auth.users where id = a_c1)
    and (select identity_data ->> 'email' = '90000033@dni.invalid' from auth.identities where user_id = a_c1)));
  v := public.admin_persona(jsonb_build_object('id', p_c2::text, 'dni', '90000004', 'nombre', 'Dora', 'apellido', 'Dos', 'rol', 'colaborador', 'activa', false));
  perform set_config('request.jwt.claims', json_build_object('sub', a_c2, 'role', 'authenticated')::text, true);
  begin v := public.estado(); e := 'sin error'; exception when others then e := sqlstate; end;
  res := res || jsonb_build_array(jsonb_build_array('la baja corta el acceso', e = 'DEM02'));

  -- Guardia sobre las cuentas
  begin
    insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alguien@ejemplo.invalid');
    e := 'sin error';
  exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('no se crean cuentas por fuera', e = 'Las cuentas se crean desde administración.'));
  begin update auth.users set recovery_token = 'abc' where id = a_c1; e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('sin enlaces de recuperación', e = 'Este cambio se hace desde administración.'));
  begin update auth.users set email = 'otro@ejemplo.invalid' where id = a_c1; e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('nadie cambia su identificador', e = 'Este cambio se hace desde administración.'));
  begin update auth.users set last_sign_in_at = now() where id = a_c1; e := 'sin error'; exception when others then e := sqlerrm; end;
  res := res || jsonb_build_array(jsonb_build_array('el ingreso normal no se bloquea', e = 'sin error'));

  raise exception 'RESULTADO % pruebas, fallaron: %', jsonb_array_length(res),
    coalesce((select jsonb_agg(x -> 0) from jsonb_array_elements(res) x where (x ->> 1)::boolean is not true), '[]'::jsonb);
end $$;
