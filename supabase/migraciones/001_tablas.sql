-- Plataforma de trabajo: tablas.
-- Todo vive en el esquema `dem`, que la API no expone. La aplicación solo entra por las funciones de `public`,
-- y cada una revisa quién llama y qué rol tiene.
-- Los horarios de los turnos van en minutos desde las 00:00 del día en que empieza el tramo (igual que en src/logica.js);
-- las marcas reales se guardan como instantes y se convierten a esos minutos al leerlas.

create schema if not exists dem;
revoke all on schema dem from public;

create table dem.config (
  id boolean primary key default true check (id),
  p jsonb not null,                       -- reglas del semáforo, topes y recargos (S.P en la aplicación)
  ref jsonb not null,                     -- valores sugeridos al cargar una asignación nueva
  clave_inicial text,                     -- clave genérica de las altas; la define administración
  instalacion_hash text,                  -- código de primera configuración (solo su huella)
  instalacion_vence timestamptz,
  generado_hasta date,                    -- último día con turnos generados
  asegurado timestamptz
);
insert into dem.config (p, ref) values (
  '{"gracia":5,"rojo":15,"margen":15,"topeFijo":8,"topeHora":10,"traslado":30,"recFeriado":100,"recNoLab":0}',
  '{"hora":6500,"fijo":950000}'
);

create table dem.personas (
  id integer generated always as identity primary key,
  auth_id uuid unique references auth.users (id) on delete set null,
  dni text not null unique check (dni ~ '^[0-9]{6,9}$'),
  nombre text not null check (length(btrim(nombre)) between 1 and 30),
  apellido text not null default '' check (length(apellido) <= 40),
  rol text not null default 'colaborador' check (rol in ('colaborador', 'supervisor', 'admin')),
  activa boolean not null default true,
  debe_cambiar_clave boolean not null default true,
  clave_cambiada timestamptz,
  ultimo_uso timestamptz,
  creada timestamptz not null default now()
);

create table dem.sedes (
  id integer generated always as identity primary key,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  direccion text not null default '' check (length(direccion) <= 160),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  radio_m integer not null default 150 check (radio_m between 30 and 2000),
  -- pantalla: código que rota en una pantalla de la sede; impreso: QR fijo pegado en la sede; ubicacion: solo ubicación
  verificacion text not null default 'pantalla' check (verificacion in ('pantalla', 'impreso', 'ubicacion')),
  secreto bytea not null default extensions.gen_random_bytes(20),
  codigo_fijo text not null default encode(extensions.gen_random_bytes(9), 'hex'),
  activa boolean not null default true,
  creada timestamptz not null default now(),
  check ((lat is null) = (lon is null))
);

create table dem.pantallas (
  id integer generated always as identity primary key,
  sede_id integer not null references dem.sedes (id) on delete cascade,
  token_hash text not null unique,
  nombre text not null default '' check (length(nombre) <= 60),
  creada timestamptz not null default now(),
  vista timestamptz,
  revocada boolean not null default false
);

create table dem.vinculos (
  codigo_hash text primary key,
  sede_id integer not null references dem.sedes (id) on delete cascade,
  vence timestamptz not null,
  creado_por integer references dem.personas (id) on delete set null
);

create table dem.asignaciones (
  id integer generated always as identity primary key,
  persona_id integer not null references dem.personas (id),
  sede_id integer not null references dem.sedes (id),
  dias smallint[] not null check (dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(dias) between 1 and 7),
  ti smallint not null check (ti between 0 and 1439),
  tf smallint not null,
  modalidad text not null check (modalidad in ('fijo', 'hora')),
  valor integer not null check (valor > 0),
  activa boolean not null default true,
  desde date,
  hasta date,
  creada timestamptz not null default now(),
  modificada timestamptz not null default now(),   -- último cambio de días, horario, sede, vigencia o estado
  check (tf > ti and tf - ti <= 1440),
  check (desde is null or hasta is null or hasta >= desde)
);
create index on dem.asignaciones (persona_id);

create table dem.franjas (
  id integer generated always as identity primary key,
  sede_id integer not null references dem.sedes (id) on delete cascade,
  dias smallint[] not null check (dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(dias) between 1 and 7),
  ti smallint not null check (ti between 0 and 1439),
  tf smallint not null,
  dot smallint not null check (dot between 1 and 30),
  check (tf > ti and tf - ti <= 1440)
);

create table dem.licencias (
  id integer generated always as identity primary key,
  persona_id integer not null references dem.personas (id) on delete cascade,
  tipo text not null check (tipo in ('vacaciones', 'licencia', 'franco')),
  desde date not null,
  hasta date not null,
  check (hasta >= desde)
);
create index on dem.licencias (persona_id, desde);

create table dem.feriados (
  f date primary key,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  tipo text not null check (tipo in ('feriado', 'no_laborable')),
  nota text not null default '',
  propio boolean not null default false
);

create table dem.jornadas (
  id bigint generated always as identity primary key,
  asignacion_id integer not null references dem.asignaciones (id),
  persona_id integer not null references dem.personas (id),
  sede_id integer not null references dem.sedes (id),
  f date not null,
  ti smallint not null,
  tf smallint not null,
  entrada timestamptz,
  salida timestamptz,
  -- qr, codigo, impreso y ubicacion son marcas de la propia persona; supervisor, auto y declarada, no
  metodo_in text check (metodo_in in ('qr', 'codigo', 'impreso', 'ubicacion', 'supervisor')),
  metodo_out text check (metodo_out in ('qr', 'codigo', 'impreso', 'ubicacion', 'supervisor', 'auto', 'declarada')),
  cerrada boolean not null default false,
  conf boolean not null default false,
  decl jsonb,
  rev text check (rev in ('extra', 'olvido', 'ajuste', 'ok')),
  salida_val smallint,
  justif text check (justif in ('licencia', 'vacaciones', 'aviso', 'franco')),
  licencia_id integer references dem.licencias (id) on delete set null,
  descargo text check (length(descargo) <= 280),
  unique (asignacion_id, f)
);
create index on dem.jornadas (f);
create index on dem.jornadas (persona_id, f);

