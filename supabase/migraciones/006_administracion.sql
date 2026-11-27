-- Lo que hace administración: asignaciones, horario contratado, licencias, feriados y reglas (admin_aplicar),
-- personas y accesos, sedes y pantallas. Las pantallas de sede usan dos funciones propias, sin sesión de usuario.

create function dem.dias_de(p jsonb) returns smallint[] language sql immutable set search_path = '' as
$$ select coalesce(array(select distinct d::smallint from jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) d order by 1), '{}') $$;

create function dem.entero(p text) returns integer language sql immutable set search_path = '' as
$$ select case when p ~ '^[0-9]{1,9}$' then p::integer else null end $$;

-- Aplica en una sola operación los cambios que la aplicación ya validó con sus reglas (src/logica.js).
-- Acá se revisa el permiso, la forma de los datos y lo que la base exige; después se pone el día al día.
create function public.admin_aplicar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  x jsonb;
  k text;
  n numeric;
  v_dias smallint[];
  v_p jsonb;
  v_hoy date := dem.hoy();
  v_ahora timestamptz := dem.reloj();
  v_lim constant jsonb := '{"gracia":[0,180],"rojo":[0,180],"margen":[0,180],"topeFijo":[1,24],"topeHora":[1,24],"traslado":[0,180],"recFeriado":[0,300],"recNoLab":[0,300]}';
