# Plataforma de trabajo

Sistema de gestión para una empresa de limpieza y mantenimiento: fichaje verificado del personal por sede, control
de jornadas con semáforo, novedades, cronograma de cobertura, licencias, feriados y preliquidación.

De las mismas fuentes salen dos versiones:

- **La real**, la que se publica. Cada persona ingresa con su DNI y su clave, los datos se guardan en el servidor y
  el fichaje se verifica con el código de la sede, la ubicación y el teléfono.
- **La demo**, un solo archivo con datos de ejemplo que se guardan en el navegador. Sirve para mostrar el recorrido
  sin cuentas ni servidor.

## Qué hay en cada carpeta

| Carpeta | Contenido |
| --- | --- |
| `src/` | Las fuentes: plantilla, estilos, reglas (`logica.js`), pantallas (`vistas.js`), todo lo que habla con el servidor (`real.js`) y lo que hace instalable al sitio (`sitio.js`, `sw.js`, `manifest.webmanifest`, tipografía). |
| `sitio/` | La versión real, lista para publicar. La genera `armar.py`: no se edita a mano. |
| `supabase/` | La base de datos: `migraciones/` (tablas y funciones, en orden), `pruebas/` y `config.json` (dirección del proyecto y llave pública). |
| `pruebas/` | Pruebas automáticas de las reglas, de la demo, de la versión real y de la instalación, y el servidor de pruebas. |

## Cómo se arma

```
python3 armar.py
```

Genera `sitio/` y también `index.html` en la raíz, que es la demo en un solo archivo para verla como artefacto en
Claude (ese archivo no se sube). Pide Python 3. Con Pillow instalado (`pip install pillow`) vuelve a dibujar los
íconos; sin Pillow conserva los que ya están.

Después de cambiar algo en `src/` hay que armar de nuevo y subir `sitio/` junto con las fuentes.

## Cómo se prueba

```
node pruebas/logica.test.js     # reglas: semáforo, turnos de noche, feriados, topes, cobertura
node pruebas/navegador.js       # la demo, recorrida en el navegador
node pruebas/real.js            # la versión real, recorrida en el navegador contra el servidor de pruebas
node pruebas/sitio.js           # instalación, arranque sin conexión y cabeceras del hosting
```

Las tres últimas usan [Playwright](https://playwright.dev) y Chrome. Si Chrome no está en `/usr/bin/google-chrome`,
indicar la ruta con la variable `CHROME`.

`pruebas/real.js` no toca la base de verdad: levanta `pruebas/servidor-falso.js`, que contesta igual que el servidor
real con los datos en memoria. Ese mismo servidor sirve para mirar la versión real en la computadora:

```
node pruebas/servidor-falso.js
```

Muestra la dirección para abrir y un código de primera configuración de prueba.

La base tiene su propia prueba, `supabase/pruebas/base.sql`: un solo bloque que crea datos, recorre los casos y
deshace todo al terminar.

## Cómo se publica

En cualquier hosting de archivos estáticos, con estos dos datos:

- Carpeta de salida: `sitio`
- Comando de armado: ninguno

Lo que está en la rama `main` es lo que queda publicado. El sitio pide conexión segura (HTTPS): sin ella el teléfono
no deja usar la cámara ni la ubicación, ni instalar la aplicación.

## Cómo se pone en marcha

1. Quien administra el sistema genera un **código de primera configuración**, que sirve una sola vez.
2. Con ese código, el dueño abre el sitio y crea la cuenta de administración con su DNI y una clave.
3. En Administración: carga las sedes con su ubicación, define la clave inicial, da de alta a las personas y carga
   las asignaciones.
4. En cada sede que use pantalla: Administración pide un código de vinculación, y en la tablet o computadora de la
   sede se abre el sitio terminado en `#pantalla` y se escribe ese código.

## Cómo se verifica un fichaje

Cada sede elige una de tres formas:

- **Pantalla en la sede** (la recomendada). Muestra un QR y un código de seis números que cambian cada 30 segundos.
  La persona lee el QR o escribe el código. Una foto del código deja de servir en menos de un minuto y medio.
- **QR impreso**. Siempre el mismo. Sirve donde no se puede dejar una pantalla, pero una foto del cartel también
  funciona: por eso pesa más lo que sigue.
- **Solo ubicación**. El fichaje se acepta si el teléfono está dentro del radio de la sede.

En los tres casos el servidor pone la hora y guarda la ubicación del teléfono y qué teléfono fue. Fichar lejos de la
sede, desde un teléfono que no es el habitual o desde el de otra persona no bloquea: queda en «Fichajes para revisar»
y supervisión lo da por bueno o lo anula.

## Seguridad

- Las tablas viven en un esquema que la API no expone. La aplicación solo puede llamar a funciones, y cada función
  revisa quién llama y qué rol tiene. El asesor de seguridad de Supabase avisa que esas funciones corren con permisos
  propios (`SECURITY DEFINER`): es a propósito, son la única puerta de entrada.
- Las cuentas se crean solo desde Administración. El DNI se guarda en el servicio de ingreso como una dirección que
  no existe, así que nunca se manda un correo y nadie puede pedir una clave nueva por mail.
- El sitio publicado solo acepta código de sus propios archivos y solo puede hablar con su servidor de datos
  (cabeceras en `sitio/_headers`).
- `supabase/config.json` lleva la llave pública, que está pensada para ir en la aplicación. Las llaves privadas del
  proyecto no van en este repositorio.

## Qué falta

- Fotos en las novedades.
- Fichaje sin conexión: hoy, sin señal, la persona pide el fichaje asistido a su supervisor.
- Lector de QR propio en iPhone: hoy escribe el código de seis números o usa la cámara del teléfono.
- Selector de mes y exportación en la preliquidación, y carga manual de horas por supervisión.
- Definiciones del negocio: liquidación de lo fijo según convenio, valor de la hora extra, descuento por inasistencia
  y pago del traslado entre sedes.

## Licencias de terceros

- La tipografía Overpass se distribuye bajo SIL Open Font License 1.1 (`src/tipografia/LICENCIA-Overpass.txt`).
- El generador de QR es `qrcode-generator` de Kazuhiko Arase, bajo licencia MIT (`src/terceros/qrcode-generator.js`).
