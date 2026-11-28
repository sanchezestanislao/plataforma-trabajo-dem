-- Lo que hace supervisión (y también administración): resolver el control excedente, justificar inasistencias,
-- fichaje asistido, novedades, avisos y revisión de fichajes que no coinciden. Cada decisión queda en la bitácora.

create function dem.quien_donde(j dem.jornadas) returns text language sql stable set search_path = '' as $$
  select btrim(p.nombre || ' ' || p.apellido) || ', ' || dem.fecha_corta(j.f) || ' en ' || s.nombre
    from dem.personas p, dem.sedes s where p.id = j.persona_id and s.id = j.sede_id
$$;

create function public.sup_resolver(p_jornada bigint, p_tipo text, p_hora integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('supervisor', 'admin');
  j dem.jornadas;
  v_in integer;
  h integer;
begin
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found then perform dem.error('No se encontró la jornada.'); end if;
  if p_tipo is null or p_tipo not in ('extra', 'olvido', 'ajuste', 'ok') then perform dem.error('Elegí qué pasó.'); end if;
  if not j.cerrada or j.entrada is null or j.justif is not null then perform dem.error('Ese turno no está para resolver.'); end if;
  if j.rev is not null then perform dem.error('Ese turno ya fue resuelto. Actualizá la pantalla.'); end if;
  v_in := dem.rel(j.entrada, j.f);
  h := case when p_tipo = 'ok' then dem.rel(j.salida, j.f) else p_hora end;
  if h is null then perform dem.error('Indicá la salida validada.'); end if;
  if h <= v_in then perform dem.error('La salida tiene que ser posterior a la entrada de las ' || dem.hm(v_in) || '.'); end if;
  if p_tipo = 'extra' and h <= j.tf then
    perform dem.error('Para hora extra, la salida validada tiene que ser posterior a las ' || dem.hm(j.tf) || '.');
  end if;
  if h > j.tf + 1440 then perform dem.error('Revisá la hora de salida.'); end if;
  update dem.jornadas set rev = p_tipo, salida_val = h where id = j.id;
  insert into dem.bitacora (creada, tipo, jornada_id, autor_id, texto)
  values (dem.reloj(), 'rev', j.id, r.id, dem.quien_donde(j) || ': ' || case p_tipo
    when 'extra' then 'hora extra verificada, ' || dem.dur(h - j.tf)
    when 'olvido' then 'olvido de salida, validada a las ' || dem.hm(h)
    when 'ajuste' then 'salida corregida a las ' || dem.hm(h)
    else 'se mantiene el registro' end);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

create function public.sup_justificar(p_jornada bigint, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('supervisor', 'admin');
  j dem.jornadas;
begin
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or p_motivo is null or p_motivo not in ('licencia', 'vacaciones', 'aviso', 'franco') then perform dem.error('Elegí un motivo.'); end if;
  if not j.cerrada or j.entrada is not null or j.justif is not null then perform dem.error('Ese turno no figura como inasistencia.'); end if;
  update dem.jornadas set justif = p_motivo where id = j.id;
  insert into dem.bitacora (creada, tipo, jornada_id, autor_id, texto)
  values (dem.reloj(), 'justif', j.id, r.id, dem.quien_donde(j) || ': inasistencia justificada, ' || case p_motivo
    when 'aviso' then 'ausencia con aviso' else p_motivo end);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

create function public.sup_deshacer(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('supervisor', 'admin');
  b dem.bitacora;
begin
  select * into b from dem.bitacora where id = p_id for update;
  if not found then perform dem.error('Esa resolución ya no está.'); end if;
  if b.tipo = 'rev' then
    update dem.jornadas set rev = null, salida_val = null where id = b.jornada_id;
  elsif b.tipo = 'justif' then
    update dem.jornadas set justif = null where id = b.jornada_id and licencia_id is null;
  else
    perform dem.error('Eso no se puede deshacer.');
  end if;
  delete from dem.bitacora where id = b.id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Fichaje asistido: el supervisor registra la entrada o la salida de alguien con la hora del servidor.
create function public.sup_asistido(p_jornada bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('supervisor', 'admin');
  j dem.jornadas;
  v_ahora timestamptz := dem.reloj();
  v_que text;
  v_quien text;
begin
  perform dem.asegurar(true);
  select * into j from dem.jornadas where id = p_jornada for update;
  if not found or j.cerrada or j.justif is not null then perform dem.error('Ese turno ya no admite fichaje asistido.'); end if;
  select btrim(p.nombre || ' ' || p.apellido) || ' en ' || s.nombre into v_quien
    from dem.personas p, dem.sedes s where p.id = j.persona_id and s.id = j.sede_id;
  if j.entrada is null then
    v_que := 'entrada';
    update dem.jornadas set entrada = v_ahora, metodo_in = 'supervisor' where id = j.id;
  else
    v_que := 'salida';
    update dem.jornadas set salida = greatest(v_ahora, j.entrada), metodo_out = 'supervisor', cerrada = true where id = j.id;
  end if;
  insert into dem.marcas (jornada_id, persona_id, tipo, momento, via, geo, dispositivo, autor_id, revisada)
  values (j.id, j.persona_id, v_que, v_ahora, 'supervisor', 'sin_dato', 'sin_dato', r.id, true);
  insert into dem.bitacora (creada, tipo, jornada_id, autor_id, texto)
  values (v_ahora, 'asistido', j.id, r.id, v_quien || ': ' || v_que || ' asistida a las ' || dem.hm(dem.rel(v_ahora, j.f)));
  return jsonb_build_object('ok', true, 'que', v_que, 'estado', dem.estado_de(r));
end $$;

create function public.sup_novedad(p_id bigint, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r dem.personas := dem.exigir('supervisor', 'admin');
begin
  if p_estado is null or p_estado not in ('abierta', 'en_curso', 'resuelta') then perform dem.error('Elegí el estado.'); end if;
  update dem.novedades set estado = p_estado where id = p_id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

create function public.sup_aviso(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r dem.personas := dem.exigir('supervisor', 'admin');
begin
  delete from dem.avisos where id = p_id;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

-- Un fichaje que no coincide (lejos de la sede, otro teléfono): darlo por visto o anularlo.
-- Al anular, la entrada o la salida se borra y el turno vuelve a quedar pendiente de esa marca.
create function public.sup_marca(p_id bigint, p_accion text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.exigir('supervisor', 'admin');
  m dem.marcas;
  j dem.jornadas;
begin
  select * into m from dem.marcas where id = p_id for update;
  if not found or m.anulada then perform dem.error('Ese fichaje ya no está para revisar.'); end if;
  if p_accion = 'visto' then
    update dem.marcas set revisada = true where id = m.id;
  elsif p_accion = 'anular' then
    select * into j from dem.jornadas where id = m.jornada_id for update;
    if j.rev is not null then perform dem.error('Ese turno ya fue resuelto. Deshacé la resolución antes de anular el fichaje.'); end if;
    update dem.marcas set revisada = true, anulada = true where id = m.id;
    if m.tipo = 'entrada' then
      update dem.marcas set anulada = true, revisada = true where jornada_id = j.id and tipo = 'salida' and not anulada;
      update dem.jornadas set entrada = null, metodo_in = null, salida = null, metodo_out = null, cerrada = false, conf = false, decl = null
       where id = j.id;
    else
      update dem.jornadas set salida = null, metodo_out = null, cerrada = false, conf = false, decl = null where id = j.id;
    end if;
    insert into dem.bitacora (creada, tipo, jornada_id, autor_id, texto)
    values (dem.reloj(), 'marca', j.id, r.id, dem.quien_donde(j) || ': fichaje de ' || m.tipo || ' anulado por supervisión');
    perform dem.asegurar(true);
  else
    perform dem.error('Elegí qué hacer con el fichaje.');
  end if;
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

revoke all on function public.sup_resolver(bigint, text, integer) from public, anon;
revoke all on function public.sup_justificar(bigint, text) from public, anon;
revoke all on function public.sup_deshacer(bigint) from public, anon;
revoke all on function public.sup_asistido(bigint) from public, anon;
revoke all on function public.sup_novedad(bigint, text) from public, anon;
revoke all on function public.sup_aviso(bigint) from public, anon;
revoke all on function public.sup_marca(bigint, text) from public, anon;
grant execute on function public.sup_resolver(bigint, text, integer) to authenticated;
grant execute on function public.sup_justificar(bigint, text) to authenticated;
grant execute on function public.sup_deshacer(bigint) to authenticated;
grant execute on function public.sup_asistido(bigint) to authenticated;
grant execute on function public.sup_novedad(bigint, text) to authenticated;
grant execute on function public.sup_aviso(bigint) to authenticated;
grant execute on function public.sup_marca(bigint, text) to authenticated;