begin
  for x in select * from jsonb_array_elements(coalesce(p -> 'asigs', '[]'::jsonb)) loop
    v_dias := dem.dias_de(x -> 'dias');
    if (x ->> 'modalidad') is null or (x ->> 'modalidad') not in ('fijo', 'hora') then perform dem.error('Elegí fijo o por hora.'); end if;
    if dem.entero(x ->> 'id') is not null then
      update dem.asignaciones a set
          sede_id = dem.entero(x ->> 'sede'), dias = v_dias, ti = (x ->> 'ti')::smallint, tf = (x ->> 'tf')::smallint,
          modalidad = x ->> 'modalidad', valor = (x ->> 'valor')::integer, activa = coalesce((x ->> 'activa')::boolean, true),
          desde = nullif(x ->> 'desde', '')::date, hasta = nullif(x ->> 'hasta', '')::date,
          modificada = case when (a.sede_id, a.dias, a.ti, a.tf, a.activa, a.desde, a.hasta) is distinct from
              (dem.entero(x ->> 'sede'), v_dias, (x ->> 'ti')::smallint, (x ->> 'tf')::smallint, coalesce((x ->> 'activa')::boolean, true),
               nullif(x ->> 'desde', '')::date, nullif(x ->> 'hasta', '')::date)
            then v_ahora else a.modificada end
        where a.id = dem.entero(x ->> 'id');
      if not found then perform dem.error('No se encontró la asignación.'); end if;
    else
      insert into dem.asignaciones (persona_id, sede_id, dias, ti, tf, modalidad, valor, activa, desde, hasta, creada, modificada)
      values (dem.entero(x ->> 'c'), dem.entero(x ->> 'sede'), v_dias, (x ->> 'ti')::smallint, (x ->> 'tf')::smallint,
              x ->> 'modalidad', (x ->> 'valor')::integer, coalesce((x ->> 'activa')::boolean, true),
              nullif(x ->> 'desde', '')::date, nullif(x ->> 'hasta', '')::date, v_ahora, v_ahora);
    end if;
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p -> 'franjas', '[]'::jsonb)) loop
    v_dias := dem.dias_de(x -> 'dias');
    if dem.entero(x ->> 'id') is not null then
      update dem.franjas set dias = v_dias, ti = (x ->> 'ti')::smallint, tf = (x ->> 'tf')::smallint, dot = (x ->> 'dot')::smallint
       where id = dem.entero(x ->> 'id');
      if not found then perform dem.error('No se encontró la franja.'); end if;
    else
      insert into dem.franjas (sede_id, dias, ti, tf, dot)
      values (dem.entero(x ->> 'sede'), v_dias, (x ->> 'ti')::smallint, (x ->> 'tf')::smallint, (x ->> 'dot')::smallint);
    end if;
  end loop;
  delete from dem.franjas where id in (select dem.entero(v) from jsonb_array_elements_text(coalesce(p -> 'franjasQuitar', '[]'::jsonb)) v);

  for x in select * from jsonb_array_elements(coalesce(p -> 'licencias', '[]'::jsonb)) loop
    if (x ->> 'tipo') is null or (x ->> 'tipo') not in ('vacaciones', 'licencia', 'franco') then perform dem.error('Elegí el tipo de ausencia.'); end if;
    if exists (select 1 from dem.licencias l where l.persona_id = dem.entero(x ->> 'c')
                and l.desde <= (x ->> 'hasta')::date and (x ->> 'desde')::date <= l.hasta) then
      perform dem.error('Ya tiene una ausencia cargada en esas fechas.');
    end if;
    insert into dem.licencias (persona_id, tipo, desde, hasta)
    values (dem.entero(x ->> 'c'), x ->> 'tipo', (x ->> 'desde')::date, (x ->> 'hasta')::date);
  end loop;
  -- Al quitar una ausencia, los turnos de hoy que había justificado vuelven a esperar el fichaje.
  update dem.jornadas j set justif = null, licencia_id = null, cerrada = false
   where j.f = v_hoy and j.entrada is null
     and j.licencia_id in (select dem.entero(v) from jsonb_array_elements_text(coalesce(p -> 'licenciasQuitar', '[]'::jsonb)) v);
  delete from dem.licencias where id in (select dem.entero(v) from jsonb_array_elements_text(coalesce(p -> 'licenciasQuitar', '[]'::jsonb)) v);

  for x in select * from jsonb_array_elements(coalesce(p -> 'feriados', '[]'::jsonb)) loop
    if (x ->> 'tipo') is null or (x ->> 'tipo') not in ('feriado', 'no_laborable') then perform dem.error('Elegí si es feriado o día no laborable.'); end if;
    insert into dem.feriados (f, nombre, tipo, nota, propio)
    values ((x ->> 'f')::date, left(btrim(coalesce(x ->> 'nombre', '')), 80), x ->> 'tipo', coalesce(x ->> 'nota', ''), coalesce((x ->> 'propio')::boolean, false))
    on conflict (f) do update set nombre = excluded.nombre, tipo = excluded.tipo;
  end loop;
  delete from dem.feriados where f in (select v::date from jsonb_array_elements_text(coalesce(p -> 'feriadosQuitar', '[]'::jsonb)) v);

  if jsonb_typeof(p -> 'P') = 'object' then
    select c.p into v_p from dem.config c;
    for k in select jsonb_object_keys(v_lim) loop
      if (p -> 'P') ? k then
        n := (p -> 'P' ->> k)::numeric;
        if n is null or n <> round(n) or n < (v_lim -> k ->> 0)::numeric or n > (v_lim -> k ->> 1)::numeric then
          perform dem.error('Usá un número entre ' || (v_lim -> k ->> 0) || ' y ' || (v_lim -> k ->> 1) || '.');
        end if;
        v_p := v_p || jsonb_build_object(k, n::integer);
      end if;
    end loop;
    if (v_p ->> 'rojo')::integer < (v_p ->> 'gracia')::integer then
      perform dem.error('La demora que pasa a rojo no puede ser menor que la gracia de llegada.');
    end if;
    update dem.config set p = v_p where id;
  end if;

  insert into dem.avisos (creado, texto)
  select v_ahora, left(v, 600) from jsonb_array_elements_text(coalesce(p -> 'avisos', '[]'::jsonb)) v where btrim(v) <> '';
  delete from dem.avisos where id not in (select id from dem.avisos order by id desc limit 20);

  insert into dem.cambios (momento, autor_id, que, datos) values (v_ahora, r.id, 'aplicar', p);
  perform dem.asegurar(true);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Alta o edición de una persona. El alta crea su ingreso con el DNI y la clave inicial.