create table dem.dispositivos (
  id integer generated always as identity primary key,
  persona_id integer not null references dem.personas (id) on delete cascade,
  huella text not null,
  nombre text not null default '' check (length(nombre) <= 80),
  estado text not null default 'registrado' check (estado in ('registrado', 'otro', 'bloqueado')),
  alta timestamptz not null default now(),
  visto timestamptz not null default now(),
  unique (persona_id, huella)
);
create index on dem.dispositivos (huella);

-- Cada marca de entrada o salida con la evidencia que la respalda.
create table dem.marcas (
  id bigint generated always as identity primary key,
  jornada_id bigint not null references dem.jornadas (id) on delete cascade,
  persona_id integer not null references dem.personas (id),
  tipo text not null check (tipo in ('entrada', 'salida')),
  momento timestamptz not null,
  via text not null check (via in ('qr', 'codigo', 'impreso', 'ubicacion', 'supervisor', 'declarada')),
  lat double precision,
  lon double precision,
  precision_m real,
  distancia_m real,
  geo text not null check (geo in ('ok', 'lejos', 'imprecisa', 'sin_dato', 'sin_sede')),
  dispositivo_id integer references dem.dispositivos (id) on delete set null,
  dispositivo text not null check (dispositivo in ('registrado', 'nuevo', 'otro', 'compartido', 'sin_dato')),
  comparte_con integer references dem.personas (id) on delete set null,
  autor_id integer references dem.personas (id) on delete set null,
  revisada boolean not null default false,
  anulada boolean not null default false
);
create index on dem.marcas (jornada_id);
create index on dem.marcas (momento) where not revisada;

create table dem.intentos (
  id bigint generated always as identity primary key,
  clave text not null,                    -- 'f:<persona>' para fichajes, 'v' para vinculación de pantallas, 'i' para la instalación
  momento timestamptz not null default now()
);
create index on dem.intentos (clave, momento);

create table dem.novedades (
  id bigint generated always as identity primary key,
  persona_id integer not null references dem.personas (id),
  sede_id integer references dem.sedes (id) on delete set null,
  tipo text not null check (tipo in ('infra', 'equipo', 'insumos', 'otra')),
  crit text not null check (crit in ('baja', 'media', 'alta')),
  texto text not null check (length(btrim(texto)) between 1 and 400),
  foto text not null default '',
  creada timestamptz not null default now(),
  estado text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'resuelta'))
);

create table dem.bitacora (
  id bigint generated always as identity primary key,
  creada timestamptz not null default now(),
  tipo text not null check (tipo in ('rev', 'justif', 'asistido', 'marca')),
  jornada_id bigint references dem.jornadas (id) on delete cascade,
  texto text not null,
  autor_id integer references dem.personas (id) on delete set null
);

create table dem.avisos (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  texto text not null
);

-- Registro de cada cambio de administración: quién, cuándo y qué.
create table dem.cambios (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  autor_id integer references dem.personas (id) on delete set null,
  que text not null,
  datos jsonb
);

-- Nadie entra directo a las tablas: seguridad por fila activada y sin políticas.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'dem' loop
    execute format('alter table dem.%I enable row level security', t);
  end loop;
end $$;

insert into dem.feriados (f, nombre, tipo, nota) values
  ('2026-11-23', 'Día de la Soberanía Nacional', 'feriado', 'Trasladado del 20 de noviembre'),
  ('2026-12-07', 'Día no laborable con fines turísticos', 'no_laborable', ''),
  ('2026-12-08', 'Inmaculada Concepción de María', 'feriado', ''),
  ('2026-12-25', 'Navidad', 'feriado', ''),
  ('2027-01-01', 'Año Nuevo', 'feriado', ''),
  ('2027-02-08', 'Carnaval', 'feriado', ''),
  ('2027-02-09', 'Carnaval', 'feriado', ''),
  ('2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'feriado', ''),
  ('2027-03-25', 'Jueves Santo', 'no_laborable', ''),
  ('2027-03-26', 'Viernes Santo', 'feriado', ''),
  ('2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'feriado', ''),
  ('2027-05-01', 'Día del Trabajador', 'feriado', ''),
  ('2027-05-25', 'Día de la Revolución de Mayo', 'feriado', ''),
  ('2027-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'feriado', ''),
  ('2027-06-21', 'Paso a la Inmortalidad del General Martín Miguel de Güemes', 'feriado', 'Trasladado del 17 de junio'),
  ('2027-07-09', 'Día de la Independencia', 'feriado', ''),
  ('2027-08-16', 'Paso a la Inmortalidad del General José de San Martín', 'feriado', 'Trasladado del 17 de agosto'),
  ('2027-10-11', 'Día del Respeto a la Diversidad Cultural', 'feriado', 'Trasladado del 12 de octubre'),
  ('2027-11-20', 'Día de la Soberanía Nacional', 'feriado', 'Cae sábado: puede cambiar de fecha si sale una norma'),
  ('2027-12-08', 'Inmaculada Concepción de María', 'feriado', ''),
  ('2027-12-25', 'Navidad', 'feriado', '');
