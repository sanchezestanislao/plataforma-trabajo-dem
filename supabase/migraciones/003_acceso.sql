-- Ingreso con DNI y clave.
-- Las cuentas viven en el servicio de ingreso de Supabase (auth). El DNI se guarda ahí como una dirección
-- que no existe (<dni>@dni.invalid): nunca se manda un correo y nadie puede pedir una clave nueva por mail.

-- Guardia: en auth.users solo se crean cuentas desde estas funciones, y nadie cambia su correo ni pide
-- enlaces de recuperación por fuera de administración.
create function dem.auth_guardia() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('dem.alta', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Las cuentas se crean desde administración.';
  end if;
  if new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or (coalesce(new.recovery_token, '') <> '' and new.recovery_token is distinct from old.recovery_token)
     or (coalesce(new.confirmation_token, '') <> '' and new.confirmation_token is distinct from old.confirmation_token)
     or (coalesce(new.email_change_token_new, '') <> '' and new.email_change_token_new is distinct from old.email_change_token_new)
     or (coalesce(new.email_change_token_current, '') <> '' and new.email_change_token_current is distinct from old.email_change_token_current)
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change)
  then
    raise exception 'Este cambio se hace desde administración.';
  end if;
  return new;
end $$;

create trigger dem_guardia before insert or update on auth.users
  for each row execute function dem.auth_guardia();

create function dem.crear_acceso(p_dni text, p_clave text) returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_correo text := p_dni || '@dni.invalid';
begin
  perform set_config('dem.alta', '1', true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_correo,
      extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
      jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true, 'phone_verified', false),
      now(), now(), now());
  perform set_config('dem.alta', '', true);
  return v_id;
end $$;

create function dem.cerrar_sesiones(p_auth uuid) returns void language plpgsql set search_path = '' as $$
begin
  delete from auth.refresh_tokens where user_id = p_auth::text;
  delete from auth.sessions where user_id = p_auth;
end $$;

-- Pone una clave y cierra las sesiones abiertas de esa cuenta.
create function dem.poner_clave(p_auth uuid, p_clave text) returns void language plpgsql set search_path = '' as $$
begin
  update auth.users set encrypted_password = extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_auth;
  perform dem.cerrar_sesiones(p_auth);
end $$;

-- Corrige el DNI de una cuenta: es el dato con el que la persona ingresa.
create function dem.cambiar_dni(p_auth uuid, p_dni text) returns void language plpgsql set search_path = '' as $$
declare v_correo text := p_dni || '@dni.invalid';
begin
  perform set_config('dem.alta', '1', true);
  update auth.users set email = v_correo, updated_at = now() where id = p_auth;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_correo), updated_at = now()
   where user_id = p_auth and provider = 'email';
  perform set_config('dem.alta', '', true);
end $$;

-- ¿Ya hay alguien con rol de administración? La pantalla de ingreso lo usa para ofrecer la primera configuración.
create function public.instalacion() returns jsonb language sql stable security definer set search_path = '' as
$$ select jsonb_build_object('instalada', exists (select 1 from dem.personas where rol = 'admin')) $$;

-- Primera configuración: crea la cuenta de administración. Solo funciona mientras no exista ninguna
-- y con el código de un solo uso que se entrega al dueño.
create function public.instalar(p_codigo text, p_dni text, p_nombre text, p_apellido text, p_clave text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c dem.config;
  v_dni text := regexp_replace(coalesce(p_dni, ''), '[^0-9]', '', 'g');
  v_cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_apellido text := btrim(coalesce(p_apellido, ''));
  v_auth uuid;
  n integer;
begin
  perform pg_advisory_xact_lock(74120012);
  if exists (select 1 from dem.personas where rol = 'admin') then
    perform dem.error('La plataforma ya está configurada. Ingresá con tu DNI y tu clave.');
  end if;
  select count(*) into n from dem.intentos where clave = 'i' and momento > now() - interval '15 minutes';
  if n >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
  end if;
  select * into c from dem.config;
  if c.instalacion_hash is null or c.instalacion_vence is null or c.instalacion_vence < now()
     or v_cod = '' or c.instalacion_hash <> dem.huella(v_cod) then
    insert into dem.intentos (clave) values ('i');
    return jsonb_build_object('ok', false, 'error', 'El código de configuración no es válido o ya venció.');
  end if;
  if v_dni !~ '^[0-9]{6,9}$' then perform dem.error('Escribí tu DNI solo con números, sin puntos.'); end if;
  if v_nombre = '' or length(v_nombre) > 30 or length(v_apellido) > 40 then perform dem.error('Revisá tu nombre y apellido.'); end if;
  if length(coalesce(p_clave, '')) < 8 or length(p_clave) > 72 then perform dem.error('La clave tiene que tener al menos 8 caracteres.'); end if;

  v_auth := dem.crear_acceso(v_dni, p_clave);
  insert into dem.personas (auth_id, dni, nombre, apellido, rol, debe_cambiar_clave, clave_cambiada)
  values (v_auth, v_dni, v_nombre, v_apellido, 'admin', false, now());
  update dem.config set instalacion_hash = null, instalacion_vence = null, generado_hasta = dem.hoy() - 1 where id;
  return jsonb_build_object('ok', true);
end $$;

-- Después de cambiar la clave inicial: confirma que ya no es la genérica y habilita el resto de la aplicación.
create function public.clave_cambiada() returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r dem.personas := dem.yo(true);
  v_hash text;
  v_ini text;
begin
  select encrypted_password into v_hash from auth.users where id = r.auth_id;
  select clave_inicial into v_ini from dem.config;
  if v_ini is not null and v_hash is not null and extensions.crypt(v_ini, v_hash) = v_hash then
    perform dem.error('Elegí una clave distinta de la inicial.');
  end if;
  update dem.personas set debe_cambiar_clave = false, clave_cambiada = now() where id = r.id returning * into r;
  perform dem.asegurar(false);
  return jsonb_build_object('ok', true, 'estado', dem.estado_de(r));
end $$;

revoke all on function public.instalacion() from public;
revoke all on function public.instalar(text, text, text, text, text) from public;
revoke all on function public.clave_cambiada() from public, anon;
grant execute on function public.instalacion() to anon, authenticated;
grant execute on function public.instalar(text, text, text, text, text) to anon, authenticated;
grant execute on function public.clave_cambiada() to authenticated;