create function public.admin_persona(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  q dem.personas;
  c dem.config;
  v_dni text := regexp_replace(coalesce(p ->> 'dni', ''), '[^0-9]', '', 'g');
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_apellido text := btrim(coalesce(p ->> 'apellido', ''));
  v_rol text := coalesce(p ->> 'rol', 'colaborador');
  v_activa boolean := coalesce((p ->> 'activa')::boolean, true);
  v_auth uuid;
begin
  if v_dni !~ '^[0-9]{6,9}$' then perform dem.error('Escribí el DNI solo con números, sin puntos.'); end if;
  if v_nombre = '' then perform dem.error('Escribí el nombre.'); end if;
  if length(v_nombre) > 30 or length(v_apellido) > 40 then perform dem.error('El nombre es demasiado largo.'); end if;
  if v_rol not in ('colaborador', 'supervisor', 'admin') then perform dem.error('Elegí el rol.'); end if;
  select * into c from dem.config;

  if dem.entero(p ->> 'id') is not null then
    select * into q from dem.personas where id = dem.entero(p ->> 'id') for update;
    if not found then perform dem.error('No se encontró la persona.'); end if;
    if exists (select 1 from dem.personas where dni = v_dni and id <> q.id) then perform dem.error('Ya hay otra persona con ese DNI.'); end if;
    if q.rol = 'admin' and (v_rol <> 'admin' or not v_activa)
       and not exists (select 1 from dem.personas where rol = 'admin' and activa and id <> q.id) then
      perform dem.error('Tiene que quedar al menos una persona activa con rol de administración.');
    end if;
    update dem.personas set dni = v_dni, nombre = v_nombre, apellido = v_apellido, rol = v_rol, activa = v_activa where id = q.id;
    if q.auth_id is not null and v_dni <> q.dni then perform dem.cambiar_dni(q.auth_id, v_dni); end if;
    if q.auth_id is not null and q.activa and not v_activa then perform dem.cerrar_sesiones(q.auth_id); end if;
  else
    if c.clave_inicial is null then perform dem.error('Antes de dar de alta personas, definí la clave inicial.'); end if;
    if exists (select 1 from dem.personas where dni = v_dni) then perform dem.error('Ya hay una persona con ese DNI.'); end if;
    v_auth := dem.crear_acceso(v_dni, c.clave_inicial);
    insert into dem.personas (auth_id, dni, nombre, apellido, rol, activa, creada)
    values (v_auth, v_dni, v_nombre, v_apellido, v_rol, true, dem.reloj());
  end if;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'persona', p - 'dni');
  perform dem.asegurar(true);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Vuelve la clave de una persona a la inicial y le pide cambiarla en el próximo ingreso.
create function public.admin_restablecer(p_persona integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  q dem.personas;
  c dem.config;
begin
  select * into c from dem.config;
  select * into q from dem.personas where id = p_persona for update;
  if not found then perform dem.error('No se encontró la persona.'); end if;
  if q.id = r.id then perform dem.error('Tu propia clave se cambia desde tu menú, con Cambiar clave.'); end if;
  if c.clave_inicial is null then perform dem.error('Primero definí la clave inicial.'); end if;
  if q.auth_id is null then
    update dem.personas set auth_id = dem.crear_acceso(q.dni, c.clave_inicial), debe_cambiar_clave = true where id = q.id;
  else
    perform dem.poner_clave(q.auth_id, c.clave_inicial);
    update dem.personas set debe_cambiar_clave = true where id = q.id;
  end if;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'restablecer', jsonb_build_object('persona', q.id));
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Teléfono registrado de una persona: liberarlo (el próximo que use queda registrado) o aceptar el nuevo.
create function public.admin_telefono(p_persona integer, p_accion text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  v_nuevo integer;
begin
  if p_accion = 'liberar' then
    delete from dem.dispositivos where persona_id = p_persona;
  elsif p_accion = 'aceptar' then
    select id into v_nuevo from dem.dispositivos where persona_id = p_persona and estado = 'otro' order by visto desc limit 1;
    if v_nuevo is null then perform dem.error('No hay un teléfono nuevo para aceptar.'); end if;
    delete from dem.dispositivos where persona_id = p_persona and id <> v_nuevo;
    update dem.dispositivos set estado = 'registrado' where id = v_nuevo;
  else
    perform dem.error('Elegí qué hacer con el teléfono.');
  end if;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'telefono', jsonb_build_object('persona', p_persona, 'accion', p_accion));
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- La clave genérica de las altas. Quien todavía no la cambió pasa a tener la nueva.
create function public.admin_clave_inicial(p_clave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  q record;
begin
  if p_clave is null or length(p_clave) < 6 or length(p_clave) > 40 or p_clave <> btrim(p_clave) then
    perform dem.error('La clave inicial tiene que tener entre 6 y 40 caracteres, sin espacios al principio ni al final.');
  end if;
  update dem.config set clave_inicial = p_clave where id;
  for q in select auth_id from dem.personas where debe_cambiar_clave and auth_id is not null loop
    perform dem.poner_clave(q.auth_id, p_clave);
  end loop;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'clave_inicial', null);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

