-- Lo que hace cada persona sobre sus propios turnos: fichar, declarar, avisar y cargar novedades.

-- Entrada o salida. La hora es la del servidor. Según la sede, pide el código de la pantalla (cambia cada 30 segundos),
-- el QR impreso o solo la ubicación. Siempre guarda la ubicación y el teléfono, y lo que no coincide queda
-- a la vista de supervisión.
create function public.fichar(
  p_jornada bigint, p_tipo text, p_codigo text default null, p_via text default null,
  p_lat double precision default null, p_lon double precision default null, p_precision double precision default null,
  p_dispositivo text default null, p_equipo text default null, p_datos jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo();
  j dem.jornadas;
  s dem.sedes;
  v_ahora timestamptz := dem.reloj();
  v_cod text := regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g');
  v_via text;
  v_ok boolean := false;
  v_n integer;
  v_lat double precision := p_lat;
  v_lon double precision := p_lon;
  v_dist double precision;
  v_geo text;
  v_disp dem.dispositivos;
  v_tel text := 'sin_dato';
  v_comparte integer;
  v_huella text;
  v_decl jsonb;
  v_conf boolean := false;
  v_hora integer;
  i integer;
begin
  if p_tipo is null or p_tipo not in ('entrada', 'salida') then perform dem.error('No se entendió el pedido.'); end if;
  perform dem.asegurar(true);
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or j.persona_id <> r.id then perform dem.error('No encontramos ese turno.'); end if;
  if j.justif is not null then perform dem.error('Ese turno figura justificado: no hace falta fichar.'); end if;
  if j.cerrada then perform dem.error('Ese turno ya está cerrado.'); end if;
  if p_tipo = 'entrada' and j.entrada is not null then perform dem.error('La entrada de este turno ya está registrada.'); end if;
  if p_tipo = 'salida' and j.entrada is null then perform dem.error('Primero marcá la entrada.'); end if;
  select * into s from dem.sedes where id = j.sede_id;

  select count(*) into v_n from dem.intentos where clave = 'f:' || r.id and momento > v_ahora - interval '10 minutes';
  if v_n >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos seguidos. Esperá unos minutos o pedile el fichaje asistido a tu supervisor.');
  end if;

  if v_lat is null or v_lon is null or v_lat not between -90 and 90 or v_lon not between -180 and 180 then
    v_lat := null; v_lon := null;
  end if;

  if s.verificacion = 'pantalla' then
    v_via := case when p_via = 'qr' then 'qr' else 'codigo' end;
    for i in -1..1 loop
      if dem.totp(s.secreto, dem.paso() + i) = v_cod then v_ok := true; end if;
    end loop;
    if not v_ok then
      insert into dem.intentos (clave, momento) values ('f:' || r.id, v_ahora);
      return jsonb_build_object('ok', false, 'error', 'El código no coincide o ya venció. Volvé a leer el QR de la pantalla.');
    end if;
  elsif s.verificacion = 'impreso' then
    v_via := 'impreso';
    if lower(v_cod) <> s.codigo_fijo then
      insert into dem.intentos (clave, momento) values ('f:' || r.id, v_ahora);
      return jsonb_build_object('ok', false, 'error', 'Ese QR no es el de esta sede.');
    end if;
  else
    v_via := 'ubicacion';
    if v_lat is null then
      return jsonb_build_object('ok', false, 'error', 'Para fichar en esta sede necesitamos tu ubicación. Activala en el teléfono y probá de nuevo.');
    end if;
  end if;

  if s.lat is null then
    v_geo := 'sin_sede';
  elsif v_lat is null then
    v_geo := 'sin_dato';
  else
    v_dist := dem.distancia(s.lat, s.lon, v_lat, v_lon);
    v_geo := case
      when v_dist <= s.radio_m + least(coalesce(p_precision, 0), 100) then 'ok'
      when v_dist - coalesce(p_precision, 0) > s.radio_m then 'lejos'
      else 'imprecisa' end;
  end if;
  if s.verificacion = 'ubicacion' and v_geo = 'lejos' then
    return jsonb_build_object('ok', false, 'error',
      'Tu teléfono figura a ' || case when v_dist >= 1000 then replace(round((v_dist / 1000)::numeric, 1)::text, '.', ',') || ' km' else round(v_dist)::text || ' m' end
      || ' de la sede. Si estás ahí, pedile el fichaje asistido a tu supervisor.');
  end if;

  if p_dispositivo is not null and length(p_dispositivo) between 16 and 80 then
    v_huella := dem.huella(p_dispositivo);
    select * into v_disp from dem.dispositivos where persona_id = r.id and huella = v_huella;
    if found then
      if v_disp.estado = 'bloqueado' then perform dem.error('Este teléfono no está habilitado para fichar. Hablá con tu supervisor.'); end if;
      update dem.dispositivos set visto = v_ahora where id = v_disp.id;
      v_tel := case when v_disp.estado = 'registrado' then 'registrado' else 'otro' end;
    elsif exists (select 1 from dem.dispositivos where persona_id = r.id) then
      insert into dem.dispositivos (persona_id, huella, nombre, estado, alta, visto)
      values (r.id, v_huella, left(coalesce(p_equipo, ''), 80), 'otro', v_ahora, v_ahora) returning * into v_disp;
      v_tel := 'otro';
    else
      insert into dem.dispositivos (persona_id, huella, nombre, estado, alta, visto)
      values (r.id, v_huella, left(coalesce(p_equipo, ''), 80), 'registrado', v_ahora, v_ahora) returning * into v_disp;
      v_tel := 'nuevo';
    end if;
    select d.persona_id into v_comparte from dem.dispositivos d
     where d.huella = v_huella and d.persona_id <> r.id and d.visto > v_ahora - interval '30 days'
     order by d.visto desc limit 1;
    if v_comparte is not null then v_tel := 'compartido'; end if;
  end if;

  if p_tipo = 'entrada' then
    update dem.jornadas set entrada = v_ahora, metodo_in = v_via where id = j.id;
  else
    if p_datos is not null and jsonb_typeof(p_datos) = 'object' then
      v_conf := coalesce((p_datos ->> 'conf')::boolean, false);
      if jsonb_typeof(p_datos -> 'decl') = 'object' then
        if coalesce(p_datos -> 'decl' ->> 'tipo', '') not in ('extra', 'olvido', 'otras') then perform dem.error('Elegí qué pasó con tus horas.'); end if;
        v_hora := case when (p_datos -> 'decl' ->> 'hora') ~ '^[0-9]{1,4}$' then (p_datos -> 'decl' ->> 'hora')::integer else null end;
        if p_datos -> 'decl' ->> 'tipo' = 'olvido' then
          if v_hora is null or v_hora <= dem.rel(j.entrada, j.f) or v_hora > dem.rel(v_ahora, j.f) then
            perform dem.error('La hora tiene que estar entre tu entrada y ahora.');
          end if;
        else
          v_hora := null;
        end if;
        v_decl := jsonb_build_object('tipo', p_datos -> 'decl' ->> 'tipo', 'hora', v_hora, 'texto', left(coalesce(p_datos -> 'decl' ->> 'texto', ''), 200));
        v_conf := false;
      end if;
    end if;
    update dem.jornadas set salida = greatest(v_ahora, j.entrada), metodo_out = v_via, cerrada = true, conf = v_conf, decl = v_decl where id = j.id;
  end if;

  insert into dem.marcas (jornada_id, persona_id, tipo, momento, via, lat, lon, precision_m, distancia_m, geo, dispositivo_id, dispositivo, comparte_con, autor_id)
  values (j.id, r.id, p_tipo, v_ahora, v_via, v_lat, v_lon, p_precision, v_dist, v_geo, v_disp.id, v_tel, v_comparte, r.id);

  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'jornada', j.id::text, 'hora', dem.rel(v_ahora, j.f),
    'geo', v_geo, 'distancia', round(v_dist), 'telefono', v_tel, 'estado', dem.estado_de(r));
