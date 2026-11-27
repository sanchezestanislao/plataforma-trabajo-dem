-- Utilidades, generación de turnos del día y lectura del estado según el rol.

create function dem.zona() returns text language sql immutable set search_path = '' as
$$ select 'America/Argentina/Mendoza'::text $$;

-- La hora del servidor. Solo una sesión de mantenimiento (usuario postgres) puede fijarla, para las pruebas.
create function dem.reloj() returns timestamptz language plpgsql stable set search_path = '' as $$
declare v text;
begin
  if session_user = 'postgres' then
    v := nullif(current_setting('dem.reloj', true), '');
    if v is not null then return v::timestamptz; end if;
  end if;
  return now();
end $$;

create function dem.hoy() returns date language sql stable set search_path = '' as
$$ select (dem.reloj() at time zone dem.zona())::date $$;

-- Minutos desde las 00:00 del día `p_f` hasta el instante `p_ts`, en hora de Mendoza.
create function dem.rel(p_ts timestamptz, p_f date) returns integer language sql stable set search_path = '' as
$$ select floor(extract(epoch from ((p_ts at time zone dem.zona()) - p_f::timestamp)) / 60)::integer $$;

create function dem.instante(p_f date, p_min integer) returns timestamptz language sql stable set search_path = '' as
$$ select (p_f::timestamp + make_interval(mins => p_min)) at time zone dem.zona() $$;

create function dem.hm(p_min integer) returns text language sql immutable set search_path = '' as $$
  select case when p_min is null then 'Sin marcar' else
    lpad(((((p_min % 1440) + 1440) % 1440) / 60)::text, 2, '0') || ':' || lpad(((((p_min % 1440) + 1440) % 1440) % 60)::text, 2, '0') end
$$;

create function dem.dur(p_min integer) returns text language sql immutable set search_path = '' as $$
  select case
    when m / 60 > 0 and m % 60 > 0 then (m / 60) || ' h ' || (m % 60) || ' min'
    when m / 60 > 0 then (m / 60) || ' h'
    else (m % 60) || ' min' end
  from (select greatest(coalesce(p_min, 0), 0) as m) x
$$;

create function dem.fecha_corta(p_f date) returns text language sql immutable set search_path = '' as
$$ select (array['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'])[extract(dow from p_f)::integer + 1] || ' ' || extract(day from p_f)::integer $$;

-- Un error que la aplicación le muestra tal cual a la persona.
create function dem.error(p_texto text) returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'DEM01', message = p_texto;
end $$;

create function dem.huella(p_texto text) returns text language sql immutable set search_path = '' as
$$ select encode(extensions.digest(p_texto, 'sha256'), 'hex') $$;

-- Quién llama. Sin sesión, de baja o con la clave inicial sin cambiar, no pasa.
create function dem.yo(p_pendiente boolean default false) returns dem.personas language plpgsql stable set search_path = '' as $$
declare
  r dem.personas;
  u uuid := auth.uid();
begin
  if u is null then
    raise exception using errcode = 'DEM02', message = 'Ingresá de nuevo para seguir.';
  end if;
  select * into r from dem.personas where auth_id = u;
  if not found or not r.activa then
    raise exception using errcode = 'DEM02', message = 'Tu acceso no está habilitado. Hablá con administración.';
  end if;
  if r.debe_cambiar_clave and not p_pendiente then
    raise exception using errcode = 'DEM03', message = 'Antes de seguir, cambiá tu clave.';
  end if;
  return r;
end $$;

create function dem.exigir(variadic p_roles text[]) returns dem.personas language plpgsql stable set search_path = '' as $$
declare r dem.personas := dem.yo();
begin
  if not (r.rol = any (p_roles)) then
    raise exception using errcode = 'DEM04', message = 'No tenés permiso para hacer esto.';
  end if;
  return r;
end $$;

-- Código de seis dígitos de una sede para un paso de 30 segundos (TOTP con HMAC-SHA256).
create function dem.totp(p_secreto bytea, p_paso bigint) returns text language plpgsql immutable set search_path = '' as $$
declare
  h bytea := extensions.hmac(int8send(p_paso), p_secreto, 'sha256');
  o integer := get_byte(h, length(h) - 1) & 15;
  n bigint;
begin
  n := ((get_byte(h, o) & 127)::bigint << 24) | (get_byte(h, o + 1)::bigint << 16) | (get_byte(h, o + 2)::bigint << 8) | get_byte(h, o + 3)::bigint;
  return lpad((n % 1000000)::text, 6, '0');
end $$;

create function dem.paso() returns bigint language sql stable set search_path = '' as
$$ select floor(extract(epoch from dem.reloj()) / 30)::bigint $$;

-- Distancia en metros entre dos puntos.
create function dem.distancia(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))))
$$;