create function public.admin_sede(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_dir text := left(btrim(coalesce(p ->> 'direccion', '')), 160);
  v_lat double precision := nullif(btrim(coalesce(p ->> 'lat', '')), '')::double precision;
  v_lon double precision := nullif(btrim(coalesce(p ->> 'lon', '')), '')::double precision;
  v_radio integer := coalesce(dem.entero(p ->> 'radio'), 150);
  v_ver text := coalesce(p ->> 'verificacion', 'pantalla');
  v_activa boolean := coalesce((p ->> 'activa')::boolean, true);
begin
  if v_nombre = '' or length(v_nombre) > 60 then perform dem.error('Escribí el nombre de la sede.'); end if;
  if (v_lat is null) <> (v_lon is null) or v_lat not between -90 and 90 or v_lon not between -180 and 180 then
    perform dem.error('Revisá la ubicación: hacen falta latitud y longitud.');
  end if;
  if v_radio < 30 or v_radio > 2000 then perform dem.error('El radio va de 30 a 2000 metros.'); end if;
  if v_ver not in ('pantalla', 'impreso', 'ubicacion') then perform dem.error('Elegí cómo se verifica el fichaje.'); end if;
  if dem.entero(p ->> 'id') is not null then
    update dem.sedes set nombre = v_nombre, direccion = v_dir, lat = v_lat, lon = v_lon, radio_m = v_radio, verificacion = v_ver, activa = v_activa
     where id = dem.entero(p ->> 'id');
    if not found then perform dem.error('No se encontró la sede.'); end if;
  else
    insert into dem.sedes (nombre, direccion, lat, lon, radio_m, verificacion) values (v_nombre, v_dir, v_lat, v_lon, v_radio, v_ver);
  end if;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'sede', p);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Cambia los códigos de una sede: los QR impresos y los códigos que ya circularon dejan de servir.
create function public.admin_sede_codigo(p_sede integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r dem.personas := dem.exigir('admin');
begin
  update dem.sedes set secreto = extensions.gen_random_bytes(20), codigo_fijo = encode(extensions.gen_random_bytes(9), 'hex') where id = p_sede;
  if not found then perform dem.error('No se encontró la sede.'); end if;
  insert into dem.cambios (momento, autor_id, que, datos) values (dem.reloj(), r.id, 'sede_codigo', jsonb_build_object('sede', p_sede));
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Código de un solo uso para vincular una pantalla (tablet, computadora o teléfono de la sede). Vale 15 minutos.
create function public.admin_vincular(p_sede integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('admin');
  v_cod text := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 100000000)::text, 8, '0');
begin
  if not exists (select 1 from dem.sedes where id = p_sede) then perform dem.error('No se encontró la sede.'); end if;
  delete from dem.vinculos where vence < dem.reloj() or sede_id = p_sede;
  insert into dem.vinculos (codigo_hash, sede_id, vence, creado_por) values (dem.huella(v_cod), p_sede, dem.reloj() + interval '15 minutes', r.id);
  return jsonb_build_object('ok', true, 'codigo', v_cod, 'minutos', 15);
