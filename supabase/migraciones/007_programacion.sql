-- Cada diez minutos la base pone el día al día aunque nadie tenga la aplicación abierta:
-- genera los turnos, registra las inasistencias cuando termina un turno y cierra lo que quedó abierto.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule('dem-asegurar', '*/10 * * * *', $job$select dem.asegurar(true)$job$);