-- Un turno por cada asignación que trabaja ese día. Quien tiene una ausencia cargada queda justificado.
-- No se generan turnos que ya habían terminado cuando se cargó o cambió la asignación.
create function dem.generar_dia(p_f date) returns void language sql set search_path = '' as $$
  insert into dem.jornadas (asignacion_id, persona_id, sede_id, f, ti, tf, justif, licencia_id, cerrada)
  select a.id, a.persona_id, a.sede_id, p_f, a.ti, a.tf, l.tipo, l.id, l.id is not null
    from dem.asignaciones a
    join dem.personas p on p.id = a.persona_id and p.activa
    left join lateral (
      select x.id, x.tipo from dem.licencias x
       where x.persona_id = a.persona_id and x.desde <= p_f and p_f <= x.hasta
       order by x.desde limit 1) l on true
   where a.activa
     and extract(isodow from p_f)::smallint = any (a.dias)
     and (a.desde is null or p_f >= a.desde) and (a.hasta is null or p_f <= a.hasta)
     and greatest(a.creada, a.modificada) < dem.instante(p_f, a.tf)
  on conflict (asignacion_id, f) do nothing
$$;

-- Deja el día al día: genera los turnos que faltan, sigue los cambios de asignaciones y licencias,
-- y cierra solo lo que quedó abierto. Corre a lo sumo una vez por minuto, salvo que se fuerce.
create function dem.asegurar(p_forzar boolean default false) returns void language plpgsql set search_path = '' as $$
declare
  v_ahora timestamptz := dem.reloj();
  v_hoy date := dem.hoy();
  c dem.config;
  d date;
begin
  select * into c from dem.config;
  if not p_forzar and c.generado_hasta = v_hoy and c.asegurado is not null
     and c.asegurado <= v_ahora and c.asegurado > v_ahora - interval '1 minute' then
    return;
  end if;
  if not pg_try_advisory_xact_lock(74120011) then
    return;
  end if;

  d := greatest(coalesce(c.generado_hasta + 1, v_hoy), v_hoy - 31);
  while d < v_hoy loop
    perform dem.generar_dia(d);
    d := d + 1;
  end loop;
  perform dem.generar_dia(v_hoy);

  -- Turnos de hoy sin empezar: se van si la asignación ya no corresponde, o toman su horario nuevo.
  delete from dem.jornadas j
   using dem.asignaciones a, dem.personas p
   where j.asignacion_id = a.id and p.id = j.persona_id
     and j.f = v_hoy and j.entrada is null and not j.cerrada and j.justif is null
     and not (p.activa and a.activa and extract(isodow from v_hoy)::smallint = any (a.dias)
              and (a.desde is null or v_hoy >= a.desde) and (a.hasta is null or v_hoy <= a.hasta));
  update dem.jornadas j set ti = a.ti, tf = a.tf, sede_id = a.sede_id
    from dem.asignaciones a
   where j.asignacion_id = a.id and j.f = v_hoy and j.entrada is null and not j.cerrada and j.justif is null
     and (j.ti, j.tf, j.sede_id) is distinct from (a.ti, a.tf, a.sede_id);

  -- Ausencias cargadas sobre turnos de hoy que no empezaron.
  update dem.jornadas j set justif = l.tipo, licencia_id = l.id, cerrada = true
    from dem.licencias l
   where j.f = v_hoy and not j.cerrada and j.entrada is null and j.justif is null
     and l.persona_id = j.persona_id and l.desde <= v_hoy and v_hoy <= l.hasta;

  -- Cierre automático: sin entrada, cuando termina el turno; con entrada y sin salida, seis horas después.
  update dem.jornadas j
     set cerrada = true,
         metodo_out = case when j.entrada is not null and j.salida is null then 'auto' else j.metodo_out end
   where not j.cerrada
     and v_ahora >= dem.instante(j.f, j.tf + case when j.entrada is null then 0 else 360 end);

  delete from dem.intentos where momento < v_ahora - interval '1 day';
  update dem.config set generado_hasta = v_hoy, asegurado = v_ahora where id;
end $$;

create function dem.yo_json(r dem.personas) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id', r.id::text, 'nombre', r.nombre, 'apellido', r.apellido, 'rol', r.rol,
    'debeCambiarClave', r.debe_cambiar_clave,
    'colab', exists (select 1 from dem.asignaciones a where a.persona_id = r.id and a.activa))
$$;

-- Todo lo que la aplicación necesita para dibujar, recortado según el rol de quien llama.
create function dem.estado_de(r dem.personas) returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_ahora timestamptz := dem.reloj();
  v_hoy date := dem.hoy();
  v_staff boolean := r.rol in ('supervisor', 'admin');
  v_admin boolean := r.rol = 'admin';
  v_desde date;
  c dem.config;
  o jsonb;
