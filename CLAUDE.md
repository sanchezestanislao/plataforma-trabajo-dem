# Plataforma de trabajo

Sistema de gestión de una empresa de limpieza y mantenimiento de Mendoza, Argentina: fichaje verificado del personal
por sede, control de jornadas con semáforo, novedades, cronograma de cobertura, licencias, feriados y preliquidación.
Hay dos versiones que salen de las mismas fuentes: la real, que se publica en desarrollo.site y guarda los datos en
Supabase, y una demo con datos de ejemplo. El dueño no es programador: explicar cada cambio por lo que ve la persona
que usa la aplicación, no por el código.

## Comandos

- Armar: `python3 armar.py`. Genera `sitio/` (la versión real, lo que publica el hosting) e `index.html` (la demo en un
  solo archivo, para el artefacto de Claude; no se sube). Correrlo después de cualquier cambio en `src/` y subir `sitio/`
  con las fuentes.
- Reglas: `node pruebas/logica.test.js`
- Demo en el navegador: `node pruebas/navegador.js` (Playwright y Chrome; `CHROME` cambia la ruta)
- Versión real en el navegador: `node pruebas/real.js` (contra el servidor de pruebas; no toca Supabase)
- Instalación, arranque sin conexión y cabeceras del hosting: `node pruebas/sitio.js`
- Base de datos: `supabase/pruebas/base.sql` es un solo bloque que se corre con el conector de Supabase y deshace todo
  lo que hizo; el resultado llega en el mensaje de error final.
- Para mirar la versión real en esta computadora: `node pruebas/servidor-falso.js` y abrir la dirección que muestra.

Antes de subir un cambio tienen que pasar las cuatro pruebas de `pruebas/`.

## Cómo está hecho

- JavaScript sin framework. La única pieza de terceros es el generador de QR de `src/terceros/`.
- `src/logica.js`: reglas, datos de ejemplo y acciones, sin tocar el DOM. Se prueba en Node y es la referencia de las reglas.
- `src/vistas.js`: dibuja con plantillas y delega los eventos por atributos (`data-a`, `data-form`, `data-draft`).
  `REAL` vale true en el sitio publicado, donde existe `CONFIG`, y false en la demo.
- `src/real.js`: solo la versión real. Ingreso con DNI, llamadas al servidor, fichaje (código, QR, ubicación y teléfono),
  pantalla de la sede (`#pantalla`), personas y sedes. Cada cambio corre primero sobre una copia del estado con las
  reglas de `logica.js`, después va al servidor, y la pantalla se vuelve a dibujar con el estado que el servidor devuelve.
- `src/plantilla.html`: lo que va entre `<!--DEMO-->` y `<!--/DEMO-->` es solo de la demo; lo que va dentro de
  `<!--REAL … REAL-->`, solo de la versión real.
- `src/sitio.js`, `src/sw.js`, `src/manifest.webmanifest`: instalación en el teléfono y arranque sin conexión.
- `supabase/migraciones/`: la base. Todo vive en el esquema `dem`, que la API no expone. La aplicación solo llama a las
  funciones de `public`, y cada una revisa quién llama y con qué rol. Los errores que se le muestran a la persona salen
  con código `DEM01`; `DEM02` es sin sesión o de baja, `DEM03` falta cambiar la clave inicial y `DEM04` sin permiso.
- `supabase/config.json`: dirección del proyecto y llave pública. Ahí nunca va una llave privada.
- `pruebas/servidor-falso.js`: copia de trabajo de las funciones de la base, con los datos en memoria. Si cambia una
  función en `supabase/migraciones/`, se cambia también ahí.
- `sitio/` es salida de `armar.py`: no se edita a mano.
- Los horarios de los turnos se guardan en minutos desde las 00:00 del día en que empieza el tramo. Un turno de noche
  termina pasado el minuto 1440 y pertenece al día en que empezó. Las marcas reales se guardan como instantes y se
  convierten a esos minutos, en hora de Mendoza, al leerlas.