end $$;

-- "Ya me fui de la sede": cierra el turno sin marca de salida y deja la hora declarada para que la valide supervisión.
create function public.salida_declarada(p_jornada bigint, p_hora integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo();
  j dem.jornadas;
  v_ahora timestamptz := dem.reloj();
begin
  perform dem.asegurar(true);
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or j.persona_id <> r.id then perform dem.error('No encontramos ese turno.'); end if;
  if j.cerrada or j.entrada is null then perform dem.error('Ese turno no está abierto.'); end if;
  if p_hora is null or p_hora <= dem.rel(j.entrada, j.f) or p_hora > dem.rel(v_ahora, j.f) then
    perform dem.error('La hora tiene que estar entre tu entrada de las ' || dem.hm(dem.rel(j.entrada, j.f)) || ' y ahora.');
  end if;
  update dem.jornadas set cerrada = true, metodo_out = 'declarada', conf = false,
         decl = jsonb_build_object('tipo', 'olvido', 'hora', p_hora, 'texto', '')
   where id = j.id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- El sistema cerró el turno solo y la persona avisa a qué hora terminó.
create function public.declarar_olvido(p_jornada bigint, p_hora integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo();
  j dem.jornadas;
begin
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or j.persona_id <> r.id then perform dem.error('No se encontró la jornada.'); end if;
  if not j.cerrada or j.entrada is null or j.salida is not null or j.rev is not null or j.justif is not null then
    perform dem.error('Ese turno ya no espera tu aviso.');
  end if;
  if p_hora is null then perform dem.error('Indicá a qué hora terminaste.'); end if;
  if p_hora <= dem.rel(j.entrada, j.f) or p_hora > j.tf + 1440 then
    perform dem.error('La salida tiene que ser posterior a tu entrada de las ' || dem.hm(dem.rel(j.entrada, j.f)) || '.');
  end if;
  update dem.jornadas set decl = jsonb_build_object('tipo', 'olvido', 'hora', p_hora, 'texto', '') where id = j.id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Aviso de la persona sobre un turno en rojo: llega a supervisión.
create function public.descargo(p_jornada bigint, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo();
  j dem.jornadas;
  t text := btrim(coalesce(p_texto, ''));
begin
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or j.persona_id <> r.id then perform dem.error('No se encontró la jornada.'); end if;
  if t = '' then perform dem.error('Escribí qué pasó antes de enviar.'); end if;
  update dem.jornadas set descargo = left(t, 280) where id = j.id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

create function public.novedad(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo();
  t text := btrim(coalesce(p ->> 'texto', ''));
  v_sede integer := case when (p ->> 'sede') ~ '^[0-9]+$' then (p ->> 'sede')::integer else null end;
begin
  if coalesce(p ->> 'tipo', '') not in ('infra', 'equipo', 'insumos', 'otra') then perform dem.error('Elegí de qué se trata.'); end if;
  if coalesce(p ->> 'crit', '') not in ('baja', 'media', 'alta') then perform dem.error('Elegí la urgencia.'); end if;
  if t = '' then perform dem.error('Contá qué pasó antes de enviar.'); end if;
  if v_sede is not null and not exists (select 1 from dem.sedes where id = v_sede) then v_sede := null; end if;
  if v_sede is not null and r.rol = 'colaborador'
     and not exists (select 1 from dem.asignaciones a where a.persona_id = r.id and a.sede_id = v_sede) then
    v_sede := null;
  end if;
  if v_sede is null then
    select a.sede_id into v_sede from dem.asignaciones a where a.persona_id = r.id order by a.activa desc, a.id limit 1;
  end if;
  insert into dem.novedades (persona_id, sede_id, tipo, crit, texto, foto, creada)
  values (r.id, v_sede, p ->> 'tipo', p ->> 'crit', left(t, 400), left(coalesce(p ->> 'foto', ''), 200), dem.reloj());
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

revoke all on function public.fichar(bigint, text, text, text, double precision, double precision, double precision, text, text, jsonb) from public, anon;
revoke all on function public.salida_declarada(bigint, integer) from public, anon;
revoke all on function public.declarar_olvido(bigint, integer) from public, anon;
revoke all on function public.descargo(bigint, text) from public, anon;
revoke all on function public.novedad(jsonb) from public, anon;
grant execute on function public.fichar(bigint, text, text, text, double precision, double precision, double precision, text, text, jsonb) to authenticated;
grant execute on function public.salida_declarada(bigint, integer) to authenticated;
grant execute on function public.declarar_olvido(bigint, integer) to authenticated;
grant execute on function public.descargo(bigint, text) to authenticated;
grant execute on function public.novedad(jsonb) to authenticated;