begin
  select * into c from dem.config;
  v_desde := case when v_staff then (date_trunc('month', v_hoy) - interval '1 month')::date
                  else (date_trunc('month', v_hoy) - interval '7 days')::date end;

  o := jsonb_build_object(
    'v', 1,
    'yo', dem.yo_json(r),
    'hoy', v_hoy,
    'ahora', dem.rel(v_ahora, v_hoy),
    'ts', floor(extract(epoch from v_ahora) * 1000)::bigint,
    'P', c.p,
    'ref', c.ref);

  o := o || jsonb_build_object('sedes', (
    select coalesce(jsonb_agg(
      case when v_admin then jsonb_build_object(
        'id', s.id::text, 'nombre', s.nombre, 'verificacion', s.verificacion, 'activa', s.activa,
        'direccion', s.direccion, 'lat', s.lat, 'lon', s.lon, 'radio', s.radio_m, 'fijo', s.codigo_fijo,
        'pantallas', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', t.id::text, 'nombre', t.nombre,
            'hace', case when t.vista is null then null else floor(extract(epoch from (v_ahora - t.vista)) / 60)::integer end)
            order by t.id), '[]'::jsonb)
            from dem.pantallas t where t.sede_id = s.id and not t.revocada))
      else jsonb_build_object('id', s.id::text, 'nombre', s.nombre, 'verificacion', s.verificacion, 'activa', s.activa) end
      order by s.nombre, s.id), '[]'::jsonb)
      from dem.sedes s
     where v_admin
        or (v_staff and (s.activa or exists (select 1 from dem.jornadas j where j.sede_id = s.id and j.f >= v_desde)))
        or exists (select 1 from dem.asignaciones a where a.sede_id = s.id and a.persona_id = r.id)));

  o := o || jsonb_build_object('colabs', (
    select coalesce(jsonb_agg(
      case when v_admin then jsonb_build_object(
        'id', p.id::text, 'nombre', p.nombre, 'apellido', p.apellido, 'rol', p.rol, 'activa', p.activa,
        'dni', p.dni, 'acceso', case when p.debe_cambiar_clave then 'pendiente' else 'activo' end,
        'uso', (p.ultimo_uso at time zone dem.zona())::date,
        'tel', (
          select jsonb_build_object('nombre', d.nombre, 'desde', (d.alta at time zone dem.zona())::date)
            from dem.dispositivos d where d.persona_id = p.id and d.estado = 'registrado'
           order by d.alta limit 1),
        'telOtros', (select count(*) from dem.dispositivos x where x.persona_id = p.id and x.estado = 'otro'))
      else jsonb_build_object('id', p.id::text, 'nombre', p.nombre, 'apellido', p.apellido, 'rol', p.rol, 'activa', p.activa) end
      order by p.apellido, p.nombre, p.id), '[]'::jsonb)
      from dem.personas p
     where v_staff or p.id = r.id));

  o := o || jsonb_build_object('asigs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id::text, 'c', a.persona_id::text, 'sede', a.sede_id::text, 'dias', to_jsonb(a.dias),
      'ti', a.ti, 'tf', a.tf, 'modalidad', a.modalidad, 'valor', case when v_admin then a.valor else 0 end,
      'activa', a.activa, 'desde', a.desde, 'hasta', a.hasta) order by a.id), '[]'::jsonb)
      from dem.asignaciones a
     where v_staff or a.persona_id = r.id));

  o := o || jsonb_build_object('franjas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id::text, 'sede', x.sede_id::text, 'dias', to_jsonb(x.dias), 'ti', x.ti, 'tf', x.tf, 'dot', x.dot)
      order by x.id), '[]'::jsonb)
      from dem.franjas x where v_staff));

  o := o || jsonb_build_object('licencias', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id::text, 'c', l.persona_id::text, 'tipo', l.tipo, 'desde', l.desde, 'hasta', l.hasta) order by l.desde, l.id), '[]'::jsonb)
      from dem.licencias l
     where l.hasta >= v_hoy - 90 and (v_staff or l.persona_id = r.id)));

  o := o || jsonb_build_object('feriados', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'f', x.f, 'nombre', x.nombre, 'tipo', x.tipo, 'nota', x.nota, 'propio', x.propio) order by x.f), '[]'::jsonb)
      from dem.feriados x where x.f >= date_trunc('month', v_desde)::date));

  o := o || jsonb_build_object('jornadas', (
    select coalesce(jsonb_agg(x.o order by x.f, x.ti, x.id), '[]'::jsonb)
      from (
        select j.f, j.ti, j.id, jsonb_strip_nulls(jsonb_build_object(
          'id', j.id::text, 'a', j.asignacion_id::text, 'c', j.persona_id::text, 'f', j.f, 'sede', j.sede_id::text,
          'ti', j.ti, 'tf', j.tf,
          'entrada', case when j.entrada is null then null else dem.rel(j.entrada, j.f) end,
          'salida', case when j.salida is null then null else dem.rel(j.salida, j.f) end,
          'metodoIn', j.metodo_in, 'metodoOut', j.metodo_out,
          'cerrada', j.cerrada, 'conf', j.conf, 'decl', j.decl, 'rev', j.rev, 'salidaVal', j.salida_val,
          'justif', j.justif, 'lic', j.licencia_id::text, 'descargo', j.descargo,
          'ubiIn', (select jsonb_build_object('g', m.geo, 'd', round(m.distancia_m), 't', m.dispositivo)
                      from dem.marcas m where m.jornada_id = j.id and m.tipo = 'entrada' and not m.anulada and m.via <> 'supervisor'
                     order by m.id desc limit 1),
          'ubiOut', (select jsonb_build_object('g', m.geo, 'd', round(m.distancia_m), 't', m.dispositivo)
                       from dem.marcas m where m.jornada_id = j.id and m.tipo = 'salida' and not m.anulada and m.via <> 'supervisor'
                      order by m.id desc limit 1))) as o
          from dem.jornadas j
         where (v_staff and j.f >= v_desde)
            or (j.persona_id = r.id and (j.f >= v_desde
                 or (j.cerrada and j.entrada is not null and j.salida is null and j.rev is null and j.decl is null and j.justif is null)))
      ) x));

  o := o || jsonb_build_object('novedades', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id::text, 'c', n.persona_id::text, 'sede', n.sede_id::text, 'tipo', n.tipo, 'crit', n.crit, 'texto', n.texto,
      'foto', n.foto, 'f', (n.creada at time zone dem.zona())::date,
      'm', dem.rel(n.creada, (n.creada at time zone dem.zona())::date), 'estado', n.estado) order by n.creada desc, n.id desc), '[]'::jsonb)
      from dem.novedades n
     where (v_staff or n.persona_id = r.id) and (n.estado <> 'resuelta' or n.creada >= v_ahora - interval '60 days')));

  if v_staff then
    o := o || jsonb_build_object(
      'bitacora', (
        select coalesce(jsonb_agg(x.o order by x.id desc), '[]'::jsonb)
          from (select b.id, jsonb_build_object(
                  'id', b.id::text, 'f', (b.creada at time zone dem.zona())::date,
                  'm', dem.rel(b.creada, (b.creada at time zone dem.zona())::date),
                  'tipo', b.tipo, 'j', b.jornada_id::text, 'texto', b.texto) as o
                  from dem.bitacora b order by b.id desc limit 40) x),
      'avisos', (
        select coalesce(jsonb_agg(x.o order by x.id desc), '[]'::jsonb)
          from (select v.id, jsonb_build_object(
                  'id', v.id::text, 'f', (v.creado at time zone dem.zona())::date,
                  'm', dem.rel(v.creado, (v.creado at time zone dem.zona())::date), 'texto', v.texto) as o
                  from dem.avisos v order by v.id desc limit 20) x),
      'marcas', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id::text, 'j', m.jornada_id::text, 'c', m.persona_id::text, 'sede', j.sede_id::text, 'tipo', m.tipo,
          'f', (m.momento at time zone dem.zona())::date,
          'm', dem.rel(m.momento, (m.momento at time zone dem.zona())::date),
          'geo', m.geo, 'dist', round(m.distancia_m), 'tel', m.dispositivo, 'con', m.comparte_con::text) order by m.id desc), '[]'::jsonb)
          from dem.marcas m join dem.jornadas j on j.id = m.jornada_id
         where not m.revisada and not m.anulada and m.momento >= v_ahora - interval '21 days'
           and (m.geo = 'lejos' or m.dispositivo in ('otro', 'compartido'))));
  else
    o := o || jsonb_build_object('bitacora', '[]'::jsonb, 'avisos', '[]'::jsonb, 'marcas', '[]'::jsonb);
  end if;

  if v_admin then
    o := o || jsonb_build_object('claveInicial', c.clave_inicial is not null);
  end if;
  return o;
end $$;

create function public.estado() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r dem.personas := dem.yo(true);
begin
  if r.debe_cambiar_clave then
    return jsonb_build_object('v', 1, 'yo', dem.yo_json(r), 'ts', floor(extract(epoch from dem.reloj()) * 1000)::bigint);
  end if;
  perform dem.asegurar(false);
  if r.ultimo_uso is null or r.ultimo_uso < now() - interval '30 minutes' then
    update dem.personas set ultimo_uso = now() where id = r.id;
  end if;
  return dem.estado_de(r);
end $$;

revoke all on function public.estado() from public, anon;
grant execute on function public.estado() to authenticated;
