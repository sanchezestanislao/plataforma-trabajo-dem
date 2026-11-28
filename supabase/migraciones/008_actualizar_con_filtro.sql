-- La API de Supabase rechaza cualquier UPDATE sin WHERE, también dentro de las funciones.
-- Los cuatro cambios sobre la fila única de configuración pasan a llevar su filtro.
-- (Los archivos 002, 003 y 006 ya tienen el texto corregido; esta migración corrige una base creada antes.)
do $$
declare
  f record;
  def text;
begin
  for f in
    select pg_get_functiondef(p.oid) as d
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname, p.proname) in (('dem', 'asegurar'), ('public', 'instalar'), ('public', 'admin_aplicar'), ('public', 'admin_clave_inicial'))
  loop
    def := f.d;
    def := replace(def, 'asegurado = v_ahora;', 'asegurado = v_ahora where id;');
    def := replace(def, 'generado_hasta = dem.hoy() - 1;', 'generado_hasta = dem.hoy() - 1 where id;');
    def := replace(def, 'set p = v_p;', 'set p = v_p where id;');
    def := replace(def, 'set clave_inicial = p_clave;', 'set clave_inicial = p_clave where id;');
    execute def;
  end loop;
end $$;
