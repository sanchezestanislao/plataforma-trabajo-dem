# Plataforma de trabajo

Sistema de gestión para una empresa de limpieza y mantenimiento: fichaje del personal por sede, control de
jornadas con semáforo, novedades, cronograma de cobertura, licencias, feriados y preliquidación.

**Estado: prototipo.** Funciona con datos de ejemplo guardados en el navegador de quien lo abre. Todavía no
tiene usuarios ni base de datos reales, y el QR y la ubicación están simulados. No cargar datos de personas.

## Qué hay en cada carpeta

| Carpeta | Contenido |
| --- | --- |
| `src/` | Las fuentes: plantilla, estilos, reglas (`logica.js`), pantallas (`vistas.js`) y lo que hace instalable al sitio (`sitio.js`, `sw.js`, `manifest.webmanifest`, tipografía). |
| `sitio/` | Lo que se publica. Lo genera `armar.py`: no se edita a mano. |
| `pruebas/` | Pruebas automáticas de las reglas, del recorrido completo y de la instalación. |

## Cómo se arma

```
python3 armar.py
```

Genera `sitio/` y también `index.html` en la raíz, que es la misma aplicación en un solo archivo para verla
como artefacto en Claude (ese archivo no se sube). Pide Python 3. Con Pillow instalado (`pip install pillow`)
vuelve a dibujar los íconos; sin Pillow conserva los que ya están.

Después de cambiar algo en `src/` hay que armar de nuevo y subir `sitio/` junto con las fuentes.

## Cómo se prueba

```
node pruebas/logica.test.js     # reglas: semáforo, turnos de noche, feriados, topes, cobertura
node pruebas/navegador.js       # recorrido completo en el navegador, sobre el archivo único
node pruebas/sitio.js           # sitio servido por HTTP: instalación y uso sin conexión
```

Las dos últimas usan [Playwright](https://playwright.dev) y Chrome. Si Chrome no está en `/usr/bin/google-chrome`,
indicar la ruta con la variable `CHROME`. Para repetir el recorrido completo sobre el sitio publicado o servido
en local, pasar su dirección: `SITIO_URL=http://localhost:8765/ node pruebas/navegador.js`.

## Cómo se publica

En cualquier hosting de archivos estáticos, con estos dos datos:

- Carpeta de salida: `sitio`
- Comando de armado: ninguno

Lo que está en la rama `main` es lo que queda publicado. El sitio pide conexión segura (HTTPS), que es lo que
permite instalarlo en el teléfono y, más adelante, usar cámara y ubicación.

## Qué sigue

1. Usuarios con permisos por rol y base de datos.
2. Fichaje real: QR de la sede que cambia cada día, ubicación del teléfono y hora tomada del servidor.
3. Piloto en una sede.

## Licencias de terceros

La tipografía Overpass se distribuye bajo SIL Open Font License 1.1 (`src/tipografia/LICENCIA-Overpass.txt`).
