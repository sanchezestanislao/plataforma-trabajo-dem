-- Sin valores de ejemplo: el valor de cada asignación lo escribe administración, y la aplicación propone
-- el último que se cargó para esa modalidad (valorSugerido, en src/logica.js).
update dem.config set ref = '{"hora":0,"fijo":0}'::jsonb where id;

-- La extensión http se instaló solo para probar la API desde adentro de la base. No la usa ninguna función.
drop extension if exists http;