end $$;

create function public.admin_pantalla(p_id integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r dem.personas := dem.exigir('admin');
begin
  update dem.pantallas set revocada = true where id = p_id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- La pantalla de la sede se vincula con el código de administración y recibe una llave propia.
create function public.pantalla_vincular(p_codigo text, p_nombre text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cod text := regexp_replace(coalesce(p_codigo, ''), '[^0-9]', '', 'g');
  v dem.vinculos;
  v_token text;
  n integer;
begin
  select count(*) into n from dem.intentos where clave = 'v' and momento > dem.reloj() - interval '15 minutes';
  if n >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
  end if;
  select * into v from dem.vinculos where codigo_hash = dem.huella(v_cod) and vence > dem.reloj();
  if not found or v_cod = '' then
    insert into dem.intentos (clave, momento) values ('v', dem.reloj());
    return jsonb_build_object('ok', false, 'error', 'Ese código no es válido o ya venció. Pedí uno nuevo en Administración.');
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into dem.pantallas (sede_id, token_hash, nombre, creada, vista)
  values (v.sede_id, dem.huella(v_token), left(btrim(coalesce(p_nombre, '')), 60), dem.reloj(), dem.reloj());
  delete from dem.vinculos where codigo_hash = v.codigo_hash;
  return jsonb_build_object('ok', true, 'token', v_token);
end $$;

-- Lo que la pantalla necesita para mostrar el código: el secreto de su sede y la hora del servidor.
create function public.pantalla_estado(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t dem.pantallas;
  s dem.sedes;
begin
  select * into t from dem.pantallas where token_hash = dem.huella(coalesce(p_token, '')) and not revocada;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esta pantalla ya no está vinculada. Pedí un código nuevo en Administración.');
  end if;
  select * into s from dem.sedes where id = t.sede_id;
  update dem.pantallas set vista = dem.reloj() where id = t.id;
  return jsonb_build_object('ok', true, 'sede', s.nombre, 'sedeId', s.id::text, 'verificacion', s.verificacion, 'activa', s.activa,
    'secreto', encode(s.secreto, 'base64'), 'fijo', s.codigo_fijo, 'periodo', 30,
    'ts', floor(extract(epoch from dem.reloj()) * 1000)::bigint);
end $$;

revoke all on function public.admin_aplicar(jsonb) from public, anon;
revoke all on function public.admin_persona(jsonb) from public, anon;
revoke all on function public.admin_restablecer(integer) from public, anon;
revoke all on function public.admin_telefono(integer, text) from public, anon;
revoke all on function public.admin_clave_inicial(text) from public, anon;
revoke all on function public.admin_sede(jsonb) from public, anon;
revoke all on function public.admin_sede_codigo(integer) from public, anon;
revoke all on function public.admin_vincular(integer) from public, anon;
revoke all on function public.admin_pantalla(integer) from public, anon;
revoke all on function public.pantalla_vincular(text, text) from public;
revoke all on function public.pantalla_estado(text) from public;
grant execute on function public.admin_aplicar(jsonb) to authenticated;
grant execute on function public.admin_persona(jsonb) to authenticated;
grant execute on function public.admin_restablecer(integer) to authenticated;
grant execute on function public.admin_telefono(integer, text) to authenticated;
grant execute on function public.admin_clave_inicial(text) to authenticated;
grant execute on function public.admin_sede(jsonb) to authenticated;
grant execute on function public.admin_sede_codigo(integer) to authenticated;
grant execute on function public.admin_vincular(integer) to authenticated;
grant execute on function public.admin_pantalla(integer) to authenticated;
grant execute on function public.pantalla_vincular(text, text) to anon, authenticated;
grant execute on function public.pantalla_estado(text) to anon, authenticated;

notify pgrst, 'reload schema';