## Reglas del negocio ya decididas

- La modalidad de pago (fijo o por hora) va en la asignación, que es una persona en una sede. Una sola asignación
  por sede: el tiempo de más en la misma sede es hora extra.
- Semáforo por tramo: verde (correcto), amarillo (llegó o salió tarde), rojo (inasistencia o demora mayor a
  15 minutos), estrella (hora extra verificada por el supervisor). Los umbrales están en `S.P`.
- El tiempo de más que supera el margen abre un control excedente, que resuelve el supervisor: hora extra u
  olvido de marcar la salida. Hasta que se resuelve no suma horas.
- Se trabaja todos los días, las 24 horas. Los feriados se trabajan y se distinguen en la liquidación. Recargo
  sugerido para el pago por hora: 100 % en feriado nacional y 0 % en día no laborable, editable. Lo fijo se
  liquida según convenio y está sin definir.
- Topes diarios: 8 h en asignaciones fijas y 10 h para quien trabaja por hora. Se pueden cambiar; cambiarlos o
  superarlos avisa al supervisor y no bloquea la carga.
- Cierre de jornada con mensaje alentador y confirmación de horas por el propio colaborador.
- Ingreso con DNI y clave. Administración da de alta a cada persona con una clave inicial común, que la persona
  tiene que cambiar en su primer ingreso. Roles: colaborador, supervisión y administración.
- Fichaje verificado. Cada sede elige cómo: un código que cambia cada 30 segundos en una pantalla de la sede (lo
  recomendado), un QR impreso fijo o solo la ubicación. Siempre se guardan la hora del servidor, la ubicación y el
  teléfono. Fichar lejos de la sede, desde otro teléfono o desde el teléfono de otra persona no bloquea: queda en
  «Fichajes para revisar» para que supervisión lo dé por bueno o lo anule.
- Un turno sin entrada pasa a inasistencia cuando termina. Con entrada y sin salida, el sistema lo cierra solo seis
  horas después del fin del turno y la persona declara a qué hora terminó.
- El valor de una asignación nueva no trae números de ejemplo: se propone el último cargado para esa modalidad.

## Convenciones

- Texto de la interfaz en español rioplatense, con voseo, frases cortas y sin jerga técnica. El personal usa
  teléfonos modestos: la vista del colaborador tiene que seguir siendo liviana y simple.
- Diseño: tipografía Overpass, acento cobalto, y el semáforo siempre como luces sobre una carcasa oscura. Los
  colores y medidas salen de las variables de `:root` en `src/estilos.css`.
- Cada regla nueva lleva su prueba en `pruebas/logica.test.js`. Cada flujo nuevo lleva su paso en
  `pruebas/navegador.js` si es de la demo o en `pruebas/real.js` si es de la versión real.
- Cada cambio en la base es un archivo nuevo en `supabase/migraciones/`, aplicado con el conector. Supabase le pide
  confirmación al dueño cuando el SQL borra algo o cambia filas en masa: avisarle antes y juntar esos cambios en uno.
- Desde la API, Supabase rechaza cualquier UPDATE o DELETE sin WHERE. En `dem.config`, que tiene una sola fila, usar
  `where id`.
- Nunca cargar datos de personas reales para probar. Las pruebas usan el servidor de pruebas o cuentas descartables
  que se borran al terminar.

## Pendiente

- Fotos en las novedades, fichaje sin conexión, lector de QR propio para iPhone (hoy escribe el código o usa la cámara
  del teléfono), selector de mes y exportación en la preliquidación, carga manual de horas por supervisión.
- Supervisión recibe todos los turnos del mes en cada actualización: cuando haya mucho personal conviene mandar solo
  los cambios.
- Por definir con el dueño: liquidación de lo fijo según convenio, valor de la hora extra, descuento por
  inasistencia y pago del traslado entre sedes.
- Antes de cargar a todo el personal: consulta legal por el uso de DNI y ubicación, y pasar Supabase a un plan pago
  (el gratuito pausa el proyecto si pasa una semana sin uso).
